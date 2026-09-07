import json
import math
from pathlib import Path
from typing import Optional, Dict, Any, List
from shapely.geometry import shape, Point
from backend.app.core.config import settings

WARDS_GEOJSON_PATH = Path(settings.DATA_DIR) / "bengaluru_wards.geojson"

class BengaluruGISService:
    def __init__(self):
        self.wards_data: List[Dict[str, Any]] = []
        self._load_geojson()

    def _load_geojson(self):
        if not WARDS_GEOJSON_PATH.exists():
            return
        with open(WARDS_GEOJSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            self.wards_data = data.get("features", [])

    @staticmethod
    def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate the great circle distance between two points on the earth in meters."""
        R = 6371000.0  # Earth radius in meters
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = (
            math.sin(delta_phi / 2.0) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
        )
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return R * c

    def find_ward_by_coordinates(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """Point-in-polygon lookup for Bengaluru BBMP wards."""
        pt = Point(lon, lat)  # GeoJSON is [lng, lat]
        
        # 1. Exact Point-in-Polygon check
        for feature in self.wards_data:
            geom = shape(feature["geometry"])
            if geom.contains(pt) or geom.touches(pt):
                props = feature["properties"]
                return {
                    "ward_number": props["ward_number"],
                    "ward_name": props["ward_name"],
                    "zone_name": props["zone_name"],
                    "pincode": props.get("pincode")
                }

        # 2. Nearest centroid fallback if point is in Bengaluru vicinity
        nearest_ward = None
        min_dist = float("inf")
        for feature in self.wards_data:
            geom = shape(feature["geometry"])
            centroid = geom.centroid
            dist = self.haversine_distance_meters(lat, lon, centroid.y, centroid.x)
            if dist < min_dist:
                min_dist = dist
                nearest_ward = feature["properties"]

        if nearest_ward and min_dist <= 25000:  # Within 25km of Bengaluru wards
            return {
                "ward_number": nearest_ward["ward_number"],
                "ward_name": nearest_ward["ward_name"],
                "zone_name": nearest_ward["zone_name"],
                "pincode": nearest_ward.get("pincode"),
                "approximate": True
            }

        return {
            "ward_number": 151,
            "ward_name": "Koramangala (Default)",
            "zone_name": "South",
            "pincode": 560034,
            "approximate": True
        }

    def get_all_wards_geojson(self) -> Dict[str, Any]:
        if WARDS_GEOJSON_PATH.exists():
            with open(WARDS_GEOJSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"type": "FeatureCollection", "features": []}

gis_service = BengaluruGISService()
