import base64
import cv2
import numpy as np
import time

def generate_test_pothole_image_base64():
    """Create a synthetic road image with a dark pothole cavity."""
    img = np.full((360, 640, 3), 100, dtype=np.uint8) # Gray asphalt
    # Draw dark pothole cavity in the lower region
    cv2.ellipse(img, (320, 260), (90, 45), 0, 0, 360, (25, 25, 25), -1)
    # Add ragged texture edges
    cv2.ellipse(img, (320, 260), (95, 48), 0, 0, 360, (50, 50, 50), 3)
    _, buf = cv2.imencode(".jpg", img)
    return f"data:image/jpeg;base64,{base64.b64encode(buf).decode('utf-8')}"

def test_drive_mode_pothole_bounding_boxes(client):
    """Verify drive mode returns bounding boxes and detection payloads."""
    # 1. Login citizen
    login_res = client.post("/api/auth/login", json={
        "email": "citizen.ananya@gmail.com",
        "password": "Citizen@123"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Start drive session
    start_res = client.post("/api/drive/sessions/start", json={
        "latitude": 12.9350,
        "longitude": 77.6240
    }, headers=headers)
    assert start_res.status_code == 200
    session_id = start_res.json()["id"]

    # 3. Process frame with synthetic pothole image
    img_b64 = generate_test_pothole_image_base64()
    frame_res = client.post("/api/drive/process-frame", json={
        "session_id": session_id,
        "timestamp_ms": int(time.time() * 1000),
        "latitude": 12.9352,
        "longitude": 77.6245,
        "gps_accuracy": 10.0,
        "speed": 35,
        "heading": 90,
        "category": "Pothole",
        "confidence": 0.50,
        "bbox": [230, 215, 410, 305],
        "image_base64": img_b64
    }, headers=headers)
    assert frame_res.status_code == 200
    data = frame_res.json()

    # Detections list must exist and contain detection items
    assert "detections" in data
    assert isinstance(data["detections"], list)
    assert len(data["detections"]) > 0

    first_det = data["detections"][0]
    assert "bbox" in first_det
    assert "normalized_bbox" in first_det
    assert "confidence" in first_det
    assert "class_name" in first_det
    assert "severity" in first_det

    # Normalized bbox coords should be in 0..1 range
    nb = first_det["normalized_bbox"]
    assert len(nb) == 4
    for coord in nb:
        assert 0.0 <= coord <= 1.0

    # 4. End session
    end_res = client.post("/api/drive/sessions/end", json={
        "session_id": session_id,
        "distance_km": 1.2
    }, headers=headers)
    assert end_res.status_code == 200
