import json
import math
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Optional, Dict, Any, List
from shapely.geometry import shape, Point
from backend.app.core.config import settings

WARDS_GEOJSON_PATH = Path(settings.DATA_DIR) / "bengaluru_wards.geojson"

class BengaluruGISService:
    def __init__(self):
        self.wards_data: List[Dict[str, Any]] = []
        self._osm_cache: Dict[str, Any] = {}
        self._search_cache: Dict[str, Any] = {}
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

    # Bounding box for Greater Bengaluru Metropolitan Area & Bengaluru Urban District
    BLR_BOUNDS = {
        "min_lat": 12.60,
        "max_lat": 13.40,
        "min_lon": 77.20,
        "max_lon": 77.95
    }

    # Major Indian & Karnataka Regional Hubs for non-Bengaluru geotags (offline fallback only)
    REGIONAL_CENTERS = [
        {"name": "Mysuru, Karnataka", "lat": 12.2958, "lon": 76.6394},
        {"name": "Tumakuru, Karnataka", "lat": 13.3409, "lon": 77.1010},
        {"name": "Kolar, Karnataka", "lat": 13.1367, "lon": 78.1291},
        {"name": "Chikkaballapura, Karnataka", "lat": 13.4325, "lon": 77.7275},
        {"name": "Ramanagara, Karnataka", "lat": 12.7210, "lon": 77.2810},
        {"name": "Mandya, Karnataka", "lat": 12.5244, "lon": 76.8958},
        {"name": "Mangaluru, Karnataka", "lat": 12.9141, "lon": 74.8560},
        {"name": "Hubballi-Dharwad, Karnataka", "lat": 15.3647, "lon": 75.1240},
        {"name": "Belagavi, Karnataka", "lat": 15.8497, "lon": 74.4977},
        {"name": "Shivamogga, Karnataka", "lat": 13.9299, "lon": 75.5681},
        {"name": "Chennai, Tamil Nadu", "lat": 13.0827, "lon": 80.2707},
        {"name": "Coimbatore, Tamil Nadu", "lat": 11.0168, "lon": 76.9558},
        {"name": "Hyderabad, Telangana", "lat": 17.3850, "lon": 78.4867},
        {"name": "Mumbai, Maharashtra", "lat": 19.0760, "lon": 72.8777},
        {"name": "Delhi NCR", "lat": 28.6139, "lon": 77.2090}
    ]

    def fetch_osm_reverse(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """Fetch exact street, road, building, and postal code from OpenStreetMap Nominatim."""
        cache_key = f"{round(lat, 5)},{round(lon, 5)}"
        if cache_key in self._osm_cache:
            return self._osm_cache[cache_key]

        try:
            url = f"https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lon}&zoom=18&addressdetails=1"
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "BBMP-CivicEye-Platform/1.0 (contact@civiceye.bengaluru.gov.in)"}
            )
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                addr = data.get("address", {})
                
                # Extract exact road or feature name
                road = addr.get("road") or addr.get("pedestrian") or addr.get("street") or addr.get("amenity") or addr.get("building") or ""
                house_num = addr.get("house_number", "")
                neighbourhood = addr.get("neighbourhood") or addr.get("suburb") or addr.get("residential") or addr.get("quarter") or ""
                city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality") or ""
                state_district = addr.get("state_district") or addr.get("county") or ""
                county = addr.get("county") or ""
                town = addr.get("town") or ""
                state = addr.get("state") or ""
                country = addr.get("country") or "India"
                postcode = addr.get("postcode", "")
                
                res = {
                    "road": road,
                    "house_number": house_num,
                    "neighbourhood": neighbourhood,
                    "city": city,
                    "town": town,
                    "county": county,
                    "state_district": state_district,
                    "state": state,
                    "country": country,
                    "postcode": postcode,
                    "display_name": data.get("display_name", "")
                }
                self._osm_cache[cache_key] = res
                return res
        except Exception:
            return None

    def search_address(self, query: str) -> List[Dict[str, Any]]:
        """Forward geocode address or landmark query to coordinates with BBMP ward enrichment."""
        q_clean = query.strip()
        if not q_clean:
            return []
        
        cache_key = q_clean.lower()
        if cache_key in self._search_cache:
            return self._search_cache[cache_key]

        search_q = q_clean
        if "bengaluru" not in search_q.lower() and "bangalore" not in search_q.lower():
            search_q += ", Bengaluru, Karnataka"

        try:
            encoded_q = urllib.parse.quote(search_q)
            url = f"https://nominatim.openstreetmap.org/search?format=jsonv2&q={encoded_q}&countrycodes=in&limit=5&addressdetails=1"
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "BBMP-CivicEye-Platform/1.0 (contact@civiceye.bengaluru.gov.in)"}
            )
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                results = []
                for item in data:
                    lat = float(item["lat"])
                    lon = float(item["lon"])
                    addr = item.get("address", {})
                    road = addr.get("road") or addr.get("pedestrian") or addr.get("amenity") or addr.get("building") or ""
                    suburb = addr.get("suburb") or addr.get("neighbourhood") or addr.get("residential") or ""
                    city = addr.get("city") or addr.get("town") or "Bengaluru"
                    postcode = addr.get("postcode", "")

                    # Enrich with BBMP ward point-in-polygon without recursive OSM lookup
                    ward_meta = self.resolve_location(lat, lon, fetch_osm=False)

                    # Build clean title
                    display_parts = [p for p in [road, suburb, ward_meta.get("ward_name")] if p]
                    title = ", ".join(display_parts) if display_parts else item.get("display_name", "")

                    results.append({
                        "latitude": lat,
                        "longitude": lon,
                        "title": title,
                        "road": road,
                        "suburb": suburb,
                        "city": city,
                        "postcode": postcode,
                        "display_name": item.get("display_name", ""),
                        "ward_name": ward_meta.get("ward_name"),
                        "ward_number": ward_meta.get("ward_number"),
                        "zone_name": ward_meta.get("zone_name"),
                        "is_within_bengaluru": ward_meta.get("is_within_bengaluru", True)
                    })
                self._search_cache[cache_key] = results
                return results
        except Exception:
            return []

    def resolve_location(self, lat: float, lon: float, fetch_osm: bool = True) -> Dict[str, Any]:
        """
        Identify whether coordinates fall inside Bengaluru BBMP or an outside region.
        Enriches with exact street address via OpenStreetMap Nominatim when available.
        Returns ward, zone, region name, exact road, and formatted address.
        """
        # Optional live OSM reverse-geocoding for exact road & landmark
        osm_info = self.fetch_osm_reverse(lat, lon) if fetch_osm else None

        # 1. Exact Point-in-Polygon check against authentic BBMP wards
        pt = Point(lon, lat)  # GeoJSON is [lng, lat]
        for feature in self.wards_data:
            geom = shape(feature["geometry"])
            if geom.contains(pt) or geom.touches(pt):
                props = feature["properties"]
                base_addr = f"{props['ward_name']}, {props['zone_name']} Zone, Bengaluru"
                if osm_info and osm_info.get("road"):
                    road_part = f"#{osm_info['house_number']} {osm_info['road']}".strip() if osm_info.get("house_number") else osm_info["road"]
                    parts = [p for p in [road_part, osm_info.get("neighbourhood"), props["ward_name"]] if p]
                    base_addr = f"{', '.join(parts)}, {props['zone_name']} Zone, Bengaluru"
                    if osm_info.get("postcode"):
                        base_addr += f" - {osm_info['postcode']}"
                elif props.get("pincode"):
                    base_addr += f" - {props['pincode']}"

                return {
                    "is_within_bengaluru": True,
                    "ward_number": props["ward_number"],
                    "ward_name": props["ward_name"],
                    "zone_name": props["zone_name"],
                    "pincode": osm_info.get("postcode") if osm_info and osm_info.get("postcode") else props.get("pincode"),
                    "region_name": "Bengaluru Urban",
                    "exact_road": osm_info.get("road") if osm_info else None,
                    "exact_neighbourhood": osm_info.get("neighbourhood") if osm_info else None,
                    "display_name": osm_info.get("display_name") if osm_info else None,
                    "formatted_address": base_addr,
                    "approximate": False
                }

        # 2. Check if within Greater Bengaluru Metropolitan Area
        is_blr_geo = False
        if osm_info:
            osm_state = osm_info.get("state") or ""
            district_str = f"{osm_info.get('state_district', '')} {osm_info.get('county', '')} {osm_info.get('city', '')} {osm_info.get('town', '')}".lower()
            blr_regions = [
                "bengaluru", "bangalore", "kanakapura", "ramanagara", "anekal", 
                "magadi", "channapatna", "bidadi", "hoskote", "nelamangala", 
                "devanahalli", "doddaballapura"
            ]
            if osm_state == "Karnataka" and any(k in district_str for k in blr_regions):
                is_blr_geo = True
            elif osm_state == "Karnataka" and (self.BLR_BOUNDS["min_lat"] <= lat <= self.BLR_BOUNDS["max_lat"] and self.BLR_BOUNDS["min_lon"] <= lon <= self.BLR_BOUNDS["max_lon"]):
                is_blr_geo = True
        else:
            is_blr_geo = (
                self.BLR_BOUNDS["min_lat"] <= lat <= self.BLR_BOUNDS["max_lat"]
                and self.BLR_BOUNDS["min_lon"] <= lon <= self.BLR_BOUNDS["max_lon"]
            )

        if is_blr_geo and self.wards_data:
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
                if osm_info and osm_info.get("road"):
                    road_part = f"#{osm_info['house_number']} {osm_info['road']}".strip() if osm_info.get("house_number") else osm_info["road"]
                    locality = osm_info.get("neighbourhood") or osm_info.get("town") or osm_info.get("city") or nearest_ward["ward_name"]
                    parts = [p for p in [road_part, locality, nearest_ward["ward_name"]] if p]
                    base_addr = f"{', '.join(parts)}, {nearest_ward['zone_name']} Zone, Bengaluru"
                    if osm_info.get("postcode"):
                        base_addr += f" - {osm_info['postcode']}"
                elif osm_info and (osm_info.get("town") or osm_info.get("city")):
                    locality = osm_info.get("town") or osm_info.get("city")
                    district_name = osm_info.get("state_district") or nearest_ward["ward_name"]
                    base_addr = f"{locality}, {district_name}, Karnataka"
                    if osm_info.get("postcode"):
                        base_addr += f" - {osm_info['postcode']}"
                else:
                    base_addr = f"{nearest_ward['ward_name']}, {nearest_ward['zone_name']} Zone, Bengaluru"
                    if nearest_ward.get("pincode"):
                        base_addr += f" - {nearest_ward['pincode']}"

                town_name = osm_info.get("town") or osm_info.get("city") if osm_info else None
                ward_display = f"{town_name} ({nearest_ward['ward_name']})" if town_name and town_name.lower() not in nearest_ward["ward_name"].lower() else nearest_ward["ward_name"]
                region_display = f"{town_name}, Karnataka" if town_name else "Bengaluru Metropolitan"

                return {
                    "is_within_bengaluru": True,
                    "ward_number": nearest_ward["ward_number"],
                    "ward_name": ward_display,
                    "zone_name": nearest_ward["zone_name"],
                    "pincode": osm_info.get("postcode") if osm_info and osm_info.get("postcode") else nearest_ward.get("pincode"),
                    "region_name": region_display,
                    "state": osm_info.get("state") if osm_info else "Karnataka",
                    "exact_road": osm_info.get("road") if osm_info else None,
                    "exact_neighbourhood": osm_info.get("neighbourhood") if osm_info else None,
                    "display_name": osm_info.get("display_name") if osm_info else None,
                    "formatted_address": base_addr,
                    "approximate": True
                }

        # 3. Location is OUTSIDE Bengaluru BBMP: Identify true external region
        if osm_info and (osm_info.get("city") or osm_info.get("state") or osm_info.get("state_district")):
            loc_label = osm_info.get("town") or osm_info.get("city") or osm_info.get("county") or osm_info.get("state_district") or "Outside Area"
            state_label = osm_info.get("state") or "Other State"
            region_display = f"{loc_label}, {state_label}"
        else:
            nearest_region = "Outside Bengaluru"
            min_reg_dist = float("inf")
            for reg in self.REGIONAL_CENTERS:
                dist = self.haversine_distance_meters(lat, lon, reg["lat"], reg["lon"])
                if dist < min_reg_dist:
                    min_reg_dist = dist
                    nearest_region = reg["name"]

            region_display = f"{nearest_region}" if min_reg_dist <= 250000 else "Outside BBMP Jurisdiction"

        if osm_info and osm_info.get("display_name"):
            out_addr = osm_info["display_name"]
        elif osm_info and (osm_info.get("road") or osm_info.get("city")):
            parts = [p for p in [osm_info.get("road"), osm_info.get("neighbourhood"), osm_info.get("city"), osm_info.get("state")] if p]
            out_addr = ", ".join(parts)
            if osm_info.get("postcode"):
                out_addr += f" - {osm_info['postcode']}"
        else:
            out_addr = f"{region_display} ({lat:.4f}° N, {lon:.4f}° E)"

        return {
            "is_within_bengaluru": False,
            "ward_number": None,
            "ward_name": f"Outside BBMP ({region_display})",
            "zone_name": "Non-BBMP",
            "pincode": osm_info.get("postcode") if osm_info else None,
            "region_name": region_display,
            "state": osm_info.get("state") if osm_info else None,
            "exact_road": osm_info.get("road") if osm_info else None,
            "exact_neighbourhood": osm_info.get("neighbourhood") if osm_info else None,
            "display_name": osm_info.get("display_name") if osm_info else None,
            "formatted_address": out_addr,
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
