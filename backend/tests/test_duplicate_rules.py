import json
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.database import SessionLocal
from backend.app.models.models import Incident, Report, User, UserRole, ReportStatus
from backend.app.services.duplicate_engine import duplicate_engine

client = TestClient(app)

def test_duplicate_signals_computation():
    """Verify individual signal calculation: location, category, visual, text."""
    # 1. Location signal: <8m = 1.0, 50m = 0.0, >50m = 0.0
    sim_close, d_close = duplicate_engine.compute_location_similarity(12.9352, 77.6245, 12.93524, 77.62454)
    assert sim_close >= 0.95
    assert d_close < 8.0

    sim_mid, d_mid = duplicate_engine.compute_location_similarity(12.9352, 77.6245, 12.9354, 77.6247)
    assert 0.0 < sim_mid < 1.0
    assert 15.0 < d_mid < 40.0

    sim_far, d_far = duplicate_engine.compute_location_similarity(12.9352, 77.6245, 12.9500, 77.6500)
    assert sim_far == 0.0
    assert d_far > 50.0

    # 2. Category signal
    assert duplicate_engine.compute_category_similarity("Pothole", "Pothole") == 1.0
    assert duplicate_engine.compute_category_similarity("pothole", "Road Damage") == 0.70
    assert duplicate_engine.compute_category_similarity("Pothole", "Broken Streetlight") == 0.0

    # 3. Text semantic signal
    txt1 = "Deep dangerous pothole on 80ft road near Sony World signal"
    txt2 = "Huge crater and road damage right at Sony World junction"
    txt3 = "Streetlight fused and dark at night"
    sim_similar = duplicate_engine.compute_text_similarity(txt1, txt2)
    sim_different = duplicate_engine.compute_text_similarity(txt1, txt3)
    assert sim_similar > 0.65
    assert sim_different < 0.35

    # 4. Visual embedding cosine similarity
    emb1 = [1.0, 0.0, 0.0]
    emb2 = [1.0, 0.0, 0.0]
    emb3 = [0.0, 1.0, 0.0]
    assert duplicate_engine.compare_image_embeddings(emb1, emb2) == 1.0
    assert duplicate_engine.compare_image_embeddings(emb1, emb3) == 0.0

def test_confirmed_duplicate_rule_85_percent():
    """Verify Rule 1: score >= 85% is a confirmed duplicate and links to primary report."""
    db = SessionLocal()
    # Find existing seeded incident in Koramangala
    base_inc = db.query(Incident).filter(Incident.category == "Pothole").first()
    assert base_inc is not None
    initial_count = base_inc.reports_count

    # Submit new report at virtually exact coordinates (5m away) with same category and similar text
    lat_nearby = base_inc.latitude + 0.00003
    lon_nearby = base_inc.longitude + 0.00003

    res = client.post("/api/reports/create", data={
        "category": "Pothole",
        "latitude": lat_nearby,
        "longitude": lon_nearby,
        "raw_text": f"Confirming severe road pothole near {base_inc.title}",
        "address": base_inc.address or "Koramangala, Bengaluru",
        "source": "manual"
    })
    assert res.status_code == 200
    data = res.json()

    assert data["is_duplicate"] is True
    assert data["duplicate_status"] == "CONFIRMED_DUPLICATE"
    assert data["duplicate_score"] >= 0.85
    assert data["incident_id"] == base_inc.id
    assert data["primary_report_id"] is not None
    assert data["duplicate_group_id"] is not None

    db.refresh(base_inc)
    assert base_inc.reports_count > initial_count
    assert base_inc.duplicate_count >= 1
    assert base_inc.has_duplicates is True
    db.close()

def test_check_duplicate_api_possible_duplicate():
    """Verify Rule 2: 70-84% is flagged as POSSIBLE_DUPLICATE asking for user confirmation."""
    db = SessionLocal()
    target_inc = db.query(Incident).filter(
        Incident.status.in_(["VERIFIED", "DETECTED", "IN_PROGRESS", "ASSIGNED"]),
        Incident.category == "Pothole"
    ).first()
    assert target_inc is not None

    # Coordinate ~29m offset with related text (yields 77.9% possible duplicate score)
    lat_mid = target_inc.latitude + 0.00030
    lon_mid = target_inc.longitude

    res = client.post("/api/reports/check-duplicate", data={
        "category": target_inc.category,
        "latitude": lat_mid,
        "longitude": lon_mid,
        "raw_text": "Road cavity causing vehicle bounce near the lane"
    })
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "POSSIBLE_DUPLICATE"
    assert data["action"] == "ask_confirmation"
    assert 0.70 <= data["score"] < 0.85
    assert "signals" in data
    assert data["signals"]["location"] > 0
    assert data["matched_incident"] is not None
    db.close()

def test_user_rejection_of_duplicate_forces_new_report():
    """Verify that when a citizen chooses 'No, this is a different issue', a new independent incident is created."""
    db = SessionLocal()
    base_inc = db.query(Incident).filter(Incident.category == "Pothole").first()
    assert base_inc is not None

    lat_nearby = base_inc.latitude + 0.00004
    lon_nearby = base_inc.longitude + 0.00004

    res = client.post("/api/reports/create", data={
        "category": "Pothole",
        "latitude": lat_nearby,
        "longitude": lon_nearby,
        "raw_text": "Different pothole on the opposite lane separated by median divider",
        "user_action": "force_new"
    })
    assert res.status_code == 200
    data = res.json()

    assert data["is_duplicate"] is False
    assert data["duplicate_status"] == "USER_REJECTED_DUPLICATE"
    assert data["incident_id"] != base_inc.id  # Created separate incident!
    db.close()

def test_new_report_rule_under_70_percent():
    """Verify Rule 3: score < 70% creates a fresh report and incident."""
    import uuid
    uid = uuid.uuid4().hex[:6]
    # Coordinates in distant ward where no issue exists
    res = client.post("/api/reports/create", data={
        "category": "Broken Streetlight",
        "latitude": 13.1200 + (hash(uid) % 1000) * 0.0001,
        "longitude": 77.5200 + (hash(uid) % 1000) * 0.0001,
        "raw_text": f"Streetlamp pole broken on remote northern highway #{uid}",
        "address": "Northern Highway, Bengaluru",
        "source": "manual"
    })
    assert res.status_code == 200
    data = res.json()

    assert data["is_duplicate"] is False
    assert data["duplicate_status"] == "NONE"
    assert data["incident_id"] is not None
