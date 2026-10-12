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
    def test_dashcam_401_unauthorized():
        # Test 1: Calling initialization without token must return 401
        res = client.post("/api/drive/sessions/start", json={
            "latitude": 12.9350,
            "longitude": 77.6240
        })
        assert res.status_code == 401, f"Expected 401, got {res.status_code}: {res.text}"
        assert "Authentication credentials" in res.json().get("detail", "")
    run_test("Dashcam Drive Mode 401 Unauthorized Rejection when Token Missing", test_dashcam_401_unauthorized)

    def test_dashcam_authenticated_init():
        # Test 2: Calling initialization with valid token must succeed
        headers = {"Authorization": f"Bearer {auth_token}"}
        res = client.post("/api/drive/sessions/start", json={
            "latitude": 12.9350,
            "longitude": 77.6240
        }, headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["status"] == "ACTIVE"
        assert data["id"] is not None
    run_test("Dashcam Drive Mode Authorized Session Initialization (200 OK)", test_dashcam_authenticated_init)

    def test_dashcam_gps_accuracy_validation():
        headers = {"Authorization": f"Bearer {auth_token}"}
        start_res = client.post("/api/drive/sessions/start", json={"latitude": 12.9350, "longitude": 77.6240}, headers=headers)
        session_id = start_res.json()["id"]

        # Low accuracy (>50m, e.g. 75m) -> HELD_LOW_GPS_ACCURACY
        f_poor = client.post("/api/drive/process-frame", json={
            "session_id": session_id,
            "timestamp_ms": int(time.time() * 1000),
            "latitude": 12.9350,
            "longitude": 77.6240,
            "gps_accuracy": 75.0,
            "category": "Pothole",
            "confidence": 0.90
        }, headers=headers)
        assert f_poor.status_code == 200
        assert f_poor.json()["status"] == "HELD_LOW_GPS_ACCURACY"
        assert "GPS accuracy is too low" in f_poor.json()["message"]

        # Good accuracy (8m) -> Accepted
        f_good = client.post("/api/drive/process-frame", json={
            "session_id": session_id,
            "timestamp_ms": int(time.time() * 1000),
            "latitude": 12.9350,
            "longitude": 77.6240,
            "gps_accuracy": 8.0,
            "category": "Pothole",
            "confidence": 0.90
        }, headers=headers)
        assert f_good.status_code == 200
        assert f_good.json()["status"] == "EVENT_LOGGED"
        assert f_good.json()["ward_number"] == 151
        assert "Koramangala" in f_good.json()["ward_name"]
        assert f_good.json()["assembly_constituency"] == "BTM Layout"
        assert f_good.json()["mla_name"] == "Ramalinga Reddy"
        assert f_good.json()["parliamentary_constituency"] == "Bangalore South"
        assert f_good.json()["mp_name"] == "Tejasvi Surya"
    run_test("GPS Accuracy Validation (>50m Held vs <=20m High Confidence)", test_dashcam_gps_accuracy_validation)

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
            "gps_accuracy": 7.5,
            "speed": 32.0,
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
            "gps_accuracy": 7.5,
            "speed": 32.5,
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
    run_test("Dashcam Drive Mode Temporal Consecutive-Frame Merging", test_dashcam_temporal_filtering)

    def test_dashcam_government_reporting_adapter():
        from backend.app.services.government_adapter import government_adapter
        assert government_adapter.is_configured() is False, "Default environment should not fake active live government credentials"
        res = government_adapter.create_complaint({
            "incident_code": "BLR-TEST-9999",
            "category": "POTHOLE",
            "latitude": 12.9352,
            "longitude": 77.6245,
            "ward_number": 151,
            "ward_name": "Koramangala"
        })
        assert res["submission_status"] == "READY_FOR_OFFICIAL_SUBMISSION"
        assert res["is_submitted"] is False
        assert res["official_complaint_id"] is None
        assert "Official submission is pending" in res["message"]
    run_test("Government Reporting Adapter (Ethical Transparency: No Fake Submissions)", test_dashcam_government_reporting_adapter)

    def test_dashcam_offline_sync():
        headers = {"Authorization": f"Bearer {auth_token}"}
        start_res = client.post("/api/drive/sessions/start", json={"latitude": 12.9350, "longitude": 77.6240}, headers=headers)
        session_id = start_res.json()["id"]

        offline_frames = [
            {
                "session_id": session_id,
                "timestamp_ms": int(time.time() * 1000),
                "latitude": 12.9360,
                "longitude": 77.6250,
                "gps_accuracy": 9.0,
                "category": "Pothole",
                "confidence": 0.85
            }
        ]
        sync_res = client.post("/api/drive/sync-offline", json=offline_frames, headers=headers)
        assert sync_res.status_code == 200
        assert sync_res.json()["status"] == "SYNC_COMPLETED"
        assert sync_res.json()["synced_frames"] == 1
    run_test("Dashcam Drive Mode Offline Synchronization API", test_dashcam_offline_sync)

    def test_dashcam_bounding_boxes_and_severity():
        from backend.tests.test_drive_detections import test_drive_mode_pothole_bounding_boxes
        test_drive_mode_pothole_bounding_boxes(client)
    run_test("Dashcam Drive Mode Pothole Bounding Boxes & Severity Payload", test_dashcam_bounding_boxes_and_severity)

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

    print("\n--- 7. EXIF GPS Recognition & BBMP Ward Mapping Tests ---")
    def test_exif_gps_extraction():
        from PIL import Image, ExifTags
        import io
        from backend.app.services.exif_service import exif_service

        # Synthesize geotagged JPEG pointing to Koramangala (12.9352, 77.6245)
        img = Image.new("RGB", (200, 200), color=(80, 80, 80))
        exif = img.getexif()
        gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
        gps[ExifTags.GPS.GPSLatitudeRef] = "N"
        gps[ExifTags.GPS.GPSLatitude] = (12.0, 56.0, 6.72)
        gps[ExifTags.GPS.GPSLongitudeRef] = "E"
        gps[ExifTags.GPS.GPSLongitude] = (77.0, 37.0, 28.2)

        buf = io.BytesIO()
        img.save(buf, format="JPEG", exif=exif)
        jpeg_bytes = buf.getvalue()

        # 1. Direct Service Test
        meta = exif_service.extract_image_metadata(jpeg_bytes)
        assert meta["has_gps"] is True, "Expected has_gps to be True"
        assert abs(meta["latitude"] - 12.9352) < 0.001, f"Latitude {meta['latitude']} mismatch"
        assert abs(meta["longitude"] - 77.6245) < 0.001, f"Longitude {meta['longitude']} mismatch"

        # 2. Pre-screen API Geotag Recognition Test
        files = {"file": ("geotagged_road.jpg", jpeg_bytes, "image/jpeg")}
        res = client.post("/api/reports/prescreen", files=files)
        assert res.status_code == 200, f"Prescreen failed: {res.text}"
        data = res.json()
        assert data["has_exif_gps"] is True, "Pre-screen did not flag has_exif_gps"
        assert data["photo_gps_available"] is True
        assert data["photo_gps_source"] == "EXIF"
        assert abs(data["resolved_latitude"] - 12.9352) < 0.001
        assert abs(data["resolved_longitude"] - 77.6245) < 0.001
        assert data["bengaluru_ward"] == "Koramangala", f"Expected Koramangala, got {data['bengaluru_ward']}"
        assert data["location_source"] in ["EXIF", "EXIF_PHOTO_GEOTAG"]
        assert data["assembly_constituency"] is not None
        assert data["mla_name"] is not None
        assert data["parliamentary_constituency"] is not None
        assert data["mp_name"] is not None
    run_test("Photo EXIF GPS Extraction & BBMP Ward Point-in-Polygon Resolution", test_exif_gps_extraction)

    def test_non_geotagged_fallback():
        from PIL import Image
        import io
        img = Image.new("RGB", (100, 100), color=(50, 50, 50))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        files = {"file": ("plain_road.jpg", buf.getvalue(), "image/jpeg")}
        data = {"latitude": 12.9120, "longitude": 77.6450} # HSR Layout
        res = client.post("/api/reports/prescreen", data=data, files=files)
        assert res.status_code == 200
        out = res.json()
        assert out["has_exif_gps"] is False
        assert out["photo_gps_available"] is False
        assert out["bengaluru_ward"] == "HSR Layout"
        assert out["location_source"] in ["DEVICE_GPS", "DEVICE_OR_MANUAL"]
        assert out["assembly_constituency"] is not None
        assert out["parliamentary_constituency"] is not None
    run_test("Non-Geotagged Photo Graceful Coordinate & Ward Fallback", test_non_geotagged_fallback)

    print("\n--- 8. Multi-Factor Severity Clarification Tests (LOW / MEDIUM / HIGH) ---")
    def test_severity_classification_and_rationale():
        from PIL import Image
        import io
        img = Image.new("RGB", (300, 300), color=(40, 40, 40))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        files = {"file": ("road_check.jpg", buf.getvalue(), "image/jpeg")}
        res = client.post("/api/reports/prescreen", files=files)
        assert res.status_code == 200
        data = res.json()
        assert data["suggested_severity"] in ["LOW", "MEDIUM", "HIGH"]
        assert data["severity_reason"] is not None and len(data["severity_reason"]) > 15
        assert data["severity_factors"] is not None
        assert "defect_area_pct" in data["severity_factors"]
        assert "recommended_action" in data["severity_factors"]
    run_test("Defect Area & Plain-Language Severity Rationale Generation", test_severity_classification_and_rationale)

    def test_custom_severity_persisted_in_incident():
        from PIL import Image
        import io
        img = Image.new("RGB", (100, 100), color=(60, 60, 60))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        files = {"file": ("crater.jpg", buf.getvalue(), "image/jpeg")}
        unique_lat = 12.9500 + (float(uuid.uuid4().int % 10000) / 100000.0)
        unique_lon = 77.6000 + (float(uuid.uuid4().int % 10000) / 100000.0)
        data = {
            "category": "Pothole",
            "latitude": unique_lat,
            "longitude": unique_lon,
            "raw_text": "Deep hazardous pothole reported by citizen.",
            "severity": "HIGH",
            "severity_reason": "High severity crater covering 14% road area with severe rim damage risk."
        }
        headers = {"Authorization": f"Bearer {auth_token}"}
        create_res = client.post("/api/reports/create", data=data, files=files, headers=headers)
        assert create_res.status_code == 200, f"Report creation failed: {create_res.text}"
        rep = create_res.json()
        
        # Verify incident severity
        db = SessionLocal()
        inc = db.query(Incident).filter(Incident.id == rep["incident_id"]).first()
        assert inc is not None
        assert inc.severity == "HIGH", f"Expected HIGH severity, got {inc.severity}"
        assert inc.priority_score >= 50.0, f"Expected high priority score, got {inc.priority_score}"
        db.close()
    run_test("Citizen-Verified Severity Persisted in Canonical Incident", test_custom_severity_persisted_in_incident)

    print("\n--- 9. Exact Geocoding & Landmark Search Tests ---")
    def test_exact_reverse_geocode():
        res = client.get("/api/reports/reverse-geocode?latitude=12.9352&longitude=77.6245")
        assert res.status_code == 200, f"Reverse geocode failed: {res.text}"
        data = res.json()
        assert data["ward_name"] == "Koramangala"
        assert data["zone_name"] == "South"
        assert data["is_within_bengaluru"] is True
        assert "formatted_address" in data and len(data["formatted_address"]) > 5
    run_test("Exact Reverse Geocoding with BBMP Ward Resolution", test_exact_reverse_geocode)

    def test_landmark_forward_search():
        res = client.get("/api/reports/search-location?q=Brigade Road")
        assert res.status_code == 200, f"Search location failed: {res.text}"
        data = res.json()
        assert "results" in data
        assert isinstance(data["results"], list)
    run_test("Forward Geocoding Landmark Search API", test_landmark_forward_search)

    def test_outside_bengaluru_geotag_resolution():
        # Coordinates in Mysuru
        res = client.get("/api/reports/reverse-geocode?latitude=12.2958&longitude=76.6394")
        assert res.status_code == 200
        data = res.json()
        assert data["is_within_bengaluru"] is False
        assert "Mysuru" in data["ward_name"] or "Mysuru" in data["formatted_address"]
    run_test("Non-Bengaluru Coordinates Accurately Flagged with Regional Identity", test_outside_bengaluru_geotag_resolution)

    print("\n--- 10. Authoritative BBMP Ward Boundary & Point-in-Polygon Tests (Requirement 12) ---")
    def test_multi_location_point_in_polygon():
        # Test locations inside Bengaluru and outside
        test_cases = [
            ("Koramangala 4th Block", 12.9352, 77.6245, 151, "Koramangala"),
            ("HSR Layout Sector 1", 12.9120, 77.6450, 174, "HSR Layout"),
            ("Domlur / Indiranagar", 12.9609, 77.6387, 112, "Domlur"),
            ("Malleshwaram", 13.0031, 77.5643, 65, "Kadu Malleshwar Ward"),
            ("Jayanagar 4th Block", 12.9308, 77.5838, 168, "Pattabhiram Nagar"),
            ("Whitefield Corridor", 12.9700, 77.7500, 84, "Hagadur / Whitefield")
        ]
        for name, lat, lon, exp_num, exp_name in test_cases:
            loc = gis_service.resolve_location(lat, lon)
            assert loc["is_within_bengaluru"] is True, f"Failed within_bengaluru for {name}"
            assert loc["ward_number"] == exp_num, f"Expected ward #{exp_num} for {name}, got {loc['ward_number']}"
            assert exp_name in loc["ward_name"], f"Expected {exp_name} in ward name for {name}, got {loc['ward_name']}"
            assert loc["detection_method"] == "EXACT_POINT_IN_POLYGON"
            assert loc["is_estimated"] is False
    run_test("Multi-Location Bengaluru GPS Point-in-Polygon Exact Ward Matching", test_multi_location_point_in_polygon)

    def test_strict_rule9_do_not_guess_outside_bbmp():
        # Outside coordinates (Mysuru, Tumakuru, Delhi)
        outside_coords = [
            ("Mysuru", 12.2958, 76.6394),
            ("Delhi", 28.6139, 77.2090)
        ]
        for city, lat, lon in outside_coords:
            loc = gis_service.resolve_location(lat, lon, allow_estimated_fallback=False)
            assert loc["is_within_bengaluru"] is False, f"Erroneously flagged {city} as within Bengaluru"
            assert loc["ward_number"] is None, f"Assigned ward number to outside location {city}"
            assert loc["ward_name"] == "BBMP ward could not be determined.", f"Failed Rule 9 exact phrasing: {loc['ward_name']}"
            assert loc["is_estimated"] is False
    run_test("Strict Rule 9: No Guessing Outside BBMP (BBMP ward could not be determined)", test_strict_rule9_do_not_guess_outside_bbmp)

    def test_authoritative_dataset_validation():
        from backend.app.services.ward_importer import ward_importer
        with open("backend/data/bengaluru_wards.geojson", "r", encoding="utf-8") as f:
            content = f.read()
        features, crs = ward_importer.parse_geojson(content)
        report = ward_importer.validate_features(features, crs, "Official BBMP 198 Wards")
        assert report["total_wards"] == 198, f"Expected 198 wards, got {report['total_wards']}"
        assert report["valid_geometries"] == 198, f"Expected 198 valid geometries, got {report['valid_geometries']}"
        assert report["invalid_geometries"] == 0, f"Found invalid geometries: {report['invalid_geometries']}"
        assert report["missing_ward_numbers"] == 0, f"Found missing ward numbers: {report['missing_ward_numbers']}"
        assert len(report["duplicate_ward_numbers"]) == 0, f"Found duplicate ward numbers: {report['duplicate_ward_numbers']}"
        assert report["is_geographically_reasonable"] is True, "Wards outside reasonable Bengaluru bounding box"
        assert report["is_valid"] is True, "Validation failed"
        assert "VALIDATION REPORT" in report["validation_report"]
    run_test("Dataset Topology & Attribute Validation (198/198 Valid, EPSG:4326)", test_authoritative_dataset_validation)

    def test_ward_source_transparency_api():
        res = client.get("/api/reports/ward-source-info")
        assert res.status_code == 200
        data = res.json()
        assert data["title"] == "BBMP Ward Boundaries — Official Government Source"
        assert "BBMP" in data["source_organization"]
        assert "4326" in data["coordinate_system"]
        assert "opencity.in" in data["source_url"] or "bbmp.gov.in" in data["source_url"]
        assert data["ward_count"] == 198
    run_test("Official Government Source Transparency API Verification", test_ward_source_transparency_api)

    def test_admin_ward_detect_and_highlight():
        res = client.post("/api/admin/wards/detect", json={"latitude": 12.9352, "longitude": 77.6245})
        assert res.status_code == 200
        data = res.json()
        assert data["ward_number"] == 151
        assert "Koramangala" in data["ward_name"]
        assert data["geometry"] is not None
        assert data["geometry"]["type"] in ["Polygon", "MultiPolygon"]
    run_test("Admin GPS Point-in-Polygon Detect API with Boundary Highlight Geometry", test_admin_ward_detect_and_highlight)

    print("\n--- 11. Device GPS Accuracy, Location Source & Ward Persistence Tests ---")
    def test_gps_accuracy_and_ward_persistence():
        report_data = {
            "category": "Pothole",
            "latitude": 12.9378,
            "longitude": 77.6205,
            "gps_accuracy": 8.4,
            "location_source": "GPS",
            "raw_text": "Pothole detected via high precision GPS at Koramangala 5th Block.",
            "source": "manual"
        }
        res = client.post("/api/reports/create", data=report_data)
        assert res.status_code == 200, f"Report creation failed: {res.text}"
        data = res.json()
        assert abs(data["latitude"] - 12.9378) < 1e-5
        assert abs(data["longitude"] - 77.6205) < 1e-5
        assert data["gps_accuracy"] == 8.4
        assert data["location_source"] == "GPS"
        assert data["ward_number"] == 151
        assert "Koramangala" in data["ward_name"]
        assert data["ward_detection_method"] == "POINT_IN_POLYGON"

        # Verify canonical Incident persistence in DB
        db = SessionLocal()
        try:
            inc = db.query(Incident).filter(Incident.id == data["incident_id"]).first()
            assert inc is not None
            assert inc.gps_accuracy == 8.4
            assert inc.location_source == "GPS"
            assert inc.ward_number == 151
            assert inc.ward_detection_method == "POINT_IN_POLYGON"
        finally:
            db.close()
    run_test("Exact Device GPS Accuracy (8.4m) & Point-in-Polygon Persistence", test_gps_accuracy_and_ward_persistence)

    def test_manual_location_source_persistence():
        report_data = {
            "category": "Road Damage",
            "latitude": 12.9120,
            "longitude": 77.6450,
            "location_source": "MANUAL",
            "raw_text": "User manually adjusted map pin in HSR Layout.",
            "source": "manual"
        }
        res = client.post("/api/reports/create", data=report_data)
        assert res.status_code == 200, f"Report creation failed: {res.text}"
        data = res.json()
        assert data["location_source"] == "MANUAL"
        assert data["ward_number"] == 174
        assert "HSR" in data["ward_name"]
        assert data["ward_detection_method"] == "POINT_IN_POLYGON"

        db = SessionLocal()
        try:
            inc = db.query(Incident).filter(Incident.id == data["incident_id"]).first()
            assert inc is not None
            assert inc.location_source == "MANUAL"
            assert inc.ward_number == 174
            assert inc.ward_detection_method == "POINT_IN_POLYGON"
        finally:
            db.close()
    run_test("User-Adjusted Marker MANUAL Location Source Persistence", test_manual_location_source_persistence)

    def test_reverse_geocode_debug_panel_contract():
        # Inside Bengaluru
        res_in = client.get("/api/reports/reverse-geocode?latitude=12.9352&longitude=77.6245")
        assert res_in.status_code == 200
        d_in = res_in.json()
        assert d_in["is_within_bengaluru"] is True
        assert d_in["ward_number"] == 151
        assert "Koramangala" in d_in["ward_name"]
        assert d_in["crs"] == "EPSG:4326 (WGS84)"
        assert "BBMP" in d_in["dataset_source"]
        assert d_in["detection_method"] == "POINT_IN_POLYGON"
        assert d_in["geometry"] is not None
        assert d_in["geometry"]["type"] in ["Polygon", "MultiPolygon"]

        # Outside Bengaluru (Mysuru)
        res_out = client.get("/api/reports/reverse-geocode?latitude=12.2958&longitude=76.6394")
        assert res_out.status_code == 200
        d_out = res_out.json()
        assert d_out["is_within_bengaluru"] is False
        assert d_out["ward_number"] is None
        assert d_out["ward_name"] == "BBMP ward could not be determined."
        assert d_out["ward_detection_method"] == "OUTSIDE_BBMP"
    run_test("Reverse Geocode Debug Panel Contract (CRS, Geometry, Detection Method)", test_reverse_geocode_debug_panel_contract)

    print("\n--- 12. MLA & Assembly Constituency Point-in-Polygon Tests ---")
    def test_mla_ac_pip_resolution():
        from backend.app.services.constituency_service import constituency_service
        # 1. Koramangala -> BTM Layout (AC 172) -> Ramalinga Reddy (INC)
        res_btm = constituency_service.resolve_constituencies(12.9340, 77.6250)
        assert res_btm is not None, "Failed to resolve BTM Layout AC"
        assert res_btm["assembly_constituency_number"] == 172
        assert "BTM" in res_btm["assembly_constituency_name"]
        assert "Ramalinga Reddy" in res_btm["mla_name"]
        assert res_btm["mla_party"] == "INC"

        # 2. Malleshwaram -> Malleshwaram (AC 157) -> Dr. C. N. Ashwath Narayan (BJP)
        res_mal = constituency_service.resolve_constituencies(13.0031, 77.5643)
        assert res_mal is not None, "Failed to resolve Malleshwaram AC"
        assert res_mal["assembly_constituency_number"] == 157
        assert "Malleshwaram" in res_mal["assembly_constituency_name"]
        assert "Ashwath Narayan" in res_mal["mla_name"]
        assert res_mal["mla_party"] == "BJP"

        # 3. Strict Rule: Outside Bengaluru -> None (No guessing)
        res_out = constituency_service.resolve_constituencies(12.2958, 76.6394) # Mysuru
        assert res_out is None, "Erroneously assigned AC to Mysuru"
    run_test("Authoritative Point-in-Polygon Resolution: 27 Bengaluru Assembly Constituencies & MLAs", test_mla_ac_pip_resolution)

    print("\n--- 13. MP & Parliamentary Constituency Point-in-Polygon Tests ---")
    def test_mp_pc_pip_resolution():
        from backend.app.services.constituency_service import constituency_service
        # 1. Bangalore South -> Tejasvi Surya (BJP)
        res_south = constituency_service.resolve_constituencies(12.9340, 77.6250)
        assert res_south is not None
        assert res_south["parliamentary_constituency_number"] == 26
        assert "Bangalore South" in res_south["parliamentary_constituency_name"]
        assert "Tejasvi Surya" in res_south["mp_name"]
        assert res_south["mp_party"] == "BJP"

        # 2. Bangalore Central -> P. C. Mohan (BJP)
        res_central = constituency_service.resolve_constituencies(12.9750, 77.6050)
        assert res_central is not None
        assert res_central["parliamentary_constituency_number"] == 25
        assert "Bangalore Central" in res_central["parliamentary_constituency_name"]
        assert "P. C. Mohan" in res_central["mp_name"]
        assert res_central["mp_party"] == "BJP"
    run_test("Authoritative Point-in-Polygon Resolution: 4 Lok Sabha Parliamentary Constituencies & MPs", test_mp_pc_pip_resolution)

    print("\n--- 14. Boundary Proximity Warning (<35m Border Roads) Tests ---")
    def test_boundary_proximity_warning():
        from backend.app.services.constituency_service import constituency_service
        # Test point along AC boundary road
        res = constituency_service.resolve_constituencies(12.9340, 77.6250)
        assert res is not None
        assert "boundary_warning" in res
        assert isinstance(res["boundary_warning"], bool)

        # Reverse geocode API test for boundary warning
        api_res = client.get("/api/reports/reverse-geocode?latitude=12.9352&longitude=77.6245")
        assert api_res.status_code == 200
        d = api_res.json()
        assert "boundary_warning" in d
        assert "assembly_constituency" in d
        assert "parliamentary_constituency" in d
    run_test("Constituency Boundary Proximity Detection (<35m Median/Road Flag)", test_boundary_proximity_warning)

    print("\n--- 15. Representative Master Data Freshness & Admin Management Tests ---")
    def test_admin_representative_management():
        admin_login = client.post("/api/auth/login", json={
            "email": "admin@bengaluru.gov.in",
            "password": "Admin@123"
        })
        adm_token = admin_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {adm_token}"}

        # 1. List representatives
        rep_res = client.get("/api/admin/representatives", headers=headers)
        assert rep_res.status_code == 200
        reps = rep_res.json()
        assert reps["mla_count"] == 27, f"Expected 27 MLAs, got {reps['mla_count']}"
        assert reps["mp_count"] == 4, f"Expected 4 MPs, got {reps['mp_count']}"

        # 2. Update MLA with verified freshness
        first_mla = reps["mlas"][0]
        update_payload = {
            "name": first_mla["name"],
            "party": first_mla["party"],
            "source": "Election Commission of India / Verified KLA Secretariat"
        }
        put_res = client.put(f"/api/admin/mlas/{first_mla['id']}", json=update_payload, headers=headers)
        assert put_res.status_code == 200
        data = put_res.json()
        assert data["last_verified"] is not None
    run_test("Admin Representative Freshness Audit & Update API (MLAs & MPs)", test_admin_representative_management)

    print("\n--- 16. Multi-Layer GIS Engine API Contract Tests ---")
    def test_admin_gis_layers():
        admin_login = client.post("/api/auth/login", json={
            "email": "admin@bengaluru.gov.in",
            "password": "Admin@123"
        })
        adm_token = admin_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {adm_token}"}

        res = client.get("/api/admin/gis/layers", headers=headers)
        assert res.status_code == 200
        layers = res.json()
        assert "layer_incidents" in layers
        assert "layer_wards" in layers
        assert "layer_assembly_constituencies" in layers
        assert "layer_parliamentary_constituencies" in layers

        assert len(layers["layer_wards"]["features"]) == 198
        assert len(layers["layer_assembly_constituencies"]["features"]) == 27
        assert len(layers["layer_parliamentary_constituencies"]["features"]) == 4
    run_test("Multi-Layer Admin GIS API Contract (4 Canonical GIS Layers)", test_admin_gis_layers)

    def test_unverified_location_fallback():
        from PIL import Image
        import io
        img = Image.new("RGB", (100, 100), color=(30, 30, 30))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        files = {"file": ("no_gps.jpg", buf.getvalue(), "image/jpeg")}

        # Prescreen without GPS coords
        res = client.post("/api/reports/prescreen", files=files)
        assert res.status_code == 200
        d = res.json()
        assert d["photo_gps_available"] is False
        assert d["location_source"] == "NONE"
        assert d["bengaluru_ward"] is None
        assert "Location could not be verified" in d["location_unverified_message"]
    run_test("Unverified Location Fallback (No EXIF, No Device GPS -> Clear Warning Banner)", test_unverified_location_fallback)

    print("\n========================================================================")
    print(f"RESULTS: {passed} PASSED, {failed} FAILED")
    print("========================================================================\n")
    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    test_suite()

