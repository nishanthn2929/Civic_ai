from backend.app.core.database import SessionLocal
from backend.app.models.models import Incident
from backend.app.services.duplicate_engine import duplicate_engine

def test_duplicate_engine_finds_match():
    db = SessionLocal()
    # Query an existing seeded incident in Koramangala (12.9352, 77.6245)
    existing = db.query(Incident).filter(Incident.category == "Pothole").first()
    assert existing is not None

    # Test coordinate 8 meters away with same category
    lat_nearby = existing.latitude + 0.00005
    lon_nearby = existing.longitude + 0.00005

    dup_inc, score = duplicate_engine.find_duplicate_incident(
        db=db,
        category="Pothole",
        lat=lat_nearby,
        lon=lon_nearby
    )
    assert dup_inc is not None
    assert dup_inc.id == existing.id
    assert score >= duplicate_engine.threshold
    db.close()

def test_duplicate_engine_rejects_distant_coordinates():
    db = SessionLocal()
    # Test coordinate in Jayanagar (far from Koramangala/HSR)
    lat_far = 12.9200
    lon_far = 77.5800

    dup_inc, score = duplicate_engine.find_duplicate_incident(
        db=db,
        category="Pothole",
        lat=lat_far,
        lon=lon_far
    )
    # Should not match
    assert dup_inc is None
    db.close()

def test_report_submission_api(client):
    # Submit report without image
    res = client.post("/api/reports/create", data={
        "category": "Garbage Overflow",
        "latitude": 12.9300,
        "longitude": 77.6200,
        "raw_text": "Accumulation of dry waste near street corner.",
        "address": "Koramangala 1st Block, Bengaluru",
        "source": "manual"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["category"] == "Garbage Overflow"
    assert data["incident_id"] is not None
