import time

def test_public_dashboard_privacy(client):
    """Verify public endpoints expose ZERO personal citizen identity data."""
    res = client.get("/api/public/stats")
    assert res.status_code == 200
    stats = res.json()
    assert "total_incidents" in stats
    assert "resolution_rate_percentage" in stats
    # Assert no PII fields exist
    assert "citizen_name" not in stats
    assert "user_id" not in stats
    assert "phone" not in stats
    assert "email" not in stats

    map_res = client.get("/api/public/map-incidents")
    assert map_res.status_code == 200
    incidents = map_res.json()
    assert len(incidents) > 0
    for inc in incidents:
        assert "incident_code" in inc
        assert "latitude" in inc
        assert "longitude" in inc
        # Zero PII
        assert "user_id" not in inc
        assert "citizen_name" not in inc
        assert "phone" not in inc

def test_temporal_filtering_dashcam(client):
    """
    Test that multiple consecutive frames within 2.5s and 15m trigger
    TEMPORAL_SUPPRESSED without creating new incidents.
    """
    # 1. Login citizen
    login_res = client.post("/api/auth/login", json={
        "email": "citizen.ananya@gmail.com",
        "password": "Citizen@123"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Start drive session
    start_res = client.post("/api/drive/sessions/start", json={
        "latitude": 12.9350,
        "longitude": 77.6240
    }, headers=headers)
    assert start_res.status_code == 200
    session_id = start_res.json()["id"]

    # 3. Process Frame 101 (first detection)
    frame1 = client.post("/api/drive/process-frame", json={
        "session_id": session_id,
        "timestamp_ms": int(time.time() * 1000),
        "latitude": 12.93500,
        "longitude": 77.62400,
        "category": "Pothole",
        "confidence": 0.88,
        "bbox": [100.0, 150.0, 250.0, 300.0]
    }, headers=headers)
    assert frame1.status_code == 200
    f1_data = frame1.json()
    assert f1_data["status"] == "EVENT_LOGGED"
    assert f1_data["session_detections_count"] == 1

    # 4. Process Frame 102 immediately (0.2s later, 2 meters away)
    frame2 = client.post("/api/drive/process-frame", json={
        "session_id": session_id,
        "timestamp_ms": int(time.time() * 1000) + 200,
        "latitude": 12.93502,
        "longitude": 77.62402,
        "category": "Pothole",
        "confidence": 0.91,
        "bbox": [105.0, 152.0, 255.0, 302.0]
    }, headers=headers)
    assert frame2.status_code == 200
    f2_data = frame2.json()
    # Should be TEMPORAL_SUPPRESSED!
    assert f2_data["status"] == "TEMPORAL_SUPPRESSED"
    # Detections count should still be 1!
    assert f2_data["session_detections_count"] == 1

    # 5. End drive session
    end_res = client.post("/api/drive/sessions/end", json={
        "session_id": session_id,
        "distance_km": 3.2
    }, headers=headers)
    assert end_res.status_code == 200
    assert end_res.json()["status"] == "COMPLETED"
