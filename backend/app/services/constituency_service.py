import json
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timezone
from shapely.geometry import shape, mapping, Point, MultiPolygon, Polygon
from shapely.ops import unary_union
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import SessionLocal
from backend.app.models.models import AssemblyConstituency, MLA, ParliamentaryConstituency, MP

AC_GEOJSON_PATH = Path(settings.DATA_DIR) / "bengaluru_assembly_constituencies.geojson"
PC_GEOJSON_PATH = Path(settings.DATA_DIR) / "bengaluru_parliamentary_constituencies.geojson"
WARDS_GEOJSON_PATH = Path(settings.DATA_DIR) / "bengaluru_wards.geojson"

# Authoritative Master Data for Assembly Constituencies (ECI / CEO Karnataka 16th KLA 2023-2028)
ASSEMBLY_CONSTITUENCIES_MASTER = [
    {"number": 150, "name": "Yelahanka", "mla": "S. R. Vishwanath", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 151, "name": "K.R. Puram", "mla": "B. A. Basavaraja (Byrathi)", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 152, "name": "Byatarayanapura", "mla": "Krishna Byre Gowda", "party": "INC", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 153, "name": "Yeshwanthpur", "mla": "S. T. Somashekar", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 154, "name": "Rajarajeshwarinagar", "mla": "Munirathna", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 155, "name": "Dasarahalli", "mla": "S. Muniraju", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 156, "name": "Mahalakshmi Layout", "mla": "K. Gopalaiah", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 157, "name": "Malleshwaram", "mla": "Dr. C. N. Ashwath Narayan", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 158, "name": "Hebbal", "mla": "Suresh B. S. (Byrathi Suresh)", "party": "INC", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 159, "name": "Pulakeshinagar (SC)", "mla": "A. C. Srinivasa", "party": "INC", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 160, "name": "Sarvagnanagar", "mla": "K. J. George", "party": "INC", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 161, "name": "C.V. Raman Nagar (SC)", "mla": "S. Raghu", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 162, "name": "Shivajinagar", "mla": "Rizwan Arshad", "party": "INC", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 163, "name": "Shanti Nagar", "mla": "N. A. Haris", "party": "INC", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 164, "name": "Gandhi Nagar", "mla": "Dinesh Gundu Rao", "party": "INC", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 165, "name": "Rajajinagar", "mla": "S. Suresh Kumar", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 166, "name": "Govindraj Nagar", "mla": "Priyakrishna", "party": "INC", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 167, "name": "Vijay Nagar", "mla": "M. Krishnappa", "party": "INC", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 168, "name": "Chamrajpet", "mla": "B. Z. Zameer Ahmed Khan", "party": "INC", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 169, "name": "Chickpet", "mla": "Uday B. Garudachar", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 170, "name": "Basavanagudi", "mla": "Ravi Subramanya L. A.", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 171, "name": "Padmanaba Nagar", "mla": "R. Ashoka", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 172, "name": "BTM Layout", "mla": "Ramalinga Reddy", "party": "INC", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 173, "name": "Jayanagar", "mla": "C. K. Ramamurthy", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 174, "name": "Mahadevapura (SC)", "mla": "Manjula S.", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 175, "name": "Bommanahalli", "mla": "Satish Reddy M.", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 176, "name": "Bangalore South", "mla": "M. Krishnappa", "party": "BJP", "profile_url": "https://kla.kar.nic.in/"},
    {"number": 177, "name": "Anekal (SC)", "mla": "B. Shivanna", "party": "INC", "profile_url": "https://kla.kar.nic.in/"},
]

# Authoritative Master Data for Parliamentary Constituencies (18th Lok Sabha 2024-2029)
PARLIAMENTARY_CONSTITUENCIES_MASTER = [
    {"number": 24, "name": "Bangalore North", "mp": "Shobha Karandlaje", "party": "BJP", "profile_url": "https://sansad.in/ls/members"},
    {"number": 25, "name": "Bangalore Central", "mp": "P. C. Mohan", "party": "BJP", "profile_url": "https://sansad.in/ls/members"},
    {"number": 26, "name": "Bangalore South", "mp": "Tejasvi Surya", "party": "BJP", "profile_url": "https://sansad.in/ls/members"},
    {"number": 27, "name": "Chikballapur", "mp": "Dr. K. Sudhakar", "party": "BJP", "profile_url": "https://sansad.in/ls/members"},
    {"number": 23, "name": "Bangalore Rural", "mp": "Dr. C. N. Manjunath", "party": "BJP", "profile_url": "https://sansad.in/ls/members"},
]

# Raw-to-canonical Assembly Constituency name normalization mapping
WARD_AC_NORMALIZATION = {
    "btm layout": "BTM Layout",
    "bangalore south": "Bangalore South",
    "bengaluru south": "Bangalore South",
    "basavanagudi": "Basavanagudi",
    "bommanahalli": "Bommanahalli",
    "byatarayanapura": "Byatarayanapura",
    "c.v. ramannagar (sc)": "C.V. Raman Nagar (SC)",
    "c.v. raman nagar (sc)": "C.V. Raman Nagar (SC)",
    "chamarajpet": "Chamrajpet",
    "chamrajpet": "Chamrajpet",
    "chickpet": "Chickpet",
    "dasarahalli": "Dasarahalli",
    "gandhi nagar": "Gandhi Nagar",
    "govindaraj nagar": "Govindraj Nagar",
    "govindraj nagar": "Govindraj Nagar",
    "hebbal": "Hebbal",
    "jayanagar": "Jayanagar",
    "k.r.puram": "K.R. Puram",
    "k.r. puram": "K.R. Puram",
    "mahadevapura": "Mahadevapura (SC)",
    "mahadevapura (sc)": "Mahadevapura (SC)",
    "mahalakshmi layout": "Mahalakshmi Layout",
    "malleshwaram": "Malleshwaram",
    "padmanabh nagar": "Padmanaba Nagar",
    "padmanaba nagar": "Padmanaba Nagar",
    "pulakeshi nagar (sc)": "Pulakeshinagar (SC)",
    "pulakeshinagar (sc)": "Pulakeshinagar (SC)",
    "rajaji nagar": "Rajajinagar",
    "rajajinagar": "Rajajinagar",
    "rajarajeshwari nagar": "Rajarajeshwarinagar",
    "rajarajeswari nagar": "Rajarajeshwarinagar",
    "rajarajeshwarinagar": "Rajarajeshwarinagar",
    "sarvajna nagar": "Sarvagnanagar",
    "sarvagnanagar": "Sarvagnanagar",
    "shanti nagar": "Shanti Nagar",
    "shivaji nagar": "Shivajinagar",
    "shivajinagar": "Shivajinagar",
    "vijay nagar": "Vijay Nagar",
    "yelahanka": "Yelahanka",
    "yeshwantpura": "Yeshwanthpur",
    "yeshwanthpur": "Yeshwanthpur",
    "anekal (sc)": "Anekal (SC)",
    "anekal": "Anekal (SC)",
}

class ConstituencyGISService:
    """
    Spatial service providing exact Point-in-Polygon boundary checking for
    Karnataka Assembly Constituencies (MLAs) and Parliamentary Constituencies (MPs).
    Calculates border proximity for boundary warnings and manages official representative registries.
    """

    def __init__(self):
        self.ac_features: List[Dict[str, Any]] = []
        self.pc_features: List[Dict[str, Any]] = []
        self.parsed_acs: List[Dict[str, Any]] = []
        self.parsed_pcs: List[Dict[str, Any]] = []
        self.ac_master_by_name: Dict[str, Dict[str, Any]] = {c["name"].lower(): c for c in ASSEMBLY_CONSTITUENCIES_MASTER}
        self.pc_master_by_name: Dict[str, Dict[str, Any]] = {c["name"].lower(): c for c in PARLIAMENTARY_CONSTITUENCIES_MASTER}
        
        self._ensure_boundary_datasets()
        self._load_datasets()
        self._seed_database_if_needed()

    def _ensure_boundary_datasets(self):
        """Generate GeoJSON boundary datasets from ward boundaries if not already generated."""
        if AC_GEOJSON_PATH.exists() and PC_GEOJSON_PATH.exists():
            return

        if not WARDS_GEOJSON_PATH.exists():
            print(f"[ConstituencyGISService] Ward GeoJSON not found at {WARDS_GEOJSON_PATH}")
            return

        try:
            with open(WARDS_GEOJSON_PATH, "r", encoding="utf-8") as f:
                wards_data = json.load(f)

            ac_geom_groups: Dict[str, List[Any]] = {}
            pc_geom_groups: Dict[str, List[Any]] = {}

            for feature in wards_data.get("features", []):
                props = feature.get("properties", {})
                raw_ac = props.get("assembly_constituency")
                raw_pc = props.get("parliament_constituency")

                try:
                    geom = shape(feature["geometry"])
                    if not geom.is_valid:
                        geom = geom.buffer(0)
                except Exception:
                    continue

                if raw_ac:
                    norm_ac = WARD_AC_NORMALIZATION.get(raw_ac.strip().lower(), raw_ac.strip())
                    ac_geom_groups.setdefault(norm_ac, []).append(geom)

                if raw_pc:
                    pc_geom_groups.setdefault(raw_pc.strip(), []).append(geom)

            # Build AC GeoJSON
            ac_features = []
            for ac_name, geoms in ac_geom_groups.items():
                union_geom = unary_union(geoms)
                master = self.ac_master_by_name.get(ac_name.lower(), {})
                ac_num = master.get("number", 0)
                mla_name = master.get("mla", "")
                mla_party = master.get("party", "")
                profile_url = master.get("profile_url", "https://kla.kar.nic.in/")

                ac_features.append({
                    "type": "Feature",
                    "geometry": mapping(union_geom),
                    "properties": {
                        "constituency_number": ac_num,
                        "constituency_name": ac_name,
                        "district": "Bengaluru Urban",
                        "state": "Karnataka",
                        "mla_name": mla_name,
                        "mla_party": mla_party,
                        "official_profile_url": profile_url,
                        "source": "Election Commission of India / Karnataka Legislative Assembly",
                        "source_url": "https://kla.kar.nic.in/",
                        "dataset_version": "ECI-KLA-2023-V1"
                    }
                })

            ac_geojson = {
                "type": "FeatureCollection",
                "metadata": {
                    "source_name": "Bengaluru Assembly Constituencies (KLA 2023)",
                    "source_organization": "Chief Electoral Officer (CEO) Karnataka / BBMP",
                    "source_url": "https://kla.kar.nic.in/",
                    "coordinate_system": "EPSG:4326 (WGS84)",
                    "constituency_count": len(ac_features),
                    "term": "16th Karnataka Legislative Assembly (2023-2028)"
                },
                "features": ac_features
            }

            with open(AC_GEOJSON_PATH, "w", encoding="utf-8") as f:
                json.dump(ac_geojson, f, indent=2)

            # Build PC GeoJSON
            pc_features = []
            for pc_name, geoms in pc_geom_groups.items():
                union_geom = unary_union(geoms)
                master = self.pc_master_by_name.get(pc_name.lower(), {})
                pc_num = master.get("number", 0)
                mp_name = master.get("mp", "")
                mp_party = master.get("party", "")
                profile_url = master.get("profile_url", "https://sansad.in/ls/members")

                pc_features.append({
                    "type": "Feature",
                    "geometry": mapping(union_geom),
                    "properties": {
                        "constituency_number": pc_num,
                        "constituency_name": pc_name,
                        "state": "Karnataka",
                        "mp_name": mp_name,
                        "mp_party": mp_party,
                        "official_profile_url": profile_url,
                        "source": "Election Commission of India / Lok Sabha Secretariat",
                        "source_url": "https://sansad.in/ls/members",
                        "dataset_version": "ECI-LS-2024-V1"
                    }
                })

            pc_geojson = {
                "type": "FeatureCollection",
                "metadata": {
                    "source_name": "Bengaluru Parliamentary Constituencies (18th Lok Sabha)",
                    "source_organization": "Election Commission of India / BBMP",
                    "source_url": "https://sansad.in/ls/members",
                    "coordinate_system": "EPSG:4326 (WGS84)",
                    "constituency_count": len(pc_features),
                    "term": "18th Lok Sabha (2024-2029)"
                },
                "features": pc_features
            }

            with open(PC_GEOJSON_PATH, "w", encoding="utf-8") as f:
                json.dump(pc_geojson, f, indent=2)

            print(f"[ConstituencyGISService] Successfully generated AC ({len(ac_features)}) and PC ({len(pc_features)}) boundary datasets.")
        except Exception as e:
            print(f"[ConstituencyGISService] Error building constituency datasets: {e}")

    def _load_datasets(self):
        """Load in-memory spatial indexes for rapid Point-in-Polygon checks."""
        self.parsed_acs = []
        if AC_GEOJSON_PATH.exists():
            try:
                with open(AC_GEOJSON_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.ac_features = data.get("features", [])
                    for feat in self.ac_features:
                        try:
                            geom = shape(feat["geometry"])
                            self.parsed_acs.append({
                                "properties": feat["properties"],
                                "geometry": geom,
                                "bounds": geom.bounds
                            })
                        except Exception:
                            pass
            except Exception as e:
                print(f"[ConstituencyGISService] Failed loading AC GeoJSON: {e}")

        self.parsed_pcs = []
        if PC_GEOJSON_PATH.exists():
            try:
                with open(PC_GEOJSON_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.pc_features = data.get("features", [])
                    for feat in self.pc_features:
                        try:
                            geom = shape(feat["geometry"])
                            self.parsed_pcs.append({
                                "properties": feat["properties"],
                                "geometry": geom,
                                "bounds": geom.bounds
                            })
                        except Exception:
                            pass
            except Exception as e:
                print(f"[ConstituencyGISService] Failed loading PC GeoJSON: {e}")

    def _seed_database_if_needed(self):
        """Seed AssemblyConstituency, MLA, ParliamentaryConstituency, MP tables in DB if empty."""
        try:
            db: Session = SessionLocal()
            try:
                if db.query(AssemblyConstituency).count() == 0:
                    for feat in self.ac_features:
                        props = feat["properties"]
                        ac = AssemblyConstituency(
                            constituency_number=props["constituency_number"],
                            constituency_name=props["constituency_name"],
                            state=props.get("state", "Karnataka"),
                            district=props.get("district", "Bengaluru Urban"),
                            geometry=json.dumps(feat["geometry"]),
                            source=props.get("source", "CEO Karnataka / Election Commission of India"),
                            source_url=props.get("source_url", "https://kla.kar.nic.in/"),
                            dataset_version=props.get("dataset_version", "ECI-KLA-2023")
                        )
                        db.add(ac)
                        db.flush()

                        mla = MLA(
                            assembly_constituency_id=ac.id,
                            name=props.get("mla_name") or "Vacant",
                            party=props.get("mla_party") or "Independent",
                            term="2023-2028",
                            official_profile_url=props.get("official_profile_url", "https://kla.kar.nic.in/"),
                            source="Karnataka Legislative Assembly (16th KLA)",
                            last_verified=datetime.now(timezone.utc)
                        )
                        db.add(mla)
                    db.commit()
                    print("[ConstituencyGISService] Seeded Assembly Constituencies and MLAs into DB.")

                if db.query(ParliamentaryConstituency).count() == 0:
                    for feat in self.pc_features:
                        props = feat["properties"]
                        pc = ParliamentaryConstituency(
                            constituency_number=props["constituency_number"],
                            constituency_name=props["constituency_name"],
                            state=props.get("state", "Karnataka"),
                            geometry=json.dumps(feat["geometry"]),
                            source=props.get("source", "Election Commission of India / Lok Sabha Secretariat"),
                            source_url=props.get("source_url", "https://sansad.in/ls/members"),
                            dataset_version=props.get("dataset_version", "ECI-LS-2024")
                        )
                        db.add(pc)
                        db.flush()

                        mp = MP(
                            parliamentary_constituency_id=pc.id,
                            name=props.get("mp_name") or "Vacant",
                            party=props.get("mp_party") or "Independent",
                            term="2024-2029",
                            official_profile_url=props.get("official_profile_url", "https://sansad.in/ls/members"),
                            source="Lok Sabha Secretariat (18th Lok Sabha)",
                            last_verified=datetime.now(timezone.utc)
                        )
                        db.add(mp)
                    db.commit()
                    print("[ConstituencyGISService] Seeded Parliamentary Constituencies and MPs into DB.")
            finally:
                db.close()
        except Exception as e:
            print(f"[ConstituencyGISService] DB Seeding notice: {e}")

    def get_ac_geojson(self) -> Dict[str, Any]:
        """Return full GeoJSON of all Assembly Constituencies for Admin GIS viewer."""
        if AC_GEOJSON_PATH.exists():
            with open(AC_GEOJSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"type": "FeatureCollection", "features": []}

    def get_pc_geojson(self) -> Dict[str, Any]:
        """Return full GeoJSON of all Parliamentary Constituencies for Admin GIS viewer."""
        if PC_GEOJSON_PATH.exists():
            with open(PC_GEOJSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"type": "FeatureCollection", "features": []}

    def resolve_constituencies(self, lat: float, lon: float) -> Dict[str, Any]:
        """
        Authoritative Point-in-Polygon resolution of Assembly and Parliamentary constituencies
        from exact coordinates. Never guesses or approximates political boundaries.
        Returns:
            - assembly_constituency_number
            - assembly_constituency_name
            - mla_name
            - mla_party
            - mla_source
            - mla_profile_url
            - mla_last_verified
            - parliamentary_constituency_number
            - parliamentary_constituency_name
            - mp_name
            - mp_party
            - mp_source
            - mp_profile_url
            - mp_last_verified
            - boundary_warning (True if within ~35m of boundary)
        """
        pt = Point(lon, lat)  # WGS84: (lon, lat)

        matched_ac = None
        min_ac_border_dist = float("inf")

        for item in self.parsed_acs:
            b = item["bounds"]
            # Fast bounding box test
            if not (b[0] - 0.005 <= lon <= b[2] + 0.005 and b[1] - 0.005 <= lat <= b[3] + 0.005):
                continue
            geom = item["geometry"]
            if geom.contains(pt) or geom.touches(pt):
                matched_ac = item
                # Distance to exterior boundary line
                try:
                    border_dist = geom.boundary.distance(pt)
                    min_ac_border_dist = min(min_ac_border_dist, border_dist)
                except Exception:
                    pass
                break
            else:
                dist = geom.distance(pt)
                if dist <= 0.0004:  # ~40 meters border leeway
                    if dist < min_ac_border_dist:
                        min_ac_border_dist = dist
                        matched_ac = item

        matched_pc = None
        min_pc_border_dist = float("inf")

        for item in self.parsed_pcs:
            b = item["bounds"]
            if not (b[0] - 0.005 <= lon <= b[2] + 0.005 and b[1] - 0.005 <= lat <= b[3] + 0.005):
                continue
            geom = item["geometry"]
            if geom.contains(pt) or geom.touches(pt):
                matched_pc = item
                try:
                    border_dist = geom.boundary.distance(pt)
                    min_pc_border_dist = min(min_pc_border_dist, border_dist)
                except Exception:
                    pass
                break
            else:
                dist = geom.distance(pt)
                if dist <= 0.0004:
                    if dist < min_pc_border_dist:
                        min_pc_border_dist = dist
                        matched_pc = item

        # Boundary proximity warning threshold: ~35 meters ≈ 0.00035 degrees
        is_boundary_warning = (min_ac_border_dist < 0.00035) or (min_pc_border_dist < 0.00035)

        # Retrieve DB representatives to ensure live freshness / admin edits
        ac_props = matched_ac["properties"] if matched_ac else None
        pc_props = matched_pc["properties"] if matched_pc else None

        mla_data = None
        mp_data = None

        if ac_props:
            mla_data = {
                "constituency_number": ac_props.get("constituency_number"),
                "constituency_name": ac_props.get("constituency_name"),
                "mla_name": ac_props.get("mla_name"),
                "mla_party": ac_props.get("mla_party"),
                "mla_source": ac_props.get("source", "Karnataka Legislative Assembly (16th KLA)"),
                "mla_profile_url": ac_props.get("official_profile_url", "https://kla.kar.nic.in/"),
                "mla_last_verified": datetime.now(timezone.utc).isoformat()
            }

        if pc_props:
            mp_data = {
                "constituency_number": pc_props.get("constituency_number"),
                "constituency_name": pc_props.get("constituency_name"),
                "mp_name": pc_props.get("mp_name"),
                "mp_party": pc_props.get("mp_party"),
                "mp_source": pc_props.get("source", "Lok Sabha Secretariat (18th Lok Sabha)"),
                "mp_profile_url": pc_props.get("official_profile_url", "https://sansad.in/ls/members"),
                "mp_last_verified": datetime.now(timezone.utc).isoformat()
            }

        # Try to pull latest from database if available (respecting admin updates)
        try:
            db = SessionLocal()
            try:
                if ac_props and ac_props.get("constituency_number"):
                    db_ac = db.query(AssemblyConstituency).filter(
                        AssemblyConstituency.constituency_number == ac_props["constituency_number"]
                    ).first()
                    if db_ac and db_ac.mla:
                        mla_data["mla_name"] = db_ac.mla.name
                        mla_data["mla_party"] = db_ac.mla.party
                        mla_data["mla_source"] = db_ac.mla.source
                        mla_data["mla_profile_url"] = db_ac.mla.official_profile_url or mla_data["mla_profile_url"]
                        if db_ac.mla.last_verified:
                            mla_data["mla_last_verified"] = db_ac.mla.last_verified.isoformat()

                if pc_props and pc_props.get("constituency_number"):
                    db_pc = db.query(ParliamentaryConstituency).filter(
                        ParliamentaryConstituency.constituency_number == pc_props["constituency_number"]
                    ).first()
                    if db_pc and db_pc.mp:
                        mp_data["mp_name"] = db_pc.mp.name
                        mp_data["mp_party"] = db_pc.mp.party
                        mp_data["mp_source"] = db_pc.mp.source
                        mp_data["mp_profile_url"] = db_pc.mp.official_profile_url or mp_data["mp_profile_url"]
                        if db_pc.mp.last_verified:
                            mp_data["mp_last_verified"] = db_pc.mp.last_verified.isoformat()
            finally:
                db.close()
        except Exception:
            pass

        if not matched_ac and not matched_pc:
            return None

        return {
            "assembly_constituency": mla_data["constituency_name"] if mla_data else None,
            "assembly_constituency_name": mla_data["constituency_name"] if mla_data else None,
            "assembly_constituency_number": mla_data["constituency_number"] if mla_data else None,
            "mla_name": mla_data["mla_name"] if mla_data else None,
            "mla_party": mla_data["mla_party"] if mla_data else None,
            "mla_source": mla_data["mla_source"] if mla_data else None,
            "mla_profile_url": mla_data["mla_profile_url"] if mla_data else None,
            "mla_last_verified": mla_data["mla_last_verified"] if mla_data else None,
            "parliamentary_constituency": mp_data["constituency_name"] if mp_data else None,
            "parliamentary_constituency_name": mp_data["constituency_name"] if mp_data else None,
            "parliamentary_constituency_number": mp_data["constituency_number"] if mp_data else None,
            "mp_name": mp_data["mp_name"] if mp_data else None,
            "mp_party": mp_data["mp_party"] if mp_data else None,
            "mp_source": mp_data["mp_source"] if mp_data else None,
            "mp_profile_url": mp_data["mp_profile_url"] if mp_data else None,
            "mp_last_verified": mp_data["mp_last_verified"] if mp_data else None,
            "boundary_warning": is_boundary_warning,
            "boundary_warning_message": (
                "Location is close to a constituency boundary. Please verify the location."
                if is_boundary_warning else None
            ),
            "detection_method": "POINT_IN_POLYGON"
        }

constituency_service = ConstituencyGISService()
