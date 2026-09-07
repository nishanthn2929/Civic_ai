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

    # Approximate bounding box for Greater Bengaluru Metropolitan Area
    BLR_BOUNDS = {
        "min_lat": 12.75,
        "max_lat": 13.25,
        "min_lon": 77.35,
        "max_lon": 77.85
    }

    # Major Indian & Karnataka Regional Hubs for non-Bengaluru geotags
    REGIONAL_CENTERS = [
        {"name": "Mysuru, Karnataka", "lat": 12.2958, "lon": 76.6394},
        {"name": "Hosur, Tamil Nadu", "lat": 12.7409, "lon": 77.8253},
        {"name": "Tumakuru, Karnataka", "lat": 13.3409, "lon": 77.1010},
        {"name": "Kolar, Karnataka", "lat": 13.1367, "lon": 78.1291},
        {"name": "Mangaluru, Karnataka", "lat": 12.9141, "lon": 74.8560},
        {"name": "Hubballi-Dharwad, Karnataka", "lat": 15.3647, "lon": 75.1240},
        {"name": "Belagavi, Karnataka", "lat": 15.8497, "lon": 74.4977},
        {"name": "Shivamogga, Karnataka", "lat": 13.9299, "lon": 75.5681},
        {"name": "Chennai, Tamil Nadu", "lat": 13.0827, "lon": 80.2707},
        {"name": "Hyderabad, Telangana", "lat": 17.3850, "lon": 78.4867},
        {"name": "Mumbai, Maharashtra", "lat": 19.0760, "lon": 72.8777},
        {"name": "Pune, Maharashtra", "lat": 18.5204, "lon": 73.8567},
        {"name": "Delhi NCR", "lat": 28.6139, "lon": 77.2090},
        {"name": "Kolkata, West Bengal", "lat": 22.5726, "lon": 88.3639}
    ]

    def resolve_location(self, lat: float, lon: float) -> Dict[str, Any]:
        """
        Identify whether coordinates fall inside Bengaluru BBMP or an outside region.
        Returns ward, zone, region name, and formatted address.
        """
        # 1. Exact Point-in-Polygon check against authentic BBMP wards
        pt = Point(lon, lat)  # GeoJSON is [lng, lat]
        for feature in self.wards_data:
            geom = shape(feature["geometry"])
            if geom.contains(pt) or geom.touches(pt):
                props = feature["properties"]
                return {
                    "is_within_bengaluru": True,
                    "ward_number": props["ward_number"],
                    "ward_name": props["ward_name"],
                    "zone_name": props["zone_name"],
                    "pincode": props.get("pincode"),
                    "region_name": "Bengaluru Urban",
                    "formatted_address": f"{props['ward_name']}, {props['zone_name']} Zone, Bengaluru",
                    "approximate": False
                }

        # 2. Check if within Bengaluru metropolitan bounds
        in_blr = (
            self.BLR_BOUNDS["min_lat"] <= lat <= self.BLR_BOUNDS["max_lat"]
            and self.BLR_BOUNDS["min_lon"] <= lon <= self.BLR_BOUNDS["max_lon"]
        )

        if in_blr and self.wards_data:
            # Find nearest BBMP ward centroid
            nearest_ward = None
            min_dist = float("inf")
            for feature in self.wards_data:
                geom = shape(feature["geometry"])
                centroid = geom.centroid
                dist = self.haversine_distance_meters(lat, lon, centroid.y, centroid.x)
                if dist < min_dist:
                    min_dist = dist
                    nearest_ward = feature["properties"]

            if nearest_ward:
                return {
                    "is_within_bengaluru": True,
                    "ward_number": nearest_ward["ward_number"],
                    "ward_name": nearest_ward["ward_name"],
                    "zone_name": nearest_ward["zone_name"],
                    "pincode": nearest_ward.get("pincode"),
                    "region_name": "Bengaluru Metropolitan",
                    "formatted_address": f"{nearest_ward['ward_name']}, {nearest_ward['zone_name']} Zone, Bengaluru",
                    "approximate": True
                }

        # 3. Location is OUTSIDE Bengaluru BBMP: Identify regional hub
        nearest_region = "Outside Bengaluru"
        min_reg_dist = float("inf")
        for reg in self.REGIONAL_CENTERS:
            dist = self.haversine_distance_meters(lat, lon, reg["lat"], reg["lon"])
            if dist < min_reg_dist:
                min_reg_dist = dist
                nearest_region = reg["name"]

        if min_reg_dist > 250000:  # >250km away from any known hub
            region_display = "Outside BBMP Jurisdiction"
        else:
            region_display = f"{nearest_region}"

        return {
            "is_within_bengaluru": False,
            "ward_number": None,
            "ward_name": f"Outside BBMP ({region_display})",
            "zone_name": "Non-BBMP",
            "pincode": None,
            "region_name": region_display,
            "formatted_address": f"{region_display} ({lat:.4f}° N, {lon:.4f}° E)",
            "approximate": True
        }

    def find_ward_by_coordinates(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """Point-in-polygon lookup for Bengaluru BBMP wards with proper region awareness."""
        return self.resolve_location(lat, lon)

    def get_all_wards_geojson(self) -> Dict[str, Any]:
        if WARDS_GEOJSON_PATH.exists():
            with open(WARDS_GEOJSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"type": "FeatureCollection", "features": []}

gis_service = BengaluruGISService()
