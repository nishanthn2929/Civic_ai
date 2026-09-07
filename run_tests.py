import sys
import time
import uuid
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.database import SessionLocal
from backend.app.models.models import Incident, User
from backend.app.services.gis_service import gis_service
from backend.app.services.duplicate_engine import duplicate_engine
from backend.app.services.ai_cv import cv_service

def test_suite():
    passed = 0
    failed = 0
    client = TestClient(app)

    def run_test(name, test_func):
        nonlocal passed, failed
        try:
            test_func()
            print(f"  [PASS] {name}")
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {name}: {e}")
            failed += 1

    print("\n================ BENGALURU CIVIC AI PLATFORM TEST SUITE ================")

    print("\n--- 1. GIS & Bengaluru Ward Point-in-Polygon Tests ---")
    def test_gis_haversine():
        lat1, lon1 = 12.935200, 77.624500
        lat2, lon2 = 12.935500, 77.624800
        dist = gis_service.haversine_distance_meters(lat1, lon1, lat2, lon2)
        assert 30.0 < dist < 80.0, f"Distance {dist} out of expected range"
    run_test("Haversine Great Circle Distance Calculation", test_gis_haversine)

    def test_gis_koramangala():
        ward = gis_service.find_ward_by_coordinates(12.9340, 77.6250)
        assert ward["ward_name"] == "Koramangala" and ward["ward_number"] == 151 and ward["zone_name"] == "South"
    run_test("Point-in-Polygon: Koramangala Ward 151", test_gis_koramangala)

    def test_gis_hsr():
        ward = gis_service.find_ward_by_coordinates(12.9120, 77.6450)
        assert ward["ward_name"] == "HSR Layout" and ward["ward_number"] == 174 and ward["zone_name"] == "Bommanahalli"
    run_test("Point-in-Polygon: HSR Layout Ward 174", test_gis_hsr)

    def test_gis_whitefield():
        ward = gis_service.find_ward_by_coordinates(12.9700, 77.7500)
        assert "Whitefield" in ward["ward_name"] and ward["zone_name"] == "Mahadevapura"
    run_test("Point-in-Polygon: Whitefield Ward 85", test_gis_whitefield)

    print("\n--- 2. Multi-Signal Duplicate Detection Engine Tests ---")
    def test_dup_engine_match():
        db = SessionLocal()
        existing = db.query(Incident).filter(Incident.category == "Pothole").first()
        assert existing is not None, "No existing incident seeded"
        lat_nearby = existing.latitude + 0.00005
        lon_nearby = existing.longitude + 0.00005
        dup, score = duplicate_engine.find_duplicate_incident(db, "Pothole", lat_nearby, lon_nearby)
        assert dup is not None and dup.id == existing.id, "Failed to match nearby pothole"
        assert score >= duplicate_engine.threshold, f"Score {score} below threshold {duplicate_engine.threshold}"
        db.close()
    run_test("Duplicate Grouping for Spatial Proximity (<15m)", test_dup_engine_match)

    def test_dup_engine_reject():
        db = SessionLocal()
        dup, score = duplicate_engine.find_duplicate_incident(db, "Pothole", 12.9200, 77.5800)
        assert dup is None, "False duplicate detected across distant coordinates"
        db.close()
    run_test("Non-Duplicate Confirmation for Distant Wards", test_dup_engine_reject)

    print("\n--- 3. Authentication & RBAC Tests ---")
    auth_token = None
    def test_auth_workflow():
        nonlocal auth_token
        email = f"citizen.{uuid.uuid4().hex[:6]}@test.com"
        reg = client.post("/api/auth/register", json={
            "name": "Integration Tester",
            "email": email,
            "password": "Password@123",
            "phone": "+91-9988776655",
            "role": "citizen"
        })
        assert reg.status_code == 200, f"Register failed: {reg.text}"
        auth_token = reg.json()["access_token"]
        assert auth_token is not None

        me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {auth_token}"})
        assert me.status_code == 200 and me.json()["email"] == email
    run_test("Citizen Registration, Token Generation & /me Profile", test_auth_workflow)

    def test_authority_login():
        res = client.post("/api/auth/login", json={
            "email": "officer.roads@bbmp.gov.in",
            "password": "Officer@123"
        })
        assert res.status_code == 200, f"Authority login failed: {res.text}"
        assert res.json()["user"]["role"] == "authority"
    run_test("Authority Officer Login & Role Verification", test_authority_login)

    print("\n--- 4. Dashcam Drive Mode & Temporal Filtering Tests ---")
    def test_dashcam_temporal_filtering():
        headers = {"Authorization": f"Bearer {auth_token}"}
        # Start drive session
        start_res = client.post("/api/drive/sessions/start", json={
            "latitude": 12.9350,
            "longitude": 77.6240
        }, headers=headers)
        assert start_res.status_code == 200, f"Start session failed: {start_res.text}"
        session_id = start_res.json()["id"]

        # Frame 101: First detection
        t0 = int(time.time() * 1000)
        f1 = client.post("/api/drive/process-frame", json={
            "session_id": session_id,
            "timestamp_ms": t0,
            "latitude": 12.93500,
            "longitude": 77.62400,
            "category": "Pothole",
            "confidence": 0.88,
            "bbox": [100.0, 150.0, 250.0, 300.0]
        }, headers=headers)
        assert f1.status_code == 200
        assert f1.json()["status"] == "EVENT_LOGGED"
        assert f1.json()["session_detections_count"] == 1

        # Frame 102: Immediate consecutive frame (200ms later, 2m away)
        f2 = client.post("/api/drive/process-frame", json={
            "session_id": session_id,
            "timestamp_ms": t0 + 200,
            "latitude": 12.93502,
            "longitude": 77.62402,
            "category": "Pothole",
            "confidence": 0.91,
            "bbox": [102.0, 152.0, 252.0, 302.0]
        }, headers=headers)
        assert f2.status_code == 200
        # Critical test: must be TEMPORAL_SUPPRESSED and count must remain 1
        assert f2.json()["status"] == "TEMPORAL_SUPPRESSED", f"Unexpected status: {f2.json()['status']}"
        assert f2.json()["session_detections_count"] == 1

        # End session
        end_res = client.post("/api/drive/sessions/end", json={
            "session_id": session_id,
            "distance_km": 4.5
        }, headers=headers)
        assert end_res.status_code == 200 and end_res.json()["status"] == "COMPLETED"
    run_test("Dashcam Drive Mode Temporal Frame Suppression", test_dashcam_temporal_filtering)

    print("\n--- 5. Public Dashboard Privacy & Zero PII Compliance ---")
    def test_public_privacy():
        stats_res = client.get("/api/public/stats")
        assert stats_res.status_code == 200
        stats = stats_res.json()
        assert "total_incidents" in stats
        assert "user_id" not in stats and "email" not in stats and "phone" not in stats

        map_res = client.get("/api/public/map-incidents")
        assert map_res.status_code == 200
        incidents = map_res.json()
        assert len(incidents) > 0
        for inc in incidents:
            assert "user_id" not in inc and "citizen_name" not in inc and "phone" not in inc
    run_test("Public Transparency API Zero-PII Strict Enforcement", test_public_privacy)

    print("\n--- 6. Government Integration Adapter Tests ---")
    def test_govt_adapter_handoff():
        db = SessionLocal()
        inc = db.query(Incident).first()
        assert inc is not None
        admin_login = client.post("/api/auth/login", json={
            "email": "admin@bengaluru.gov.in",
            "password": "Admin@123"
        })
        adm_token = admin_login.json()["access_token"]
        handoff_res = client.get(
            f"/api/admin/government-handoff/{inc.id}",
            headers={"Authorization": f"Bearer {adm_token}"}
        )
        assert handoff_res.status_code == 200
        data = handoff_res.json()
        assert "formatted_dossier" in data
        assert "bbmp_helpline" in data
        db.close()
    run_test("Citizen-Assisted Government Handoff Dossier Generation", test_govt_adapter_handoff)

    print("\n========================================================================")
    print(f"RESULTS: {passed} PASSED, {failed} FAILED")
    print("========================================================================\n")
    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    test_suite()
