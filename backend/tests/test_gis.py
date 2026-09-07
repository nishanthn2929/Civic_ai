from backend.app.services.gis_service import gis_service

def test_haversine_distance():
    # Koramangala 80ft road vs nearby point (~50 meters)
    lat1, lon1 = 12.935200, 77.624500
    lat2, lon2 = 12.935500, 77.624800
    dist = gis_service.haversine_distance_meters(lat1, lon1, lat2, lon2)
    assert 30.0 < dist < 80.0

def test_point_in_polygon_koramangala():
    # Coordinates inside Koramangala ward polygon
    lat, lon = 12.9340, 77.6250
    ward = gis_service.find_ward_by_coordinates(lat, lon)
    assert ward is not None
    assert ward["ward_name"] == "Koramangala"
    assert ward["ward_number"] == 151
    assert ward["zone_name"] == "South"

def test_point_in_polygon_hsr_layout():
    # Coordinates inside HSR Layout polygon
    lat, lon = 12.9120, 77.6450
    ward = gis_service.find_ward_by_coordinates(lat, lon)
    assert ward is not None
    assert ward["ward_name"] == "HSR Layout"
    assert ward["ward_number"] == 174
    assert ward["zone_name"] == "Bommanahalli"

def test_point_in_polygon_whitefield():
    # Coordinates inside Whitefield polygon
    lat, lon = 12.9700, 77.7500
    ward = gis_service.find_ward_by_coordinates(lat, lon)
    assert ward is not None
    assert "Whitefield" in ward["ward_name"]
    assert ward["zone_name"] == "Mahadevapura"
