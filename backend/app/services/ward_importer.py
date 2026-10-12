import os
import json
import zipfile
import tempfile
import xml.etree.ElementTree as ET
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union

from shapely.geometry import shape, mapping, Polygon, MultiPolygon, Point
from shapely.validation import explain_validity, make_valid
try:
    import pyproj
    from pyproj import Transformer
    HAS_PYPROJ = True
except (ImportError, Exception):
    pyproj = None
    Transformer = None
    HAS_PYPROJ = False
import shapefile  # pyshp

from backend.app.core.config import settings, BASE_DIR
from backend.app.core.database import SessionLocal
from backend.app.models.models import BBMPWard, BBMPWardDataset, Ward

DATA_DIR = Path(settings.DATA_DIR)
BACKUP_DIR = DATA_DIR / "backups"
WARDS_GEOJSON_PATH = DATA_DIR / "bengaluru_wards.geojson"

# Bounding box sanity limits for Greater Bengaluru Urban / BBMP
BENGALURU_BBOX = {
    "min_lon": 77.20,
    "max_lon": 77.95,
    "min_lat": 12.60,
    "max_lat": 13.40
}

class WardValidationException(Exception):
    def __init__(self, message: str, report: Dict[str, Any]):
        super().__init__(message)
        self.report = report

class BBMPWardImporter:
    """
    Authoritative BBMP Ward Boundary Importer, CRS Converter, and Topology Validator.
    Supports GeoJSON, Shapefiles (zip / shp), and KML/KMZ datasets.
    """

    def __init__(self):
        os.makedirs(BACKUP_DIR, exist_ok=True)

    @staticmethod
    def _parse_kml_coordinates(coords_text: str) -> List[Tuple[float, float]]:
        points = []
        for token in coords_text.strip().split():
            parts = token.split(",")
            if len(parts) >= 2:
                try:
                    lon = float(parts[0])
                    lat = float(parts[1])
                    points.append((lon, lat))
                except ValueError:
                    continue
        return points

    def parse_kml(self, kml_bytes_or_str: Union[bytes, str]) -> Tuple[List[Dict[str, Any]], str]:
        """Parse KML file and extract ward features with properties and geometry."""
        if isinstance(kml_bytes_or_str, bytes):
            root = ET.fromstring(kml_bytes_or_str)
        else:
            root = ET.fromstring(kml_bytes_or_str.encode("utf-8"))

        placemarks = root.findall(".//{http://www.opengis.net/kml/2.2}Placemark")
        features = []
        crs_name = "EPSG:4326 (OGC KML Standard WGS84)"

        for p in placemarks:
            # 1. Ward Number & Name extraction
            name_el = p.find("{http://www.opengis.net/kml/2.2}name")
            p_name = name_el.text.strip() if name_el is not None and name_el.text else ""

            # Check ExtendedData Data or SimpleData
            ed = p.find(".//{http://www.opengis.net/kml/2.2}ExtendedData")
            props: Dict[str, Any] = {}
            if ed is not None:
                # Standard Data tags
                for d in ed.findall(".//{http://www.opengis.net/kml/2.2}Data"):
                    d_name = d.attrib.get("name", "")
                    val_el = d.find("{http://www.opengis.net/kml/2.2}value")
                    props[d_name] = val_el.text.strip() if val_el is not None and val_el.text else ""
                # SimpleData tags
                for s in ed.findall(".//{http://www.opengis.net/kml/2.2}SimpleData"):
                    s_name = s.attrib.get("name", "")
                    props[s_name] = s.text.strip() if s.text else ""

            # Resolve ward number
            ward_num = None
            for key in ["ward_number", "Ward Number", "WARD_NO", "ward_no", "id", "WARD_NUM"]:
                if key in props and props[key]:
                    m = re.search(r"\d+", str(props[key]))
                    if m:
                        ward_num = int(m.group(0))
                        break
            if ward_num is None and p_name:
                m = re.search(r"\d+", p_name)
                if m:
                    ward_num = int(m.group(0))

            # Resolve ward name
            ward_name = ""
            for key in ["ward_name", "Ward Name", "WARD_NAME", "name_en", "NAME", "proposed_ward_name_en"]:
                if key in props and props[key]:
                    ward_name = re.sub(r"^\d+\s*[-:]\s*", "", str(props[key])).strip()
                    break
            if not ward_name:
                ward_name = re.sub(r"^\d+\s*[-:]\s*", "", p_name).strip() or f"Ward {ward_num}"

            # Zone name
            zone_name = (
                props.get("zone_name")
                or props.get("Zone")
                or props.get("ZONE_NAME")
                or props.get("zone")
                or "Bengaluru"
            ).strip()

            assembly_constituency = (
                props.get("assembly_constituency")
                or props.get("Assembly (MLA) Constituency ")
                or props.get("assembly_constituency_name_en")
                or props.get("AC_NAME")
                or ""
            ).strip()

            parliament_constituency = (
                props.get("parliament_constituency")
                or props.get("Parliament (MP) Constituency")
                or props.get("parliamentary_constituency_name_en")
                or props.get("PC_NAME")
                or ""
            ).strip()

            # Geometry extraction
            polygons = []
            for poly_el in p.findall(".//{http://www.opengis.net/kml/2.2}Polygon"):
                outer = poly_el.find(".//{http://www.opengis.net/kml/2.2}outerBoundaryIs//{http://www.opengis.net/kml/2.2}coordinates")
                if outer is None or not outer.text:
                    continue
                outer_pts = self._parse_kml_coordinates(outer.text)
                if len(outer_pts) < 3:
                    continue

                inners = []
                for inner_el in poly_el.findall(".//{http://www.opengis.net/kml/2.2}innerBoundaryIs//{http://www.opengis.net/kml/2.2}coordinates"):
                    if inner_el.text:
                        in_pts = self._parse_kml_coordinates(inner_el.text)
                        if len(in_pts) >= 3:
                            inners.append(in_pts)
                try:
                    poly = Polygon(outer_pts, inners)
                    if not poly.is_valid:
                        poly = make_valid(poly)
                    polygons.append(poly)
                except Exception:
                    pass

            if not polygons:
                geom = None
            elif len(polygons) == 1:
                geom = polygons[0]
            else:
                geom = MultiPolygon(polygons)

            features.append({
                "ward_number": ward_num,
                "ward_name": ward_name,
                "zone_name": zone_name,
                "assembly_constituency": assembly_constituency,
                "parliament_constituency": parliament_constituency,
                "geometry": geom,
                "properties": props
            })

        return features, crs_name

    def parse_geojson(self, geojson_bytes_or_str: Union[bytes, str]) -> Tuple[List[Dict[str, Any]], str]:
        """Parse GeoJSON file, check CRS, and extract features with geometries."""
        if isinstance(geojson_bytes_or_str, bytes):
            data = json.loads(geojson_bytes_or_str.decode("utf-8"))
        else:
            data = json.loads(geojson_bytes_or_str)

        # Detect CRS
        raw_crs = "EPSG:4326"
        transformer = None
        if "crs" in data and isinstance(data["crs"], dict):
            props = data["crs"].get("properties", {})
            crs_str = props.get("name", "")
            if "CRS84" in crs_str or "4326" in crs_str:
                raw_crs = "EPSG:4326"
            elif crs_str:
                raw_crs = crs_str
                if HAS_PYPROJ:
                    try:
                        src_proj = pyproj.CRS.from_string(crs_str)
                        if src_proj.to_epsg() != 4326:
                            transformer = Transformer.from_crs(src_proj, "EPSG:4326", always_xy=True)
                    except Exception:
                        pass

        raw_features = data.get("features", [])
        features = []

        for f in raw_features:
            props = f.get("properties", {})
            raw_geom = f.get("geometry")
            geom = None
            if raw_geom:
                try:
                    geom = shape(raw_geom)
                    # Reproject if needed
                    if transformer and not geom.is_empty:
                        def transform_coords(coords):
                            if isinstance(coords[0], (int, float)):
                                x, y = transformer.transform(coords[0], coords[1])
                                return [x, y]
                            return [transform_coords(c) for c in coords]
                        new_geom_dict = {
                            "type": raw_geom["type"],
                            "coordinates": transform_coords(raw_geom["coordinates"])
                        }
                        geom = shape(new_geom_dict)
                    if not geom.is_valid:
                        geom = make_valid(geom)
                except Exception:
                    geom = None

            # Resolve ward number
            ward_num = None
            for key in ["ward_number", "Ward Number", "WARD_NO", "ward_no", "id", "WARD_NUM", "wardNo"]:
                if key in props and props[key] is not None:
                    m = re.search(r"\d+", str(props[key]))
                    if m:
                        ward_num = int(m.group(0))
                        break

            # Resolve ward name
            ward_name = ""
            for key in ["ward_name", "Ward Name", "WARD_NAME", "name_en", "NAME", "name", "wardName"]:
                if key in props and props[key]:
                    ward_name = re.sub(r"^\d+\s*[-:]\s*", "", str(props[key])).strip()
                    break
            if not ward_name and ward_num is not None:
                ward_name = f"Ward {ward_num}"

            zone_name = (
                props.get("zone_name")
                or props.get("Zone")
                or props.get("ZONE_NAME")
                or props.get("zone")
                or "Bengaluru"
            ).strip()

            features.append({
                "ward_number": ward_num,
                "ward_name": ward_name,
                "zone_name": zone_name,
                "assembly_constituency": props.get("assembly_constituency", ""),
                "parliament_constituency": props.get("parliament_constituency", ""),
                "geometry": geom,
                "properties": props
            })

        return features, raw_crs

    def parse_shapefile_zip(self, zip_bytes: bytes) -> Tuple[List[Dict[str, Any]], str]:
        """Extract and parse ESRI Shapefile archive (.zip containing .shp, .dbf, .prj, .shx)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = Path(tmpdir) / "data.zip"
            with open(zip_path, "wb") as f:
                f.write(zip_bytes)

            with zipfile.ZipFile(zip_path, "r") as z:
                z.extractall(tmpdir)

            # Find .shp and .prj files
            shp_files = list(Path(tmpdir).rglob("*.shp"))
            if not shp_files:
                raise ValueError("No .shp shapefile found in the uploaded zip archive.")
            shp_file = shp_files[0]

            # Read CRS from .prj if available
            prj_files = list(Path(tmpdir).rglob("*.prj"))
            crs_name = "EPSG:4326"
            transformer = None
            if prj_files:
                with open(prj_files[0], "r", encoding="utf-8", errors="ignore") as pf:
                    prj_wkt = pf.read().strip()
                if HAS_PYPROJ:
                    try:
                        src_crs = pyproj.CRS.from_wkt(prj_wkt)
                        crs_name = src_crs.to_string()
                        if src_crs.to_epsg() != 4326:
                            transformer = Transformer.from_crs(src_crs, "EPSG:4326", always_xy=True)
                    except Exception:
                        crs_name = "Unspecified PRJ (Assumed EPSG:4326)"

            # Read shapefile records
            sf = shapefile.Reader(str(shp_file))
            fields = [field[0] for field in sf.fields[1:]]  # skip deletion flag
            features = []

            for shape_rec in sf.shapeRecords():
                record_dict = dict(zip(fields, shape_rec.record))
                raw_geom_dict = shape_rec.shape.__geo_interface__
                try:
                    geom = shape(raw_geom_dict)
                    if transformer and not geom.is_empty:
                        def transform_coords(coords):
                            if isinstance(coords[0], (int, float)):
                                x, y = transformer.transform(coords[0], coords[1])
                                return [x, y]
                            return [transform_coords(c) for c in coords]
                        geom = shape({
                            "type": raw_geom_dict["type"],
                            "coordinates": transform_coords(raw_geom_dict["coordinates"])
                        })
                    if not geom.is_valid:
                        geom = make_valid(geom)
                except Exception:
                    geom = None

                # Find ward number
                ward_num = None
                for key in ["ward_number", "Ward Number", "WARD_NO", "ward_no", "id", "WARD_NUM", "WARD_ID"]:
                    if key in record_dict and record_dict[key] is not None:
                        m = re.search(r"\d+", str(record_dict[key]))
                        if m:
                            ward_num = int(m.group(0))
                            break

                # Find ward name
                ward_name = ""
                for key in ["ward_name", "Ward Name", "WARD_NAME", "name_en", "NAME", "WARD_NM"]:
                    if key in record_dict and record_dict[key]:
                        ward_name = re.sub(r"^\d+\s*[-:]\s*", "", str(record_dict[key])).strip()
                        break
                if not ward_name and ward_num is not None:
                    ward_name = f"Ward {ward_num}"

                zone_name = (
                    record_dict.get("zone_name")
                    or record_dict.get("Zone")
                    or record_dict.get("ZONE_NAME")
                    or record_dict.get("ZONE")
                    or "Bengaluru"
                )

                features.append({
                    "ward_number": ward_num,
                    "ward_name": ward_name,
                    "zone_name": str(zone_name).strip(),
                    "assembly_constituency": str(record_dict.get("assembly_constituency") or record_dict.get("AC_NAME") or "").strip(),
                    "parliament_constituency": str(record_dict.get("parliament_constituency") or record_dict.get("PC_NAME") or "").strip(),
                    "geometry": geom,
                    "properties": record_dict
                })

            return features, crs_name

    def validate_features(
        self,
        features: List[Dict[str, Any]],
        crs_name: str,
        source_name: str
    ) -> Dict[str, Any]:
        """
        Validate ward dataset against Requirement 5:
        - Check that all ward polygons are valid
        - Check for missing geometries
        - Check for duplicate ward numbers
        - Check for duplicate ward names
        - Check for invalid geometries
        - Check that Bengaluru/BBMP boundaries are geographically reasonable
        """
        total_wards = len(features)
        valid_geometries = 0
        invalid_geometries = 0
        missing_geometries = 0
        missing_ward_numbers = 0
        missing_ward_names = 0
        duplicate_ward_numbers: List[int] = []
        duplicate_ward_names: List[str] = []

        seen_nums = set()
        seen_names = set()

        min_lon, min_lat = 180.0, 90.0
        max_lon, max_lat = -180.0, -90.0

        for f in features:
            # Ward Number check
            wnum = f.get("ward_number")
            if wnum is None:
                missing_ward_numbers += 1
            else:
                if wnum in seen_nums:
                    if wnum not in duplicate_ward_numbers:
                        duplicate_ward_numbers.append(wnum)
                seen_nums.add(wnum)

            # Ward Name check
            wname = f.get("ward_name")
            if not wname:
                missing_ward_names += 1
            else:
                name_key = wname.lower().strip()
                if name_key in seen_names:
                    if wname not in duplicate_ward_names:
                        duplicate_ward_names.append(wname)
                seen_names.add(name_key)

            # Geometry check
            geom = f.get("geometry")
            if geom is None or geom.is_empty:
                missing_geometries += 1
                invalid_geometries += 1
            elif not geom.is_valid:
                invalid_geometries += 1
            else:
                valid_geometries += 1
                b = geom.bounds
                min_lon = min(min_lon, b[0])
                min_lat = min(min_lat, b[1])
                max_lon = max(max_lon, b[2])
                max_lat = max(max_lat, b[3])

        # Bounding box reasonable check
        in_bengaluru_bounds = (
            min_lon >= BENGALURU_BBOX["min_lon"] - 0.1
            and max_lon <= BENGALURU_BBOX["max_lon"] + 0.1
            and min_lat >= BENGALURU_BBOX["min_lat"] - 0.1
            and max_lat <= BENGALURU_BBOX["max_lat"] + 0.1
        )

        is_valid = (
            total_wards > 0
            and invalid_geometries == 0
            and missing_ward_numbers == 0
            and len(duplicate_ward_numbers) == 0
            and in_bengaluru_bounds
        )

        report_lines = [
            "=" * 50,
            " BBMP WARD DATASET VALIDATION REPORT ",
            "=" * 50,
            f"Total wards: {total_wards}",
            f"Valid geometries: {valid_geometries}",
            f"Invalid geometries: {invalid_geometries}",
            f"Missing ward numbers: {missing_ward_numbers}",
            f"Duplicate ward numbers: {duplicate_ward_numbers if duplicate_ward_numbers else 'None'}",
            f"Missing ward names: {missing_ward_names}",
            f"Duplicate ward names: {len(duplicate_ward_names)} ({', '.join(duplicate_ward_names[:3]) + '...' if len(duplicate_ward_names) > 3 else duplicate_ward_names})",
            f"CRS: {crs_name}",
            f"Dataset source: {source_name}",
            f"Bounding Box: Lon ({min_lon:.4f} to {max_lon:.4f}), Lat ({min_lat:.4f} to {max_lat:.4f})",
            f"Geographically Reasonable for Bengaluru: {'YES' if in_bengaluru_bounds else 'NO (Out of BBMP bounds)'}",
            f"Validation Status: {'PASSED' if is_valid else 'FAILED'}",
            "=" * 50
        ]
        report_text = "\n".join(report_lines)

        return {
            "total_wards": total_wards,
            "valid_geometries": valid_geometries,
            "invalid_geometries": invalid_geometries,
            "missing_geometries": missing_geometries,
            "missing_ward_numbers": missing_ward_numbers,
            "duplicate_ward_numbers": duplicate_ward_numbers,
            "missing_ward_names": missing_ward_names,
            "duplicate_ward_names": duplicate_ward_names,
            "crs": crs_name,
            "dataset_source": source_name,
            "bounding_box": {
                "min_lon": round(min_lon, 4) if min_lon <= 180 else None,
                "min_lat": round(min_lat, 4) if min_lat <= 90 else None,
                "max_lon": round(max_lon, 4) if max_lon >= -180 else None,
                "max_lat": round(max_lat, 4) if max_lat >= -90 else None,
            },
            "is_geographically_reasonable": in_bengaluru_bounds,
            "is_valid": is_valid,
            "validation_report": report_text
        }

    def backup_existing_dataset(self) -> Optional[str]:
        """Keep a backup of the current dataset before replacing (Requirement 10)."""
        if not WARDS_GEOJSON_PATH.exists():
            return None
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        backup_file = BACKUP_DIR / f"bengaluru_wards_backup_{timestamp}.geojson"
        with open(WARDS_GEOJSON_PATH, "r", encoding="utf-8") as src, open(backup_file, "w", encoding="utf-8") as dst:
            dst.write(src.read())
        return str(backup_file)

    def import_dataset(
        self,
        features: List[Dict[str, Any]],
        metadata: Dict[str, Any],
        db_session = None
    ) -> Dict[str, Any]:
        """
        Validate, backup, and store authoritative BBMP ward dataset into SQLite & GeoJSON.
        """
        source_name = metadata.get("source_name", "Official BBMP Ward Dataset")
        source_org = metadata.get("source_organization", "Bruhat Bengaluru Mahanagara Palike (BBMP) / Govt of Karnataka")
        source_url = metadata.get("source_url", "https://data.opencity.in/dataset/bbmp-ward-information")
        dataset_version = metadata.get("dataset_version", "BBMP-OFFICIAL-V1")
        dataset_date = metadata.get("dataset_date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
        download_date = metadata.get("download_date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
        crs = metadata.get("coordinate_system", "EPSG:4326 (WGS84)")

        # 1. Run Validation
        val_result = self.validate_features(features, crs, source_name)
        if not val_result["is_valid"]:
            raise WardValidationException(
                f"Ward dataset validation failed: {val_result['invalid_geometries']} invalid geometries, {val_result['missing_ward_numbers']} missing ward numbers.",
                val_result
            )

        # 2. Backup current dataset before replacement
        backup_path = self.backup_existing_dataset()

        # 3. Build GeoJSON FeatureCollection
        geojson_features = []
        for f in features:
            geom = f["geometry"]
            props = {
                "ward_number": f["ward_number"],
                "ward_name": f["ward_name"],
                "zone_name": f.get("zone_name") or "Bengaluru",
                "assembly_constituency": f.get("assembly_constituency", ""),
                "parliament_constituency": f.get("parliament_constituency", "")
            }
            geojson_features.append({
                "type": "Feature",
                "properties": props,
                "geometry": mapping(geom)
            })

        geojson_features.sort(key=lambda x: x["properties"]["ward_number"] or 0)

        geojson_doc = {
            "type": "FeatureCollection",
            "name": "bbmp_wards_official",
            "crs": {
                "type": "name",
                "properties": {
                    "name": "urn:ogc:def:crs:OGC:1.3:CRS84"
                }
            },
            "metadata": {
                "source_name": source_name,
                "source_organization": source_org,
                "source_url": source_url,
                "dataset_version": dataset_version,
                "dataset_date": dataset_date,
                "download_date": download_date,
                "coordinate_system": crs,
                "ward_count": len(geojson_features),
                "license": metadata.get("license", "Open Government Data (OGD) Karnataka / Public Record")
            },
            "features": geojson_features
        }

        # Write to bengaluru_wards.geojson
        with open(WARDS_GEOJSON_PATH, "w", encoding="utf-8") as f:
            json.dump(geojson_doc, f, indent=2)

        # 4. Update Database Table bbmp_wards and bbmp_ward_datasets
        close_session = False
        if db_session is None:
            db_session = SessionLocal()
            close_session = True

        try:
            # Deactivate previous datasets
            db_session.query(BBMPWardDataset).update({"is_active": False})

            # Create new dataset record
            dataset_rec = BBMPWardDataset(
                source_name=source_name,
                source_organization=source_org,
                source_url=source_url,
                dataset_version=dataset_version,
                dataset_date=dataset_date,
                download_date=download_date,
                coordinate_system=crs,
                ward_count=len(features),
                valid_wards=val_result["valid_geometries"],
                invalid_wards=val_result["invalid_geometries"],
                license_info=metadata.get("license", "Open Government Data (OGD) Karnataka / Public Record"),
                is_active=True
            )
            db_session.add(dataset_rec)

            # Clear existing bbmp_wards
            db_session.query(BBMPWard).delete()

            # Insert new authoritative wards
            for gf in geojson_features:
                p = gf["properties"]
                geom_json = json.dumps(gf["geometry"])
                ward_entity = BBMPWard(
                    ward_number=p["ward_number"],
                    ward_name=p["ward_name"],
                    zone_name=p["zone_name"],
                    assembly_constituency=p["assembly_constituency"],
                    parliament_constituency=p["parliament_constituency"],
                    geometry=geom_json,
                    source=source_name,
                    source_url=source_url,
                    dataset_version=dataset_version,
                    dataset_date=dataset_date
                )
                db_session.add(ward_entity)

                # Keep legacy wards table synchronized
                legacy_ward = db_session.query(Ward).filter(Ward.ward_number == p["ward_number"]).first()
                if legacy_ward:
                    legacy_ward.ward_name = p["ward_name"]
                    legacy_ward.zone_name = p["zone_name"]
                    legacy_ward.boundary_geojson = geom_json
                else:
                    legacy_ward = Ward(
                        ward_number=p["ward_number"],
                        ward_name=p["ward_name"],
                        zone_name=p["zone_name"],
                        boundary_geojson=geom_json
                    )
                    db_session.add(legacy_ward)

            db_session.commit()
        except Exception as e:
            db_session.rollback()
            raise e
        finally:
            if close_session:
                db_session.close()

        # 5. Reload in-memory GIS Service spatial cache
        from backend.app.services.gis_service import gis_service
        gis_service.reload_wards()

        return {
            "success": True,
            "dataset_version": dataset_version,
            "ward_count": len(geojson_features),
            "backup_file": backup_path,
            "validation": val_result
        }

    def list_backups(self) -> List[Dict[str, Any]]:
        """List all preserved historical ward boundary backups."""
        backups = []
        for file in sorted(BACKUP_DIR.glob("*.geojson"), reverse=True):
            backups.append({
                "filename": file.name,
                "filepath": str(file),
                "size_bytes": file.stat().st_size,
                "created_at": datetime.fromtimestamp(file.stat().st_mtime, timezone.utc).isoformat()
            })
        return backups

ward_importer = BBMPWardImporter()
