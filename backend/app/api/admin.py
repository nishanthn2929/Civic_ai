import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.models.models import (
    User, ConfigSetting, AuditLog, Incident, IncidentStatus, Report, ReportStatus,
    Ward, Department, BBMPWard, BBMPWardDataset,
    AssemblyConstituency, MLA, ParliamentaryConstituency, MP, utcnow
)
from backend.app.schemas.schemas import (
    ConfigSettingUpdate, ConfigSettingOut, AuditLogOut, UserOut,
    MLAOut, MLAUpdate, MPOut, MPUpdate, AssemblyConstituencyOut, ParliamentaryConstituencyOut
)
from backend.app.api.deps import require_role
from backend.app.services.government_adapter import govt_adapter
from backend.app.services.duplicate_engine import duplicate_engine
from backend.app.services.gis_service import gis_service
from backend.app.services.constituency_service import constituency_service
from backend.app.services.ward_importer import ward_importer, WardValidationException
from backend.app.core.config import settings


router = APIRouter(prefix="/admin", tags=["Administrator Controls"])

@router.get("/settings", response_model=List[ConfigSettingOut])
def get_config_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """List tunable platform parameters."""
    return db.query(ConfigSetting).all()

@router.post("/settings", response_model=ConfigSettingOut)
def update_config_setting(
    update_data: ConfigSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """Update AI threshold, duplicate radius, or weighting factors dynamically."""
    setting = db.query(ConfigSetting).filter(ConfigSetting.key == update_data.key).first()
    if not setting:
        setting = ConfigSetting(
            key=update_data.key,
            value=update_data.value,
            description=update_data.description
        )
        db.add(setting)
    else:
        setting.value = update_data.value
        if update_data.description:
            setting.description = update_data.description

    # If updating duplicate engine settings in memory
    if update_data.key == "DUPLICATE_RADIUS_METERS":
        duplicate_engine.max_radius = float(update_data.value)
    elif update_data.key in ["DUPLICATE_SCORE_THRESHOLD", "DUPLICATE_POSSIBLE_THRESHOLD"]:
        duplicate_engine.threshold = float(update_data.value)
        duplicate_engine.possible_threshold = float(update_data.value)
    elif update_data.key == "DUPLICATE_CONFIRMED_THRESHOLD":
        duplicate_engine.confirmed_threshold = float(update_data.value)
    elif update_data.key == "WEIGHT_LOCATION":
        duplicate_engine.w_loc = float(update_data.value)
    elif update_data.key == "WEIGHT_CATEGORY":
        duplicate_engine.w_cat = float(update_data.value)
    elif update_data.key == "WEIGHT_VISUAL":
        duplicate_engine.w_vis = float(update_data.value)
    elif update_data.key == "WEIGHT_TEXT":
        duplicate_engine.w_text = float(update_data.value)
    elif update_data.key == "CONFIDENCE_THRESHOLD":
        settings.DEFAULT_CONFIDENCE_THRESHOLD = float(update_data.value)
    elif update_data.key == "BLUR_THRESHOLD":
        settings.DEFAULT_BLUR_THRESHOLD = float(update_data.value)

    db.add(AuditLog(
        user_id=current_user.id,
        action="CONFIG_SETTING_UPDATED",
        entity_type="config_setting",
        entity_id=setting.id if setting.id else 0,
        details_json=json.dumps({"key": update_data.key, "value": update_data.value})
    ))

    db.commit()
    db.refresh(setting)
    return ConfigSettingOut.model_validate(setting)

@router.get("/users", response_model=List[UserOut])
def list_all_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """List system accounts for role and department assignment."""
    users = db.query(User).order_by(User.id.asc()).all()
    return [UserOut.model_validate(u) for u in users]

@router.post("/users/{user_id}/role")
def change_user_role(
    user_id: int,
    new_role: str,
    department_id: Optional[int] = None,
    ward_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """Promote citizen to authority/officer or assign to municipal ward."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    old_role = user.role
    user.role = new_role
    if department_id is not None:
        user.department_id = department_id
    if ward_id is not None:
        user.ward_id = ward_id

    db.add(AuditLog(
        user_id=current_user.id,
        action="USER_ROLE_CHANGED",
        entity_type="user",
        entity_id=user.id,
        details_json=json.dumps({"old_role": old_role, "new_role": new_role})
    ))

    db.commit()
    return {"message": f"User {user.name} role updated to {new_role}."}

@router.get("/audit-logs", response_model=List[AuditLogOut])
def get_audit_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """Regulatory audit trail inspection."""
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    out = []
    for log in logs:
        user = db.query(User).filter(User.id == log.user_id).first() if log.user_id else None
        out.append(AuditLogOut(
            id=log.id,
            user_id=log.user_id,
            user_name=user.name if user else "System",
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            details_json=log.details_json,
            created_at=log.created_at
        ))
    return out

@router.get("/government-handoff/{incident_id}")
def get_government_handoff_package(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["authority", "admin"]))
):
    """
    Generate an ethical, citizen-assisted handoff package or trigger authorized API.
    Section 30 compliant.
    """
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found.")

    if settings.GOVT_INTEGRATION_ENABLED:
        result = govt_adapter.submit_incident_to_government(incident)
        if result.get("success"):
            incident.govt_complaint_id = result.get("external_complaint_id")
            incident.govt_status = result.get("status")
            db.commit()
        return result
    else:
        # Fallback to Citizen-Assisted Handoff Package
        return govt_adapter.generate_citizen_handoff_package(incident)

# =========================================================================
# BBMP AUTHORITATIVE WARD DATA MANAGEMENT (Requirements 8 & 10)
# =========================================================================

@router.get("/wards/dataset-info")
def get_ward_dataset_info(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "authority"]))
):
    """Retrieve active BBMP ward dataset metadata, version, and validation statistics."""
    ds = db.query(BBMPWardDataset).filter(BBMPWardDataset.is_active == True).first()
    meta = gis_service.get_dataset_metadata()
    total_in_db = db.query(BBMPWard).count()

    return {
        "dataset_source": ds.source_name if ds else meta.get("source_name", "BBMP Ward Map - 198 Wards"),
        "source_organization": ds.source_organization if ds else meta.get("source_organization", "BBMP GIS Cell / Govt of Karnataka"),
        "source_url": ds.source_url if ds else meta.get("source_url", "https://data.opencity.in/dataset/bbmp-ward-information"),
        "dataset_version": ds.dataset_version if ds else meta.get("dataset_version", "BBMP-198-2015-V1"),
        "dataset_date": ds.dataset_date if ds else meta.get("dataset_date", "2015-10-01"),
        "download_date": ds.download_date if ds else meta.get("download_date", "2026-09-08"),
        "last_imported": ds.created_at.isoformat() if ds and ds.created_at else None,
        "coordinate_system": ds.coordinate_system if ds else meta.get("coordinate_system", "EPSG:4326 (WGS84)"),
        "total_wards": ds.ward_count if ds else (total_in_db or len(gis_service.wards_data)),
        "valid_wards": ds.valid_wards if ds else (total_in_db or len(gis_service.wards_data)),
        "invalid_wards": ds.invalid_wards if ds else 0,
        "license_info": ds.license_info if ds else meta.get("license", "Open Government Data (OGD) Karnataka / Public Record"),
        "source_transparency_badge": "BBMP Ward Boundaries — Official Government Source"
    }

@router.get("/wards/geojson")
def get_all_wards_geojson():
    """Export complete authoritative GeoJSON FeatureCollection of all BBMP wards."""
    return gis_service.get_all_wards_geojson()

@router.get("/wards/search")
def search_wards(
    q: str = Query(..., min_length=1, description="Ward number or name"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "authority"]))
):
    """Search wards by number or partial name and return matched boundary geometries."""
    results = []
    q_str = q.strip().lower()
    for feat in gis_service.wards_data:
        p = feat["properties"]
        wnum = str(p.get("ward_number", ""))
        wname = str(p.get("ward_name", "")).lower()
        zone = str(p.get("zone_name", "")).lower()
        if q_str in wnum or q_str in wname or q_str in zone:
            results.append({
                "ward_number": p.get("ward_number"),
                "ward_name": p.get("ward_name"),
                "zone_name": p.get("zone_name"),
                "assembly_constituency": p.get("assembly_constituency"),
                "parliament_constituency": p.get("parliament_constituency"),
                "geometry": feat.get("geometry")
            })
            if len(results) >= 25:
                break
    return {"query": q, "count": len(results), "results": results}

@router.post("/wards/detect")
def detect_ward_by_coordinates(
    payload: Dict[str, float]
):
    """Point-in-Polygon test for arbitrary GPS coordinates with boundary highlight geometry."""
    lat = payload.get("latitude")
    lon = payload.get("longitude")
    if lat is None or lon is None:
        raise HTTPException(status_code=400, detail="Latitude and Longitude are required.")

    loc = gis_service.resolve_location(lat, lon)
    highlight_geom = None
    if loc.get("is_within_bengaluru") and loc.get("ward_number"):
        for feat in gis_service.wards_data:
            if feat["properties"].get("ward_number") == loc["ward_number"]:
                highlight_geom = feat.get("geometry")
                break

    return {
        "latitude": lat,
        "longitude": lon,
        "is_within_bengaluru": loc["is_within_bengaluru"],
        "ward_number": loc["ward_number"],
        "ward_name": loc["ward_name"],
        "zone_name": loc["zone_name"],
        "formatted_address": loc.get("formatted_address"),
        "detection_method": loc.get("detection_method"),
        "source_verification": loc.get("source_verification"),
        "assembly_constituency": loc.get("assembly_constituency"),
        "assembly_constituency_number": loc.get("assembly_constituency_number"),
        "mla_name": loc.get("mla_name"),
        "mla_party": loc.get("mla_party"),
        "parliamentary_constituency": loc.get("parliamentary_constituency"),
        "parliamentary_constituency_number": loc.get("parliamentary_constituency_number"),
        "mp_name": loc.get("mp_name"),
        "mp_party": loc.get("mp_party"),
        "boundary_warning": loc.get("boundary_warning", False),
        "geometry": highlight_geom
    }

@router.post("/wards/validate")
async def validate_uploaded_dataset(
    file: UploadFile = File(...),
    source_name: str = Form("Uploaded Ward Dataset"),
    current_user: User = Depends(require_role(["admin"]))
):
    """Validate uploaded dataset file without importing (Requirement 5)."""
    filename = file.filename.lower()
    content = await file.read()

    try:
        if filename.endswith(".zip"):
            features, crs = ward_importer.parse_shapefile_zip(content)
        elif filename.endswith(".kml") or filename.endswith(".kmz"):
            features, crs = ward_importer.parse_kml(content)
        elif filename.endswith(".geojson") or filename.endswith(".json"):
            features, crs = ward_importer.parse_geojson(content)
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported format. Please upload GeoJSON (.geojson, .json), KML (.kml, .kmz), or ESRI Shapefile Zip (.zip)."
            )

        report = ward_importer.validate_features(features, crs, source_name)
        return report

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Validation failed: {str(e)}")

@router.post("/wards/import")
async def import_or_replace_dataset(
    file: UploadFile = File(...),
    source_name: str = Form(...),
    source_organization: str = Form("Government of Karnataka / BBMP"),
    source_url: str = Form("https://bbmp.karnataka.gov.in"),
    dataset_version: str = Form("BBMP-CUSTOM-V1"),
    dataset_date: str = Form("2026-09-08"),
    license_info: str = Form("Open Government Data (OGD) Karnataka / Public Record"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """Safely validate, backup, and replace the BBMP ward dataset (Requirement 10)."""
    filename = file.filename.lower()
    content = await file.read()

    try:
        if filename.endswith(".zip"):
            features, crs = ward_importer.parse_shapefile_zip(content)
        elif filename.endswith(".kml") or filename.endswith(".kmz"):
            features, crs = ward_importer.parse_kml(content)
        elif filename.endswith(".geojson") or filename.endswith(".json"):
            features, crs = ward_importer.parse_geojson(content)
        else:
            raise HTTPException(status_code=400, detail="Unsupported format.")

        metadata = {
            "source_name": source_name,
            "source_organization": source_organization,
            "source_url": source_url,
            "dataset_version": dataset_version,
            "dataset_date": dataset_date,
            "download_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "coordinate_system": crs,
            "license": license_info
        }

        result = ward_importer.import_dataset(features, metadata, db)

        db.add(AuditLog(
            user_id=current_user.id,
            action="BBMP_WARD_DATASET_REPLACED",
            entity_type="ward_dataset",
            details_json=json.dumps({
                "version": dataset_version,
                "source": source_name,
                "ward_count": result["ward_count"],
                "backup": result["backup_file"]
            })
        ))
        db.commit()

        return result

    except WardValidationException as wve:
        raise HTTPException(status_code=422, detail={
            "error": str(wve),
            "validation_report": wve.report
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")

@router.get("/wards/backups")
def list_dataset_backups(
    current_user: User = Depends(require_role(["admin"]))
):
    """List historical preserved ward boundary backups."""
    return {"backups": ward_importer.list_backups()}

# ----------------- Representative Management & GIS Endpoints -----------------
@router.get("/representatives")
def list_representatives(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "authority"]))
):
    """List all MLAs and MPs with their constituencies, parties, and verification status."""
    acs = db.query(AssemblyConstituency).order_by(AssemblyConstituency.constituency_number.asc()).all()
    pcs = db.query(ParliamentaryConstituency).order_by(ParliamentaryConstituency.constituency_number.asc()).all()
    
    mla_list = []
    for ac in acs:
        if ac.mla:
            mla_list.append({
                "id": ac.mla.id,
                "assembly_constituency_id": ac.id,
                "constituency_number": ac.constituency_number,
                "constituency_name": ac.constituency_name,
                "district": ac.district,
                "name": ac.mla.name,
                "party": ac.mla.party,
                "term": ac.mla.term,
                "official_profile_url": ac.mla.official_profile_url,
                "contact_email": ac.mla.contact_email,
                "contact_phone": ac.mla.contact_phone,
                "source": ac.mla.source,
                "last_verified": ac.mla.last_verified.isoformat() if ac.mla.last_verified else None,
                "updated_at": ac.mla.updated_at.isoformat() if ac.mla.updated_at else None
            })

    mp_list = []
    for pc in pcs:
        if pc.mp:
            mp_list.append({
                "id": pc.mp.id,
                "parliamentary_constituency_id": pc.id,
                "constituency_number": pc.constituency_number,
                "constituency_name": pc.constituency_name,
                "state": pc.state,
                "name": pc.mp.name,
                "party": pc.mp.party,
                "term": pc.mp.term,
                "official_profile_url": pc.mp.official_profile_url,
                "contact_email": pc.mp.contact_email,
                "contact_phone": pc.mp.contact_phone,
                "source": pc.mp.source,
                "last_verified": pc.mp.last_verified.isoformat() if pc.mp.last_verified else None,
                "updated_at": pc.mp.updated_at.isoformat() if pc.mp.updated_at else None
            })

    return {
        "mlas": mla_list,
        "mps": mp_list,
        "mla_count": len(mla_list),
        "mp_count": len(mp_list)
    }

@router.put("/mlas/{mla_id}")
def update_mla(
    mla_id: int,
    payload: MLAUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """Update MLA representative info with freshness audit trail."""
    mla = db.query(MLA).filter(MLA.id == mla_id).first()
    if not mla:
        raise HTTPException(status_code=404, detail="MLA record not found.")

    if payload.name is not None:
        mla.name = payload.name
    if payload.party is not None:
        mla.party = payload.party
    if payload.term is not None:
        mla.term = payload.term
    if payload.official_profile_url is not None:
        mla.official_profile_url = payload.official_profile_url
    if payload.contact_email is not None:
        mla.contact_email = payload.contact_email
    if payload.contact_phone is not None:
        mla.contact_phone = payload.contact_phone
    if payload.source is not None:
        mla.source = payload.source

    mla.last_verified = datetime.now(timezone.utc)
    mla.updated_at = datetime.now(timezone.utc)

    db.add(AuditLog(
        user_id=current_user.id,
        action="MLA_DATA_UPDATED",
        entity_type="mla",
        entity_id=mla.id,
        details_json=json.dumps({"name": mla.name, "party": mla.party})
    ))
    db.commit()
    db.refresh(mla)
    return {"message": "MLA record updated successfully.", "id": mla.id, "name": mla.name, "last_verified": mla.last_verified.isoformat()}

@router.put("/mps/{mp_id}")
def update_mp(
    mp_id: int,
    payload: MPUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """Update MP representative info with freshness audit trail."""
    mp = db.query(MP).filter(MP.id == mp_id).first()
    if not mp:
        raise HTTPException(status_code=404, detail="MP record not found.")

    if payload.name is not None:
        mp.name = payload.name
    if payload.party is not None:
        mp.party = payload.party
    if payload.term is not None:
        mp.term = payload.term
    if payload.official_profile_url is not None:
        mp.official_profile_url = payload.official_profile_url
    if payload.contact_email is not None:
        mp.contact_email = payload.contact_email
    if payload.contact_phone is not None:
        mp.contact_phone = payload.contact_phone
    if payload.source is not None:
        mp.source = payload.source

    mp.last_verified = datetime.now(timezone.utc)
    mp.updated_at = datetime.now(timezone.utc)

    db.add(AuditLog(
        user_id=current_user.id,
        action="MP_DATA_UPDATED",
        entity_type="mp",
        entity_id=mp.id,
        details_json=json.dumps({"name": mp.name, "party": mp.party})
    ))
    db.commit()
    db.refresh(mp)
    return {"message": "MP record updated successfully.", "id": mp.id, "name": mp.name, "last_verified": mp.last_verified.isoformat()}

@router.get("/gis/layers")
def get_gis_layers(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "authority"]))
):
    """
    Returns multi-layer GIS metadata and features for Admin GIS Mapping:
    - Layer 1: Civic Issue GPS Points
    - Layer 2: BBMP Wards
    - Layer 3: Assembly Constituencies
    - Layer 4: Parliamentary Constituencies
    """
    # 1. Incidents GeoJSON Points
    incidents = db.query(Incident).filter(Incident.status != "CLOSED").all()
    incident_features = []
    for inc in incidents:
        incident_features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [inc.longitude, inc.latitude]
            },
            "properties": {
                "id": inc.id,
                "incident_code": inc.incident_code,
                "category": inc.category,
                "title": inc.title,
                "severity": inc.severity,
                "status": inc.status,
                "ward_number": inc.ward_number,
                "ward_name": inc.ward_name,
                "assembly_constituency": inc.assembly_constituency_name,
                "mla_name": inc.mla_name,
                "mla_party": inc.mla_party,
                "parliamentary_constituency": inc.parliamentary_constituency_name,
                "mp_name": inc.mp_name,
                "mp_party": inc.mp_party,
                "location_source": inc.location_source,
                "gps_accuracy": inc.gps_accuracy,
                "boundary_warning": inc.boundary_warning,
                "photo_gps_available": inc.photo_gps_available,
                "created_at": inc.created_at.isoformat() if inc.created_at else None
            }
        })

    incidents_geojson = {
        "type": "FeatureCollection",
        "features": incident_features
    }

    # 2. BBMP Wards GeoJSON
    wards_geojson = gis_service.get_all_wards_geojson()

    # 3. Assembly Constituencies GeoJSON
    ac_geojson = constituency_service.get_ac_geojson()

    # 4. Parliamentary Constituencies GeoJSON
    pc_geojson = constituency_service.get_pc_geojson()

    return {
        "layer_incidents": incidents_geojson,
        "layer_wards": wards_geojson,
        "layer_assembly_constituencies": ac_geojson,
        "layer_parliamentary_constituencies": pc_geojson
    }

@router.get("/gis/assembly-constituencies")
def get_assembly_constituencies_geojson(
    current_user: User = Depends(require_role(["admin", "authority"]))
):
    """Return GeoJSON of all Karnataka Assembly Constituencies covering Bengaluru."""
    return constituency_service.get_ac_geojson()

@router.get("/gis/parliamentary-constituencies")
def get_parliamentary_constituencies_geojson(
    current_user: User = Depends(require_role(["admin", "authority"]))
):
    """Return GeoJSON of all Parliamentary Constituencies covering Bengaluru."""
    return constituency_service.get_pc_geojson()

@router.get("/duplicate-groups")
def get_duplicate_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "authority"]))
):
    """
    Retrieve all duplicate civic issue clusters, primary reports,
    attached duplicates, and multi-signal metrics.
    """
    incidents_with_dups = db.query(Incident).filter(
        (Incident.reports_count > 1) | (Incident.has_duplicates == True)
    ).order_by(Incident.reports_count.desc(), Incident.created_at.desc()).all()

    groups = []
    total_merged_reports = 0

    for inc in incidents_with_dups:
        reports = db.query(Report).filter(Report.incident_id == inc.id).order_by(Report.id.asc()).all()
        if not reports:
            continue

        primary_report = reports[0]
        duplicate_reports = reports[1:]
        total_merged_reports += len(duplicate_reports)

        dup_items = []
        for r in duplicate_reports:
            signals = {}
            if r.duplicate_signals:
                try:
                    signals = json.loads(r.duplicate_signals)
                except Exception:
                    signals = {}

            dup_items.append({
                "id": r.id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "source": r.source,
                "status": r.status,
                "duplicate_status": r.duplicate_status or "CONFIRMED_DUPLICATE",
                "duplicate_score": r.duplicate_score or 0.85,
                "signals": signals,
                "duplicate_signals": signals,
                "raw_text": r.raw_text,
                "latitude": r.latitude,
                "longitude": r.longitude,
                "address": r.address or inc.address,
                "media_url": r.media[0].media_url if r.media else None,
                "is_primary": False
            })

        avg_score = (
            sum(d["duplicate_score"] for d in dup_items) / len(dup_items)
            if dup_items else 0.85
        )

        prim_item = {
            "id": primary_report.id,
            "created_at": primary_report.created_at.isoformat() if primary_report.created_at else None,
            "source": primary_report.source,
            "status": primary_report.status,
            "duplicate_status": "PRIMARY",
            "duplicate_score": 1.0,
            "signals": {},
            "duplicate_signals": {},
            "raw_text": primary_report.raw_text,
            "latitude": primary_report.latitude,
            "longitude": primary_report.longitude,
            "address": primary_report.address or inc.address,
            "media_url": primary_report.media[0].media_url if primary_report.media else inc.primary_media_url,
            "is_primary": True
        }

        all_reports = [prim_item] + dup_items

        primary_inc = {
            "id": inc.id,
            "incident_code": inc.incident_code,
            "category": inc.category,
            "title": inc.title,
            "ward_name": inc.ward_name or (inc.ward.ward_name if inc.ward else "Bengaluru"),
            "ward_number": inc.ward_number,
            "latitude": inc.latitude,
            "longitude": inc.longitude,
            "address": inc.address,
            "primary_media_url": inc.primary_media_url,
            "created_at": inc.created_at.isoformat() if inc.created_at else None,
            "status": inc.status
        }

        groups.append({
            "group_id": inc.duplicate_group_id or f"DUP-GRP-{inc.incident_code}",
            "incident_id": inc.id,
            "incident_code": inc.incident_code,
            "category": inc.category,
            "title": inc.title,
            "ward_name": primary_inc["ward_name"],
            "ward_number": inc.ward_number,
            "latitude": inc.latitude,
            "longitude": inc.longitude,
            "address": inc.address,
            "primary_media_url": inc.primary_media_url,
            "created_at": inc.created_at.isoformat() if inc.created_at else None,
            "status": inc.status,
            "total_reports": len(reports),
            "reports_count": len(reports),
            "duplicate_count": len(duplicate_reports),
            "duplicates_count": len(duplicate_reports),
            "average_similarity_score": round(avg_score, 3),
            "avg_duplicate_score": round(avg_score, 3),
            "primary_incident": primary_inc,
            "primary_report": prim_item,
            "duplicate_reports": dup_items,
            "reports": all_reports
        })

    total_reports = db.query(Report).count()
    total_incidents = db.query(Incident).count()
    total_duplicates = db.query(Report).filter(Report.is_duplicate == True).count()

    return {
        "summary": {
            "total_reports": total_reports,
            "total_incidents": total_incidents,
            "duplicate_clusters_count": len(groups),
            "total_duplicate_reports_merged": total_duplicates,
            "estimated_duplicate_prevention_rate": round((total_duplicates / max(1, total_reports)) * 100, 1),
            "thresholds": {
                "confirmed": duplicate_engine.confirmed_threshold,
                "possible": duplicate_engine.possible_threshold,
                "search_radius_meters": duplicate_engine.max_radius,
                "weights": {
                    "location": duplicate_engine.w_loc,
                    "category": duplicate_engine.w_cat,
                    "visual": duplicate_engine.w_vis,
                    "text": duplicate_engine.w_text
                }
            }
        },
        "groups": groups
    }

@router.post("/duplicate-groups/{report_id}/unlink")
def unlink_duplicate_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """
    Unlink a misclassified duplicate report into its own distinct Incident.
    """
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    old_incident = db.query(Incident).filter(Incident.id == report.incident_id).first()
    if old_incident:
        old_incident.reports_count = max(1, old_incident.reports_count - 1)
        old_incident.duplicate_count = max(0, (old_incident.duplicate_count or 1) - 1)
        if old_incident.duplicate_count == 0:
            old_incident.has_duplicates = False

    from backend.app.services.priority_engine import priority_engine
    from backend.app.services.routing_service import routing_service
    import uuid

    dept = routing_service.get_department_for_category(db, report.category)
    calc_sev = priority_engine.calculate_severity(report.category, report.ai_confidence or 0.8)
    calc_pri = priority_engine.calculate_priority_score(calc_sev, 1, report.ai_confidence or 0.8)

    new_inc = Incident(
        incident_code=f"BLR-{report.category[:3].upper()}-{uuid.uuid4().hex[:6].upper()}",
        category=report.category,
        title=f"{report.category} at {report.address or 'Bengaluru'}",
        description=report.raw_text or f"Unlinked independent civic issue #{report.id}",
        severity=calc_sev,
        priority_score=calc_pri,
        status=IncidentStatus.VERIFIED.value,
        latitude=report.latitude,
        longitude=report.longitude,
        ward_number=report.ward_number,
        ward_name=report.ward_name,
        address=report.address,
        ward_id=report.ward_id,
        department_id=dept.id if dept else None,
        reports_count=1,
        duplicate_count=0,
        has_duplicates=False,
        primary_media_url=report.media[0].media_url if report.media else None
    )
    db.add(new_inc)
    db.flush()

    report.incident_id = new_inc.id
    report.is_duplicate = False
    report.duplicate_status = "UNLINKED_MANUAL"
    report.primary_report_id = None
    report.duplicate_group_id = None
    report.status = ReportStatus.VERIFIED.value

    db.add(AuditLog(
        user_id=current_user.id,
        action="REPORT_DUPLICATE_UNLINKED",
        entity_type="report",
        entity_id=report.id,
        details_json=json.dumps({"old_incident_id": old_incident.id if old_incident else None, "new_incident_id": new_inc.id})
    ))

    db.commit()
    return {"message": "Report successfully unlinked into new independent incident", "new_incident_code": new_inc.incident_code}



