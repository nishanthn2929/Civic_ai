import json
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.models.models import (
    User, ConfigSetting, AuditLog, Incident, Ward, Department, BBMPWard, BBMPWardDataset
)
from backend.app.schemas.schemas import (
    ConfigSettingUpdate, ConfigSettingOut, AuditLogOut, UserOut
)
from backend.app.api.deps import require_role
from backend.app.services.government_adapter import govt_adapter
from backend.app.services.duplicate_engine import duplicate_engine
from backend.app.services.gis_service import gis_service
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
    elif update_data.key == "DUPLICATE_SCORE_THRESHOLD":
        duplicate_engine.threshold = float(update_data.value)
    elif update_data.key == "CONFIDENCE_THRESHOLD":
        settings.DEFAULT_CONFIDENCE_THRESHOLD = float(update_data.value)

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
    source_url: str = Form("https://bbmp.gov.in"),
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

