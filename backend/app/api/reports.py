import base64
import os
import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.models.models import (
    User, Report, ReportMedia, Incident, IncidentStatus, IncidentStatusHistory,
    Ward, Department, AIDetection, AuditLog, Notification, ReportStatus
)
from backend.app.schemas.schemas import ReportCreate, ReportOut, ReportPreScreenResponse, ReportMediaOut
from backend.app.api.deps import get_current_user, get_current_active_user
from backend.app.services.ai_cv import cv_service
from backend.app.services.exif_service import exif_service
from backend.app.services.gis_service import gis_service
from backend.app.services.verification_service import verification_service
from backend.app.services.duplicate_engine import duplicate_engine
from backend.app.services.priority_engine import priority_engine
from backend.app.services.routing_service import routing_service

router = APIRouter(prefix="/reports", tags=["Reports"])

def save_media_file(data_bytes: bytes, extension: str = "jpg") -> str:
    filename = f"media_{uuid.uuid4().hex[:12]}.{extension}"
    filepath = os.path.join(settings.MEDIA_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(data_bytes)
    return f"/media/{filename}"

@router.get("/reverse-geocode")
async def reverse_geocode(
    latitude: float = Query(...),
    longitude: float = Query(...)
):
    """Resolve coordinates to exact road, street address, and Bengaluru BBMP ward/zone via Point-in-Polygon."""
    loc = gis_service.resolve_location(latitude, longitude)
    highlight_geom = None
    if loc.get("is_within_bengaluru") and loc.get("ward_number"):
        for feat in gis_service.wards_data:
            if feat["properties"].get("ward_number") == loc["ward_number"]:
                highlight_geom = feat.get("geometry")
                break

    detection_method = "POINT_IN_POLYGON" if loc.get("is_within_bengaluru") else "OUTSIDE_BBMP"
    dataset_meta = gis_service.get_dataset_metadata()

    return {
        "latitude": latitude,
        "longitude": longitude,
        "ward_name": loc["ward_name"],
        "zone_name": loc["zone_name"],
        "ward_number": loc.get("ward_number"),
        "region_name": loc.get("region_name"),
        "state": loc.get("state"),
        "pincode": loc.get("pincode"),
        "exact_road": loc.get("exact_road"),
        "exact_neighbourhood": loc.get("exact_neighbourhood"),
        "display_name": loc.get("display_name"),
        "is_within_bengaluru": loc.get("is_within_bengaluru", True),
        "formatted_address": loc.get("formatted_address"),
        "detection_method": detection_method,
        "ward_detection_method": detection_method,
        "source_verification": loc.get("source_verification", "Official Government Source (BBMP GIS Cell)"),
        "is_estimated": loc.get("is_estimated", False),
        "crs": dataset_meta.get("coordinate_system", "EPSG:4326 (WGS84)"),
        "dataset_source": dataset_meta.get("source_organization", "BBMP GIS Cell / Government of Karnataka"),
        "geometry": highlight_geom
    }

@router.get("/ward-source-info")
async def get_ward_source_info():
    """Return official BBMP ward dataset source information for transparency (Requirement 11)."""
    meta = gis_service.get_dataset_metadata()
    return {
        "title": "BBMP Ward Boundaries — Official Government Source",
        "source_organization": meta.get("source_organization", "Bruhat Bengaluru Mahanagara Palike (BBMP) GIS Cell / Government of Karnataka"),
        "dataset_version": meta.get("dataset_version", "BBMP-198-2015-V1"),
        "dataset_date": meta.get("dataset_date", "2015-10-01"),
        "coordinate_system": meta.get("coordinate_system", "EPSG:4326 (WGS84)"),
        "source_url": meta.get("source_url", "https://data.opencity.in/dataset/bbmp-ward-information"),
        "download_date": meta.get("download_date", "2026-09-08"),
        "ward_count": meta.get("ward_count", len(gis_service.wards_data)),
        "license": meta.get("license", "Open Government Data (OGD) Karnataka / Public Record")
    }

@router.get("/search-location")
async def search_location(
    q: str = Query(..., min_length=2, description="Address or landmark query")
):
    """Forward search address, road or landmark in Bengaluru with BBMP ward resolution."""
    results = gis_service.search_address(q)
    return {"results": results}

@router.post("/prescreen", response_model=ReportPreScreenResponse)
async def prescreen_report(
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    file: UploadFile = File(...)
):
    """Pre-screen uploaded photo: extracts EXIF GPS metadata, runs YOLO AI detection, blur check, and Bengaluru ward lookup."""
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # 1. Extract EXIF GPS metadata from photo
    exif_data = exif_service.extract_image_metadata(contents)
    has_exif_gps = exif_data["has_gps"]
    exif_lat = exif_data["latitude"]
    exif_lon = exif_data["longitude"]

    # Check whether photo EXIF coordinates or passed report coordinates are inside BBMP
    exif_ward = gis_service.find_ward_by_coordinates(exif_lat, exif_lon) if (has_exif_gps and exif_lat is not None and exif_lon is not None) else None
    user_ward = gis_service.find_ward_by_coordinates(latitude, longitude) if (latitude is not None and longitude is not None) else None

    # Resolution hierarchy:
    # 1. If photo has genuine EXIF GPS inside BBMP, prioritize it
    if exif_ward and exif_ward.get("is_within_bengaluru"):
        resolved_lat = exif_lat
        resolved_lon = exif_lon
        location_source = "EXIF_PHOTO_GEOTAG"
        ward_info = exif_ward
    # 2. If user provided coordinates inside BBMP, prioritize active user location
    elif user_ward and user_ward.get("is_within_bengaluru"):
        resolved_lat = latitude
        resolved_lon = longitude
        location_source = "DEVICE_OR_MANUAL"
        ward_info = user_ward
    # 3. If photo has EXIF GPS (even outside BBMP), use photo geotag
    elif has_exif_gps and exif_ward:
        resolved_lat = exif_lat
        resolved_lon = exif_lon
        location_source = "EXIF_PHOTO_GEOTAG"
        ward_info = exif_ward
    # 4. If user coordinates provided (even outside BBMP), use user coordinates
    elif user_ward:
        resolved_lat = latitude
        resolved_lon = longitude
        location_source = "DEVICE_OR_MANUAL"
        ward_info = user_ward
    # 5. Default fallback
    else:
        resolved_lat = settings.BLR_CENTER_LAT
        resolved_lon = settings.BLR_CENTER_LNG
        location_source = "DEFAULT"
        ward_info = gis_service.find_ward_by_coordinates(resolved_lat, resolved_lon) or {
            "ward_name": "Shantala Nagar",
            "ward_number": 111,
            "zone_name": "East",
            "formatted_address": "Bengaluru Central",
            "is_within_bengaluru": True
        }

    # 2. Computer Vision detection & explainable severity
    cv_res = cv_service.detect_in_image(contents)

    # 3. Department suggestion
    dept_code = routing_service.CATEGORY_TO_DEPT_CODE.get(cv_res["detected_category"], "BBMP_ROADS")

    return ReportPreScreenResponse(
        detected_category=cv_res["detected_category"],
        confidence=cv_res["confidence"],
        suggested_severity=cv_res["suggested_severity"],
        severity_reason=cv_res.get("severity_reason"),
        severity_factors=cv_res.get("severity_factors"),
        blur_score=cv_res["blur_score"],
        is_clear=cv_res["is_clear"],
        bboxes=cv_res["detections"],
        has_exif_gps=has_exif_gps,
        exif_latitude=exif_lat,
        exif_longitude=exif_lon,
        resolved_latitude=resolved_lat,
        resolved_longitude=resolved_lon,
        location_source=location_source,
        bengaluru_ward=ward_info["ward_name"],
        bengaluru_zone=ward_info.get("zone_name"),
        ward_number=ward_info.get("ward_number"),
        formatted_address=ward_info.get("formatted_address"),
        is_within_bengaluru=ward_info.get("is_within_bengaluru", True),
        suggested_department=dept_code
    )

@router.post("/create", response_model=ReportOut)
async def create_report(
    category: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    gps_accuracy: Optional[float] = Form(None),
    location_source: Optional[str] = Form("GPS"),
    raw_text: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    severity: Optional[str] = Form(None),
    severity_reason: Optional[str] = Form(None),
    source: Optional[str] = Form("manual"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    """Submit a citizen report with device GPS coordinates and point-in-polygon BBMP ward detection."""
    media_url = None
    blur_val = 150.0
    image_phash = None
    ai_conf = 0.80
    detections_list = []

    if file:
        contents = await file.read()
        media_url = save_media_file(contents)
        try:
            cv_res = cv_service.detect_in_image(contents)
            blur_val = cv_res["blur_score"]
            image_phash = cv_res["phash"]
            ai_conf = cv_res["confidence"]
            detections_list = cv_res["detections"]
            if not severity and cv_res.get("suggested_severity"):
                severity = cv_res["suggested_severity"]
            if not severity_reason and cv_res.get("severity_reason"):
                severity_reason = cv_res["severity_reason"]
        except Exception as e:
            print(f"[Warning] Image analysis error: {e}")

    # 1. Quality & Evidence Verification
    is_verified, quality_score, status_reason = verification_service.verify_report_quality(
        ai_confidence=ai_conf,
        blur_score=blur_val,
        lat=latitude,
        lon=longitude
    )

    # 2. Authoritative Point-in-Polygon Ward Lookup (Requirement 4 & 7)
    loc_res = gis_service.resolve_location(latitude, longitude)
    ward_num = loc_res.get("ward_number")
    ward_nm = loc_res.get("ward_name")
    detection_method = "POINT_IN_POLYGON" if loc_res.get("is_within_bengaluru") else "OUTSIDE_BBMP"

    ward = None
    if ward_num:
        ward = db.query(Ward).filter(Ward.ward_number == ward_num).first()

    resolved_address = address or loc_res.get("formatted_address") or "Bengaluru"

    # 3. Create Report record with exact GPS & Point-in-Polygon Ward
    user_id = current_user.id if current_user else None
    report = Report(
        user_id=user_id,
        source=source or "manual",
        raw_text=raw_text,
        category=category,
        ai_confidence=ai_conf,
        latitude=latitude,
        longitude=longitude,
        gps_accuracy=gps_accuracy,
        location_source=location_source or "GPS",
        ward_number=ward_num,
        ward_name=ward_nm,
        ward_detection_method=detection_method,
        address=resolved_address,
        ward_id=ward.id if ward else None,
        quality_score=quality_score,
        status=ReportStatus.VERIFIED.value if is_verified else ReportStatus.SUBMITTED.value
    )
    db.add(report)
    db.flush()

    # 4. Save Report Media & Detections
    if media_url:
        media_record = ReportMedia(
            report_id=report.id,
            media_url=media_url,
            image_phash=image_phash,
            blur_score=blur_val
        )
        db.add(media_record)

        for det in detections_list:
            db.add(AIDetection(
                report_id=report.id,
                class_name=det["class_name"],
                confidence=det["confidence"],
                bbox_x1=det["bbox"][0] if det.get("bbox") else None,
                bbox_y1=det["bbox"][1] if det.get("bbox") else None,
                bbox_x2=det["bbox"][2] if det.get("bbox") else None,
                bbox_y2=det["bbox"][3] if det.get("bbox") else None
            ))

    # 5. Multi-Signal Duplicate Detection Engine
    existing_incident, dup_score = duplicate_engine.find_duplicate_incident(
        db=db,
        category=category,
        lat=latitude,
        lon=longitude,
        image_phash=image_phash
    )

    if existing_incident:
        # Existing civic problem found! Attach report to existing incident
        report.incident_id = existing_incident.id
        report.status = ReportStatus.MERGED.value
        existing_incident.reports_count += 1
        
        # Upgrade incident GPS precision if new report provides higher accuracy
        if gps_accuracy is not None and (existing_incident.gps_accuracy is None or gps_accuracy < existing_incident.gps_accuracy):
            existing_incident.gps_accuracy = gps_accuracy
            existing_incident.latitude = latitude
            existing_incident.longitude = longitude
            existing_incident.location_source = location_source or "GPS"
        if not existing_incident.ward_number and ward_num:
            existing_incident.ward_number = ward_num
            existing_incident.ward_name = ward_nm
            existing_incident.ward_detection_method = detection_method

        # Recalculate incident priority based on increased reports count
        new_priority = priority_engine.calculate_priority_score(
            severity=existing_incident.severity,
            reports_count=existing_incident.reports_count,
            ai_confidence=ai_conf
        )
        existing_incident.priority_score = new_priority

        # Log status history update
        db.add(IncidentStatusHistory(
            incident_id=existing_incident.id,
            old_status=existing_incident.status,
            new_status=existing_incident.status,
            comment=f"New confirming report #{report.id} attached (Duplicate score: {dup_score:.2f}). Total reports: {existing_incident.reports_count}."
        ))
    else:
        # New civic problem detected! Create fresh Incident
        dept = routing_service.get_department_for_category(db, category)
        
        if severity and severity.upper() in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]:
            calc_severity = severity.upper()
        else:
            calc_severity = priority_engine.calculate_severity(category, ai_conf)

        calc_priority = priority_engine.calculate_priority_score(calc_severity, reports_count=1, ai_confidence=ai_conf)
        
        incident_code = f"BLR-{category[:3].upper()}-{uuid.uuid4().hex[:6].upper()}"
        initial_status = IncidentStatus.VERIFIED.value if is_verified else IncidentStatus.NEEDS_VERIFICATION.value

        incident_desc = raw_text or f"Automated {category} reported via {source}."
        if severity_reason:
            incident_desc += f"\n[Severity Rationale] {severity_reason}"

        new_incident = Incident(
            incident_code=incident_code,
            category=category,
            title=f"{category} near {report.address or 'Bengaluru'}",
            description=incident_desc,
            severity=calc_severity,
            priority_score=calc_priority,
            status=initial_status,
            latitude=latitude,
            longitude=longitude,
            gps_accuracy=gps_accuracy,
            location_source=location_source or "GPS",
            ward_number=ward_num,
            ward_name=ward_nm,
            ward_detection_method=detection_method,
            address=report.address,
            ward_id=ward.id if ward else None,
            department_id=dept.id if dept else None,
            reports_count=1,
            primary_media_url=media_url
        )
        db.add(new_incident)
        db.flush()

        report.incident_id = new_incident.id

        # Status History entry
        db.add(IncidentStatusHistory(
            incident_id=new_incident.id,
            old_status=None,
            new_status=initial_status,
            comment=f"Incident initialized from citizen report #{report.id}. {status_reason}"
        ))

    db.commit()
    db.refresh(report)

    # Return serialized report
    return ReportOut(
        id=report.id,
        source=report.source,
        raw_text=report.raw_text,
        category=report.category,
        ai_confidence=report.ai_confidence,
        latitude=report.latitude,
        longitude=report.longitude,
        gps_accuracy=report.gps_accuracy,
        location_source=report.location_source,
        ward_number=report.ward_number,
        ward_name=report.ward_name or (ward.ward_name if ward else "Bengaluru Urban"),
        ward_detection_method=report.ward_detection_method,
        address=report.address,
        ward_id=report.ward_id,
        incident_id=report.incident_id,
        status=report.status,
        created_at=report.created_at,
        media=[ReportMediaOut.model_validate(m) for m in report.media]
    )

@router.get("/my", response_model=List[ReportOut])
def get_my_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Retrieve all reports submitted by logged-in citizen."""
    reports = db.query(Report).filter(Report.user_id == current_user.id).order_by(Report.created_at.desc()).all()
    results = []
    for r in reports:
        results.append(ReportOut(
            id=r.id,
            source=r.source,
            raw_text=r.raw_text,
            category=r.category,
            ai_confidence=r.ai_confidence,
            latitude=r.latitude,
            longitude=r.longitude,
            address=r.address,
            ward_id=r.ward_id,
            ward_name=r.ward.ward_name if r.ward else "Bengaluru Urban",
            incident_id=r.incident_id,
            status=r.status,
            created_at=r.created_at,
            media=[ReportMediaOut.model_validate(m) for m in r.media]
        ))
    return results

@router.get("/{report_id}", response_model=ReportOut)
def get_report_detail(report_id: int, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    return ReportOut(
        id=report.id,
        source=report.source,
        raw_text=report.raw_text,
        category=report.category,
        ai_confidence=report.ai_confidence,
        latitude=report.latitude,
        longitude=report.longitude,
        address=report.address,
        ward_id=report.ward_id,
        ward_name=report.ward.ward_name if report.ward else "Bengaluru Urban",
        incident_id=report.incident_id,
        status=report.status,
        created_at=report.created_at,
        media=[ReportMediaOut.model_validate(m) for m in report.media]
    )
