import json
import base64
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.models.models import (
    User, Report, ReportMedia, Incident, IncidentStatus, IncidentStatusHistory,
    Ward, Department, AIDetection, AuditLog, Notification, ReportStatus, VoiceReport
)
from backend.app.schemas.schemas import (
    ReportCreate, ReportOut, ReportPreScreenResponse, ReportMediaOut,
    DuplicateCheckResponse, DuplicateMatchedIncidentOut, DuplicateSignalBreakdown
)
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
        "assembly_constituency": loc.get("assembly_constituency"),
        "assembly_constituency_number": loc.get("assembly_constituency_number"),
        "mla_name": loc.get("mla_name"),
        "mla_party": loc.get("mla_party"),
        "mla_source": loc.get("mla_source"),
        "mla_profile_url": loc.get("mla_profile_url"),
        "mla_last_verified": loc.get("mla_last_verified"),
        "parliamentary_constituency": loc.get("parliamentary_constituency"),
        "parliamentary_constituency_number": loc.get("parliamentary_constituency_number"),
        "mp_name": loc.get("mp_name"),
        "mp_party": loc.get("mp_party"),
        "mp_source": loc.get("mp_source"),
        "mp_profile_url": loc.get("mp_profile_url"),
        "mp_last_verified": loc.get("mp_last_verified"),
        "boundary_warning": loc.get("boundary_warning", False),
        "boundary_warning_message": loc.get("boundary_warning_message"),
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
    gps_accuracy: Optional[float] = Form(None),
    file: UploadFile = File(...)
):
    """
    Pre-screen uploaded photo:
    1. EXIF GPS extraction (First Priority)
    2. Device GPS fallback (Second Priority)
    3. Spatial point-in-polygon resolution of BBMP Ward, MLA & MP
    4. Boundary proximity detection
    5. RT-DETR AI detection & blur check
    """
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # 1. Extract EXIF GPS metadata from photo (First Priority)
    exif_data = exif_service.extract_image_metadata(contents)
    has_exif_gps = bool(exif_data.get("photo_gps_available") or exif_data.get("has_gps"))
    exif_lat = exif_data.get("photo_latitude") or exif_data.get("latitude")
    exif_lon = exif_data.get("photo_longitude") or exif_data.get("longitude")
    photo_alt = exif_data.get("photo_altitude")
    photo_time = exif_data.get("photo_timestamp") or exif_data.get("capture_datetime")

    resolved_lat = None
    resolved_lon = None
    location_source = "NONE"
    loc_unverified_msg = None

    if has_exif_gps and exif_lat is not None and exif_lon is not None:
        # First priority: genuine EXIF GPS from photo
        resolved_lat = exif_lat
        resolved_lon = exif_lon
        location_source = "EXIF"
    elif latitude is not None and longitude is not None:
        # Second priority: device GPS submitted with report
        resolved_lat = latitude
        resolved_lon = longitude
        location_source = "DEVICE_GPS"
    else:
        # Fallback: No location available
        location_source = "NONE"
        loc_unverified_msg = "Location could not be verified. Please enable location services or select the location on the map."

    # 2. Spatial Point-in-Polygon Ward & Constituency Determination
    ward_info = None
    if resolved_lat is not None and resolved_lon is not None:
        ward_info = gis_service.resolve_location(resolved_lat, resolved_lon)
    
    # 3. Computer Vision detection & explainable severity
    cv_res = cv_service.detect_in_image(contents)

    # 4. Department suggestion
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
        photo_gps_available=has_exif_gps,
        photo_latitude=exif_lat,
        photo_longitude=exif_lon,
        photo_altitude=photo_alt,
        photo_timestamp=photo_time,
        photo_gps_source="EXIF" if has_exif_gps else "NONE",
        resolved_latitude=resolved_lat,
        resolved_longitude=resolved_lon,
        location_source=location_source,
        bengaluru_ward=ward_info["ward_name"] if ward_info else None,
        bengaluru_zone=ward_info.get("zone_name") if ward_info else None,
        ward_number=ward_info.get("ward_number") if ward_info else None,
        formatted_address=ward_info.get("formatted_address") if ward_info else None,
        is_within_bengaluru=ward_info.get("is_within_bengaluru", False) if ward_info else False,
        suggested_department=dept_code,
        assembly_constituency=ward_info.get("assembly_constituency") if ward_info else None,
        assembly_constituency_number=ward_info.get("assembly_constituency_number") if ward_info else None,
        mla_name=ward_info.get("mla_name") if ward_info else None,
        mla_party=ward_info.get("mla_party") if ward_info else None,
        mla_source=ward_info.get("mla_source") if ward_info else None,
        mla_profile_url=ward_info.get("mla_profile_url") if ward_info else None,
        mla_last_verified=ward_info.get("mla_last_verified") if ward_info else None,
        parliamentary_constituency=ward_info.get("parliamentary_constituency") if ward_info else None,
        parliamentary_constituency_number=ward_info.get("parliamentary_constituency_number") if ward_info else None,
        mp_name=ward_info.get("mp_name") if ward_info else None,
        mp_party=ward_info.get("mp_party") if ward_info else None,
        mp_source=ward_info.get("mp_source") if ward_info else None,
        mp_profile_url=ward_info.get("mp_profile_url") if ward_info else None,
        mp_last_verified=ward_info.get("mp_last_verified") if ward_info else None,
        boundary_warning=ward_info.get("boundary_warning", False) if ward_info else False,
        boundary_warning_message=ward_info.get("boundary_warning_message") if ward_info else None,
        location_unverified_message=loc_unverified_msg
    )

def serialize_report(r: Report) -> ReportOut:
    return ReportOut(
        id=r.id,
        source=r.source,
        raw_text=r.raw_text,
        category=r.category,
        ai_confidence=r.ai_confidence,
        latitude=r.latitude,
        longitude=r.longitude,
        gps_accuracy=r.gps_accuracy,
        location_source=r.location_source,
        location_timestamp=r.location_timestamp,
        photo_latitude=r.photo_latitude,
        photo_longitude=r.photo_longitude,
        photo_gps_available=r.photo_gps_available,
        photo_gps_source=r.photo_gps_source,
        photo_altitude=r.photo_altitude,
        photo_timestamp=r.photo_timestamp,
        ward_number=r.ward_number or (r.ward.ward_number if r.ward else None),
        ward_name=r.ward_name or (r.ward.ward_name if r.ward else "Bengaluru Urban"),
        ward_detection_method=r.ward_detection_method,
        assembly_constituency_number=r.assembly_constituency_number,
        assembly_constituency_name=r.assembly_constituency_name,
        mla_name=r.mla_name,
        mla_party=r.mla_party,
        mla_source=r.mla_source,
        mla_last_verified=r.mla_last_verified,
        parliamentary_constituency_number=r.parliamentary_constituency_number,
        parliamentary_constituency_name=r.parliamentary_constituency_name,
        mp_name=r.mp_name,
        mp_party=r.mp_party,
        mp_source=r.mp_source,
        mp_last_verified=r.mp_last_verified,
        boundary_warning=r.boundary_warning,
        address=r.address,
        ward_id=r.ward_id,
        incident_id=r.incident_id,
        status=r.status,
        is_duplicate=bool(r.is_duplicate),
        duplicate_status=r.duplicate_status or "NONE",
        duplicate_score=r.duplicate_score,
        duplicate_signals=r.duplicate_signals,
        primary_report_id=r.primary_report_id,
        duplicate_group_id=r.duplicate_group_id,
        created_at=r.created_at,
        media=[ReportMediaOut.model_validate(m) for m in r.media]
    )

@router.post("/check-duplicate", response_model=DuplicateCheckResponse)
async def check_duplicate_report(
    category: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    raw_text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """
    Evaluate duplicate civic issue candidate across 4 signals:
    Location distance (<50m), Issue Category, Visual Feature Embedding, and Semantic Text.
    Returns composite score and classification rule (>=85% Confirmed, 70-84% Possible, <70% New).
    """
    image_bytes = None
    image_phash = None
    if file:
        image_bytes = await file.read()
        try:
            cv_res = cv_service.detect_in_image(image_bytes)
            image_phash = cv_res.get("phash")
        except Exception:
            pass

    cand = duplicate_engine.find_duplicate_candidate(
        db=db,
        category=category,
        lat=latitude,
        lon=longitude,
        raw_text=raw_text,
        image_bytes=image_bytes,
        image_phash=image_phash
    )

    matched_inc_data = None
    prim_rep_id = None
    if cand["matched_incident"]:
        inc = cand["matched_incident"]
        matched_inc_data = DuplicateMatchedIncidentOut(
            id=inc.id,
            incident_code=inc.incident_code,
            category=inc.category,
            title=inc.title,
            description=inc.description,
            latitude=inc.latitude,
            longitude=inc.longitude,
            address=inc.address,
            primary_media_url=inc.primary_media_url,
            created_at=inc.created_at,
            reports_count=inc.reports_count,
            status=inc.status
        )
        if cand["primary_report"]:
            prim_rep_id = cand["primary_report"].id

    return DuplicateCheckResponse(
        status=cand["status"],
        action=cand["action"],
        score=cand["score"],
        percentage=cand["percentage"],
        thresholds=cand["thresholds"],
        signals=DuplicateSignalBreakdown(**cand["signals"]),
        matched_incident=matched_inc_data,
        primary_report_id=prim_rep_id
    )

@router.post("/create", response_model=ReportOut)
async def create_report(
    category: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    gps_accuracy: Optional[float] = Form(None),
    location_source: Optional[str] = Form("GPS"),
    photo_latitude: Optional[float] = Form(None),
    photo_longitude: Optional[float] = Form(None),
    photo_gps_available_form: Optional[bool] = Form(False, alias="photo_gps_available"),
    photo_gps_source_form: Optional[str] = Form(None, alias="photo_gps_source"),
    photo_altitude_form: Optional[float] = Form(None, alias="photo_altitude"),
    photo_timestamp_form: Optional[str] = Form(None, alias="photo_timestamp"),
    raw_text: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    severity: Optional[str] = Form(None),
    severity_reason: Optional[str] = Form(None),
    source: Optional[str] = Form("manual"),
    user_action: Optional[str] = Form(None),
    target_incident_id: Optional[int] = Form(None),
    primary_report_id: Optional[int] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    """Submit a citizen report with device GPS coordinates and point-in-polygon BBMP ward detection."""
    clean_cat = (category or "").strip()
    if not clean_cat or clean_cat.lower() in ("", "none", "null", "undefined", "unrecognized", "invalid"):
        raise HTTPException(
            status_code=400, 
            detail="A valid civic issue category is required to submit a report. Unrecognized or random inputs cannot be filed."
        )

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

    # Extract photo EXIF geotag if file was provided
    photo_gps_available = False
    photo_lat = None
    photo_lon = None
    photo_alt = None
    photo_time = None
    photo_gps_source = None
    if file and 'contents' in locals():
        photo_exif = exif_service.extract_image_metadata(contents)
        photo_gps_available = bool(photo_exif.get("photo_gps_available") or photo_exif.get("has_gps"))
        photo_lat = photo_exif.get("photo_latitude") or photo_exif.get("latitude")
        photo_lon = photo_exif.get("photo_longitude") or photo_exif.get("longitude")
        photo_alt = photo_exif.get("photo_altitude")
        photo_time = photo_exif.get("photo_timestamp") or photo_exif.get("capture_datetime")
        photo_gps_source = "EXIF" if photo_gps_available else "NONE"

    # Preserve a verified browser-side GPS Camera overlay result when EXIF is
    # absent. The uploaded image itself remains the evidence source.
    if not photo_gps_available and photo_gps_available_form and photo_latitude is not None and photo_longitude is not None:
        photo_gps_available = True
        photo_lat = photo_latitude
        photo_lon = photo_longitude
        photo_alt = photo_altitude_form
        photo_time = photo_timestamp_form
        photo_gps_source = photo_gps_source_form or "PHOTO_OVERLAY_OCR"

    # A geotagged photo is the strongest evidence of where the reported issue
    # was captured. Use it consistently for the map, ward lookup, and incident.
    report_latitude = photo_lat if photo_gps_available and photo_lat is not None else latitude
    report_longitude = photo_lon if photo_gps_available and photo_lon is not None else longitude
    report_location_source = photo_gps_source if photo_gps_available else (location_source or "GPS")

    # 2. Authoritative Point-in-Polygon Ward & Constituency Lookup
    loc_res = gis_service.resolve_location(report_latitude, report_longitude)
    ward_num = loc_res.get("ward_number")
    ward_nm = loc_res.get("ward_name")
    detection_method = "POINT_IN_POLYGON" if loc_res.get("is_within_bengaluru") else "OUTSIDE_BBMP"
    ac_num = loc_res.get("assembly_constituency_number")
    ac_name = loc_res.get("assembly_constituency")
    mla_name = loc_res.get("mla_name")
    mla_party = loc_res.get("mla_party")
    mla_source = loc_res.get("mla_source")
    pc_num = loc_res.get("parliamentary_constituency_number")
    pc_name = loc_res.get("parliamentary_constituency")
    mp_name = loc_res.get("mp_name")
    mp_party = loc_res.get("mp_party")
    mp_source = loc_res.get("mp_source")
    boundary_warn = bool(loc_res.get("boundary_warning", False))

    ward = None
    if ward_num:
        ward = db.query(Ward).filter(Ward.ward_number == ward_num).first()

    resolved_address = address or loc_res.get("formatted_address") or "Bengaluru"

    # 3. Create Report record with exact GPS & Point-in-Polygon Ward & Constituencies
    user_id = current_user.id if current_user else None
    report = Report(
        user_id=user_id,
        source=source or "manual",
        raw_text=raw_text,
        category=category,
        ai_confidence=ai_conf,
        latitude=report_latitude,
        longitude=report_longitude,
        gps_accuracy=gps_accuracy,
        location_source=report_location_source,
        location_timestamp=datetime.now(timezone.utc),
        photo_latitude=photo_lat,
        photo_longitude=photo_lon,
        photo_gps_available=photo_gps_available,
        photo_gps_source=photo_gps_source,
        photo_altitude=photo_alt,
        photo_timestamp=photo_time,
        ward_number=ward_num,
        ward_name=ward_nm,
        ward_detection_method=detection_method,
        assembly_constituency_number=ac_num,
        assembly_constituency_name=ac_name,
        mla_name=mla_name,
        mla_party=mla_party,
        mla_source=mla_source,
        mla_last_verified=datetime.now(timezone.utc) if mla_name else None,
        parliamentary_constituency_number=pc_num,
        parliamentary_constituency_name=pc_name,
        mp_name=mp_name,
        mp_party=mp_party,
        mp_source=mp_source,
        mp_last_verified=datetime.now(timezone.utc) if mp_name else None,
        boundary_warning=boundary_warn,
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

    # 5. Multi-Signal Duplicate Issue Intelligence Engine
    image_embedding_vec = duplicate_engine.extract_image_embedding(contents) if file and 'contents' in locals() and contents else None
    if image_embedding_vec:
        report.image_embedding = json.dumps(image_embedding_vec)

    cand = duplicate_engine.find_duplicate_candidate(
        db=db,
        category=category,
        lat=report_latitude,
        lon=report_longitude,
        raw_text=raw_text,
        image_embedding=image_embedding_vec,
        image_phash=image_phash
    )

    dup_score = cand["score"]
    report.duplicate_score = dup_score
    report.duplicate_signals = json.dumps(cand["signals"])

    is_confirmed_dup = False
    existing_incident = None

    if user_action == "force_new":
        # Citizen explicitly chose "No, this is a different issue" from the warning dialog
        report.is_duplicate = False
        report.duplicate_status = "USER_REJECTED_DUPLICATE"
    elif user_action == "confirm_duplicate" and (target_incident_id or cand["matched_incident"]):
        # Citizen confirmed duplicate via UI prompt
        existing_incident = db.query(Incident).get(target_incident_id) if target_incident_id else cand["matched_incident"]
        if existing_incident:
            is_confirmed_dup = True
            report.is_duplicate = True
            report.duplicate_status = "USER_CONFIRMED_DUPLICATE"
    elif cand["action"] == "confirmed" and cand["matched_incident"]:
        # Rule 1: Score >= 85% -> Confirmed duplicate
        existing_incident = cand["matched_incident"]
        is_confirmed_dup = True
        report.is_duplicate = True
        report.duplicate_status = "CONFIRMED_DUPLICATE"
    elif cand["action"] == "ask_confirmation" and cand["matched_incident"]:
        # Rule 2: 70% to 84% Possible duplicate
        # Attach to incident as possible duplicate to prevent municipal duplication
        existing_incident = cand["matched_incident"]
        is_confirmed_dup = True
        report.is_duplicate = True
        report.duplicate_status = "POSSIBLE_DUPLICATE"
    else:
        # Rule 3: < 70% -> Create new report
        report.is_duplicate = False
        report.duplicate_status = "NONE"

    if is_confirmed_dup and existing_incident:
        # Existing civic problem found! Attach report to existing incident
        report.incident_id = existing_incident.id
        report.status = ReportStatus.MERGED.value

        # Link to canonical primary report of this duplicate group
        prim_rep = db.query(Report).filter(Report.incident_id == existing_incident.id).order_by(Report.id.asc()).first()
        if prim_rep and prim_rep.id != report.id:
            report.primary_report_id = prim_rep.id

        dup_grp_id = existing_incident.duplicate_group_id or f"DUP-GRP-{existing_incident.incident_code}"
        existing_incident.duplicate_group_id = dup_grp_id
        existing_incident.duplicate_count = (existing_incident.duplicate_count or 0) + 1
        existing_incident.has_duplicates = True
        report.duplicate_group_id = dup_grp_id

        existing_incident.reports_count += 1
        
        # Upgrade incident GPS precision if new report provides higher accuracy
        if gps_accuracy is not None and (existing_incident.gps_accuracy is None or gps_accuracy < existing_incident.gps_accuracy):
            existing_incident.gps_accuracy = gps_accuracy
            existing_incident.latitude = report_latitude
            existing_incident.longitude = report_longitude
            existing_incident.location_source = report_location_source
        if not existing_incident.ward_number and ward_num:
            existing_incident.ward_number = ward_num
            existing_incident.ward_name = ward_nm
            existing_incident.ward_detection_method = detection_method
        if not existing_incident.assembly_constituency_number and ac_num:
            existing_incident.assembly_constituency_number = ac_num
            existing_incident.assembly_constituency_name = ac_name
            existing_incident.mla_name = mla_name
            existing_incident.mla_party = mla_party
            existing_incident.mla_source = mla_source
            existing_incident.mla_last_verified = datetime.now(timezone.utc)
        if not existing_incident.parliamentary_constituency_number and pc_num:
            existing_incident.parliamentary_constituency_number = pc_num
            existing_incident.parliamentary_constituency_name = pc_name
            existing_incident.mp_name = mp_name
            existing_incident.mp_party = mp_party
            existing_incident.mp_source = mp_source
            existing_incident.mp_last_verified = datetime.now(timezone.utc)

        # Recalculate incident priority based on increased reports count
        new_priority = priority_engine.calculate_priority_score(
            severity=existing_incident.severity,
            reports_count=existing_incident.reports_count,
            ai_confidence=ai_conf
        )
        existing_incident.priority_score = new_priority
        existing_incident.updated_at = datetime.now(timezone.utc)

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
            latitude=report_latitude,
            longitude=report_longitude,
            gps_accuracy=gps_accuracy,
            location_source=report_location_source,
            location_timestamp=datetime.now(timezone.utc),
            photo_latitude=photo_lat,
            photo_longitude=photo_lon,
            photo_gps_available=photo_gps_available,
            photo_gps_source=photo_gps_source,
            photo_altitude=photo_alt,
            photo_timestamp=photo_time,
            ward_number=ward_num,
            ward_name=ward_nm,
            ward_detection_method=detection_method,
            assembly_constituency_number=ac_num,
            assembly_constituency_name=ac_name,
            mla_name=mla_name,
            mla_party=mla_party,
            mla_source=mla_source,
            mla_last_verified=datetime.now(timezone.utc) if mla_name else None,
            parliamentary_constituency_number=pc_num,
            parliamentary_constituency_name=pc_name,
            mp_name=mp_name,
            mp_party=mp_party,
            mp_source=mp_source,
            mp_last_verified=datetime.now(timezone.utc) if mp_name else None,
            boundary_warning=boundary_warn,
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

    return serialize_report(report)

@router.get("/my", response_model=List[ReportOut])
def get_my_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Retrieve all reports submitted by logged-in citizen."""
    reports = db.query(Report).filter(Report.user_id == current_user.id).order_by(Report.created_at.desc()).all()
    return [serialize_report(r) for r in reports]

@router.post("/batch", response_model=List[ReportOut])
def get_reports_batch(payload: dict, db: Session = Depends(get_db)):
    """Retrieve multiple reports by list of IDs (e.g. for guest submissions)."""
    ids = payload.get("ids", [])
    if not ids:
        return []
    clean_ids = [int(i) for i in ids if str(i).isdigit()][:50]
    reports = db.query(Report).filter(Report.id.in_(clean_ids)).order_by(Report.created_at.desc()).all()
    return [serialize_report(r) for r in reports]

def _clean_reports_cascade(db: Session, report_ids: list) -> int:
    if not report_ids:
        return 0
    clean_ids = [int(i) for i in report_ids if str(i).isdigit()]
    if not clean_ids:
        return 0
    # 1. Unlink duplicate relations pointing to these reports
    db.query(Report).filter(Report.primary_report_id.in_(clean_ids)).update({Report.primary_report_id: None}, synchronize_session=False)
    # 2. Delete child records
    db.query(ReportMedia).filter(ReportMedia.report_id.in_(clean_ids)).delete(synchronize_session=False)
    db.query(AIDetection).filter(AIDetection.report_id.in_(clean_ids)).delete(synchronize_session=False)
    db.query(VoiceReport).filter(VoiceReport.report_id.in_(clean_ids)).delete(synchronize_session=False)
    # 3. Delete reports
    cleared = db.query(Report).filter(Report.id.in_(clean_ids)).delete(synchronize_session=False)
    db.commit()
    return cleared

@router.delete("/my/clear")
def clear_my_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Clear all reports submitted by current logged-in user in one shot."""
    user_reports = db.query(Report).filter(Report.user_id == current_user.id).all()
    report_ids = [r.id for r in user_reports]
    cleared = _clean_reports_cascade(db, report_ids)
    return {"message": f"All user reports cleared successfully ({cleared} removed).", "cleared_count": cleared}

@router.post("/clear-stored")
def clear_stored_reports(
    payload: dict = {},
    db: Session = Depends(get_db)
):
    """Clear specified stored reports (e.g. guest reports) by IDs in one shot."""
    ids = payload.get("ids", [])
    cleared = _clean_reports_cascade(db, ids)
    return {"message": "Reports cleared in one shot.", "cleared_count": cleared}

@router.delete("/{report_id}")
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    """Delete a single report."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    
    if current_user and current_user.role not in ["admin", "authority"] and report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this report.")
    
    _clean_reports_cascade(db, [report_id])
    return {"message": "Report deleted successfully.", "id": report_id}

@router.get("/{report_id}", response_model=ReportOut)
def get_report_detail(report_id: int, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    return serialize_report(report)
