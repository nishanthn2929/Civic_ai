import base64
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.models.models import (
    User, DriveSession, DriveDetection, Report, ReportMedia, Incident,
    IncidentStatus, IncidentStatusHistory, Ward, ReportStatus, ReportSource
)
from backend.app.schemas.schemas import (
    DriveSessionStart, DriveSessionEnd, DriveDetectionFrame, DriveSessionOut
)
from backend.app.api.deps import get_current_active_user
from backend.app.services.gis_service import gis_service
from backend.app.services.ai_cv import cv_service
from backend.app.services.duplicate_engine import duplicate_engine
from backend.app.services.priority_engine import priority_engine
from backend.app.services.routing_service import routing_service
from backend.app.services.government_adapter import government_adapter

router = APIRouter(prefix="/drive", tags=["AI Dashcam Drive Mode"])

def save_base64_image(b64_string: str) -> str:
    """Helper to save base64 encoded frame from dashcam."""
    if "," in b64_string:
        b64_string = b64_string.split(",")[1]
    data = base64.b64decode(b64_string)
    filename = f"dashcam_{uuid.uuid4().hex[:12]}.jpg"
    filepath = os.path.join(settings.MEDIA_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(data)
    return f"/media/{filename}"


def _detections_payload(
    cv_result: Optional[Dict[str, Any]],
    fallback_bbox: Optional[List[float]] = None,
    fallback_confidence: Optional[float] = None,
    fallback_category: str = "Pothole"
) -> List[Dict[str, Any]]:
    """
    Convert the CV analyzer result into the client overlay payload:
    every box carries its frame-space bbox, normalized bbox and a
    LOW / MEDIUM / HIGH severity mirroring ai_cv multi-factor rules.
    Purely additive read-only shaping; no detection logic lives here.
    """
    if cv_result and cv_result.get("detections"):
        payload: List[Dict[str, Any]] = []
        for det in cv_result.get("detections", []):
            nb = det.get("normalized_bbox") or [0.0, 0.0, 1.0, 1.0]
            area = max(0.0, (nb[2] - nb[0]) * (nb[3] - nb[1]))
            conf = float(det.get("confidence", 0.0))
            if area >= 0.08 or (conf >= 0.75 and area >= 0.05):
                severity = "HIGH"
            elif area >= 0.025 or conf >= 0.60:
                severity = "MEDIUM"
            else:
                severity = "LOW"
            payload.append({
                "class_name": det.get("class_name", "Pothole"),
                "confidence": conf,
                "bbox": det.get("bbox"),
                "normalized_bbox": nb,
                "severity": severity,
            })
        return payload
    if fallback_bbox and len(fallback_bbox) == 4 and fallback_confidence is not None and fallback_confidence > 0:
        conf = float(fallback_confidence)
        severity = "HIGH" if conf >= 0.75 else "MEDIUM" if conf >= 0.50 else "LOW"
        nb = [
            round(fallback_bbox[0] / 640.0, 4),
            round(fallback_bbox[1] / 360.0, 4),
            round(fallback_bbox[2] / 640.0, 4),
            round(fallback_bbox[3] / 360.0, 4)
        ]
        return [{
            "class_name": fallback_category or "Pothole",
            "confidence": conf,
            "bbox": fallback_bbox,
            "normalized_bbox": nb,
            "severity": severity,
        }]
    return []

@router.post("/sessions/start", response_model=DriveSessionOut)
def start_drive_session(
    data: DriveSessionStart,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Start an AI Dashcam monitoring session for an authenticated citizen.
    Logs the initialization request without exposing sensitive tokens.
    """
    auth_header = request.headers.get("Authorization")
    auth_state = "present" if auth_header else "missing"
    print(f"[Drive Mode]\nInitialization request\nEndpoint: /api/drive/sessions/start\nAuthentication: {auth_state}\nResponse status: 200\nResponse message: Active drive session started successfully for user {current_user.id}")

    session = DriveSession(
        user_id=current_user.id,
        start_time=datetime.now(timezone.utc),
        status="ACTIVE"
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return DriveSessionOut.model_validate(session)

@router.post("/sessions/end", response_model=DriveSessionOut)
def end_drive_session(
    data: DriveSessionEnd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Safely end the Drive Mode session and finalize trip statistics."""
    session = db.query(DriveSession).filter(
        DriveSession.id == data.session_id,
        DriveSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Drive session not found.")

    session.end_time = datetime.now(timezone.utc)
    session.distance_km = data.distance_km or session.distance_km
    session.status = "COMPLETED"
    db.commit()
    db.refresh(session)
    return DriveSessionOut.model_validate(session)

@router.post("/process-frame")
def process_dashcam_frame(
    frame: DriveDetectionFrame,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Autonomous Road Defect Detection Pipeline:
    1. GPS Accuracy Validation (Hold if > 50m)
    2. Confidence Thresholding (Configurable)
    3. Temporal Consecutive-Frame Verification (Merge consecutive frames of same defect into ONE incident)
    4. Authoritative BBMP Ward, MLA & MP Point-in-Polygon
    5. Multi-Signal Spatial Duplicate Detection (< 15-25m)
    6. Government Reporting Adapter Routing
    """
    session = db.query(DriveSession).filter(
        DriveSession.id == frame.session_id,
        DriveSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Active drive session not found.")

    session.frames_processed += 1

    DRIVE_MODE_DEFAULT_THRESHOLD = 0.65
    client_thresh = float(frame.confidence) if (frame.confidence and frame.confidence >= 0.15) else None
    effective_thresh = client_thresh if client_thresh is not None else DRIVE_MODE_DEFAULT_THRESHOLD

    # For real camera frames, use the configured detector as the source of
    # truth. The client confidence is only a simulation fallback.
    cv_analysis = None
    if frame.image_base64:
        try:
            encoded = frame.image_base64.split(",", 1)[1] if "," in frame.image_base64 else frame.image_base64
            detected_bytes = base64.b64decode(encoded)
            cv_result = cv_service.detect_in_image(
                detected_bytes,
                confidence_threshold=effective_thresh
            )
            cv_analysis = cv_result
            valid_pothole_classes = {"pothole", "road damage", "road crack", "road_crack", "road_damage", "item"}
            pothole_detections = [
                detection for detection in cv_result.get("detections", [])
                if (detection.get("class_name") or "").lower() in valid_pothole_classes
            ]
            if not pothole_detections:
                db.commit()
                return {
                    "status": "IGNORED_NO_POTHOLE",
                    "message": "The camera frame did not contain a pothole.",
                    "session_detections_count": session.detections_count,
                    "detections": []
                }
            strongest = max(pothole_detections, key=lambda detection: detection.get("confidence", 0.0))
            frame.category = "Pothole"
            frame.confidence = float(strongest["confidence"])
            frame.bbox = strongest.get("bbox", frame.bbox)
        except Exception as exc:
            db.commit()
            print(f"[Drive Mode CV Warning] {exc}")
            return {
                "status": "IGNORED_INVALID_FRAME",
                "message": "The camera frame could not be analyzed.",
                "session_detections_count": session.detections_count,
                "detections": []
            }

    # 1. GPS Accuracy Validation (Section 5)
    # 0-20m = High confidence, 20-50m = Acceptable, >50m = Poor (Hold detection)
    if frame.gps_accuracy is not None and frame.gps_accuracy > 50.0:
        db.commit()
        return {
            "status": "HELD_LOW_GPS_ACCURACY",
            "message": "GPS accuracy is too low to create a verified incident.",
            "gps_accuracy": frame.gps_accuracy,
            "threshold": 50.0,
            "session_detections_count": session.detections_count,
            "detections": _detections_payload(cv_analysis, frame.bbox, frame.confidence, frame.category),
            "bbox": frame.bbox
        }

    # 2. Confidence Threshold Check (Section 7)
    if frame.confidence < effective_thresh:
        db.commit()
        return {
            "status": "IGNORED_LOW_CONFIDENCE",
            "confidence": frame.confidence,
            "threshold": effective_thresh,
            "session_detections_count": session.detections_count,
            "detections": _detections_payload(cv_analysis, frame.bbox, frame.confidence, frame.category),
            "bbox": frame.bbox
        }

    now = datetime.now(timezone.utc)

    # 3. Temporal Verification: Consecutive Frame Merging (Section 8)
    # If the same defect is detected within 2.5s and 15m, merge into current event
    recent_detections = db.query(DriveDetection).filter(
        DriveDetection.session_id == session.id
    ).order_by(DriveDetection.timestamp.desc()).limit(10).all()

    for past_det in recent_detections:
        past_time = past_det.timestamp
        if past_time.tzinfo is None:
            past_time = past_time.replace(tzinfo=timezone.utc)
        time_delta_sec = (now - past_time).total_seconds()
        
        if time_delta_sec <= settings.TEMPORAL_WINDOW_SECONDS:
            dist = gis_service.haversine_distance_meters(
                frame.latitude, frame.longitude, past_det.latitude, past_det.longitude
            )
            if dist <= settings.TEMPORAL_SPATIAL_RADIUS_METERS:
                # SAME POTHOLE DETECTED ACROSS CONSECUTIVE FRAMES!
                # Update confidence if current frame is higher quality
                if frame.confidence > past_det.confidence:
                    past_det.confidence = frame.confidence
                db.commit()
                return {
                    "status": "TEMPORAL_SUPPRESSED",
                    "message": "Consecutive frame of current road defect merged into existing incident.",
                    "session_detections_count": session.detections_count,
                    "incident_id": past_det.incident_id,
                    "latitude": frame.latitude,
                    "longitude": frame.longitude,
                    "category": frame.category,
                    "confidence": frame.confidence,
                    "detections": _detections_payload(cv_analysis, frame.bbox, frame.confidence, frame.category),
                    "bbox": frame.bbox
                }

    # If client explicitly requests candidate review before submitting civic report
    if frame.confirmed_submission is False:
        location = gis_service.resolve_location(frame.latitude, frame.longitude, fetch_osm=False) or {}
        db.commit()
        return {
            "status": "CANDIDATE_DETECTED",
            "category": frame.category or "Pothole",
            "confidence": frame.confidence,
            "latitude": frame.latitude,
            "longitude": frame.longitude,
            "gps_accuracy": frame.gps_accuracy,
            "speed": frame.speed,
            "heading": frame.heading,
            "ward_number": location.get("ward_number"),
            "ward_name": location.get("ward_name") or "BBMP ward could not be determined.",
            "zone_name": location.get("zone_name"),
            "formatted_address": location.get("formatted_address"),
            "is_within_bengaluru": location.get("is_within_bengaluru", False),
            "evidence_url": None,
            "session_detections_count": session.detections_count,
            "detections": _detections_payload(cv_analysis, frame.bbox, frame.confidence, frame.category),
            "bbox": frame.bbox
        }

    # 4. Verified Pothole Event: Decode Image & Compute Perceptual Hash
    evidence_url = None
    phash = None
    if frame.image_base64:
        try:
            evidence_url = save_base64_image(frame.image_base64)
            if cv_analysis and "phash" in cv_analysis:
                phash = cv_analysis.get("phash")
            else:
                data = base64.b64decode(frame.image_base64.split(",")[1] if "," in frame.image_base64 else frame.image_base64)
                cv_res = cv_service.detect_in_image(data)
                phash = cv_res.get("phash")
        except Exception as e:
            print(f"[Dashcam Frame Warning] {e}")

    session.detections_count += 1

    # 5. Authoritative Point-in-Polygon Ward, MLA & MP Resolution (Sections 10, 11, 12)
    loc_info = gis_service.resolve_location(frame.latitude, frame.longitude, fetch_osm=False) or {}
    ward_num = loc_info.get("ward_number")
    ward_name = loc_info.get("ward_name")
    ward_zone = loc_info.get("zone_name") or "Bengaluru"
    ac_num = loc_info.get("assembly_constituency_number")
    ac_name = loc_info.get("assembly_constituency_name") or loc_info.get("assembly_constituency")
    mla_name = loc_info.get("mla_name")
    mla_party = loc_info.get("mla_party")
    mla_source = loc_info.get("mla_source")
    mla_verified = loc_info.get("mla_last_verified")
    pc_num = loc_info.get("parliamentary_constituency_number")
    pc_name = loc_info.get("parliamentary_constituency_name") or loc_info.get("parliamentary_constituency")
    mp_name = loc_info.get("mp_name")
    mp_party = loc_info.get("mp_party")
    mp_source = loc_info.get("mp_source")
    mp_verified = loc_info.get("mp_last_verified")
    boundary_warn = loc_info.get("boundary_warning", False)
    boundary_msg = loc_info.get("boundary_warning_message")

    def _safe_dt(val):
        if not val:
            return None
        if isinstance(val, datetime):
            return val
        try:
            return datetime.fromisoformat(str(val))
        except Exception:
            return None

    ward = None
    if ward_num:
        ward = db.query(Ward).filter(Ward.ward_number == ward_num).first()

    # 6. Multi-Signal Spatial Duplicate Incident Check (Section 17)
    existing_incident, dup_score = duplicate_engine.find_duplicate_incident(
        db=db,
        category=frame.category,
        lat=frame.latitude,
        lon=frame.longitude,
        image_phash=phash
    )

    incident_id = None
    inc_code = None
    is_new = False

    if existing_incident:
        # Merge with existing physical civic incident
        incident_id = existing_incident.id
        inc_code = existing_incident.incident_code
        existing_incident.reports_count += 1
        existing_incident.priority_score = priority_engine.calculate_priority_score(
            severity=existing_incident.severity,
            reports_count=existing_incident.reports_count,
            ai_confidence=frame.confidence
        )
        # Status remains verified; priority & reports count incremented without spamming status history
    else:
        # Create brand new verified incident (Section 13)
        is_new = True
        session.confirmed_incidents_count += 1
        dept = routing_service.get_department_for_category(db, frame.category)
        calc_sev = priority_engine.calculate_severity(frame.category, frame.confidence)
        calc_pri = priority_engine.calculate_priority_score(calc_sev, 1, frame.confidence)
        inc_code = f"BLR-DASH-{uuid.uuid4().hex[:6].upper()}"

        new_inc = Incident(
            incident_code=inc_code,
            category=frame.category,
            title=f"Dashcam detected {frame.category} at {ward_name or 'Bengaluru'}",
            description=f"Verified {frame.category} logged via AI Dashcam Drive Mode with {frame.confidence*100:.1f}% confidence.",
            severity=calc_sev,
            priority_score=calc_pri,
            status=IncidentStatus.VERIFIED.value,
            latitude=frame.latitude,
            longitude=frame.longitude,
            gps_accuracy=frame.gps_accuracy,
            location_source="DEVICE_GPS",
            location_timestamp=now,
            ward_number=ward_num,
            ward_name=ward_name,
            ward_detection_method="POINT_IN_POLYGON" if loc_info.get("is_within_bengaluru") else "OUTSIDE_BBMP",
            assembly_constituency_number=ac_num,
            assembly_constituency_name=ac_name,
            mla_name=mla_name,
            mla_party=mla_party,
            mla_source=mla_source,
            mla_last_verified=_safe_dt(mla_verified),
            parliamentary_constituency_number=pc_num,
            parliamentary_constituency_name=pc_name,
            mp_name=mp_name,
            mp_party=mp_party,
            mp_source=mp_source,
            mp_last_verified=_safe_dt(mp_verified),
            boundary_warning=boundary_warn,
            address=loc_info.get("formatted_address") or f"{ward_name or 'Bengaluru'}, Karnataka",
            ward_id=ward.id if ward else None,
            department_id=dept.id if dept else None,
            reports_count=1,
            primary_media_url=evidence_url
        )
        db.add(new_inc)
        db.flush()
        incident_id = new_inc.id

        # 7. Government Reporting Adapter Submission (Sections 14, 15, 16)
        adapter_res = government_adapter.create_complaint({
            "incident_code": inc_code,
            "category": frame.category,
            "latitude": frame.latitude,
            "longitude": frame.longitude,
            "gps_accuracy": frame.gps_accuracy,
            "ward_number": ward_num,
            "ward_name": ward_name,
            "assembly_constituency": ac_name,
            "mla_name": mla_name,
            "parliamentary_constituency": pc_name,
            "mp_name": mp_name,
            "primary_media_url": evidence_url,
            "priority_score": calc_pri
        })

        db.add(IncidentStatusHistory(
            incident_id=new_inc.id,
            old_status=None,
            new_status=IncidentStatus.VERIFIED.value,
            comment=f"New incident verified via AI Dashcam. Status: {adapter_res.get('submission_status')} — {adapter_res.get('message')}"
        ))

    # 8. Log Drive Detection
    drive_det = DriveDetection(
        session_id=session.id,
        timestamp=now,
        latitude=frame.latitude,
        longitude=frame.longitude,
        category=frame.category,
        confidence=frame.confidence,
        bbox_json=str(frame.bbox),
        evidence_url=evidence_url,
        incident_id=incident_id
    )
    db.add(drive_det)

    # 9. Log Citizen Report
    rep = Report(
        user_id=current_user.id,
        source=ReportSource.DASHCAM.value,
        raw_text=f"Dashcam AI road detection (Confidence: {frame.confidence*100:.1f}%)",
        category=frame.category,
        ai_confidence=frame.confidence,
        latitude=frame.latitude,
        longitude=frame.longitude,
        gps_accuracy=frame.gps_accuracy,
        location_source="DEVICE_GPS",
        location_timestamp=now,
        ward_number=ward_num,
        ward_name=ward_name,
        ward_detection_method="POINT_IN_POLYGON" if loc_info.get("is_within_bengaluru") else "OUTSIDE_BBMP",
        assembly_constituency_number=ac_num,
        assembly_constituency_name=ac_name,
        mla_name=mla_name,
        mla_party=mla_party,
        mla_source=mla_source,
        mla_last_verified=_safe_dt(mla_verified),
        parliamentary_constituency_number=pc_num,
        parliamentary_constituency_name=pc_name,
        mp_name=mp_name,
        mp_party=mp_party,
        mp_source=mp_source,
        mp_last_verified=_safe_dt(mp_verified),
        boundary_warning=boundary_warn,
        address=loc_info.get("formatted_address") or f"{ward_name or 'Bengaluru'}, Karnataka",
        ward_id=ward.id if ward else None,
        incident_id=incident_id,
        quality_score=0.95,
        status=ReportStatus.VERIFIED.value
    )
    db.add(rep)
    db.flush()

    if evidence_url:
        db.add(ReportMedia(
            report_id=rep.id,
            media_url=evidence_url,
            image_phash=phash,
            blur_score=180.0
        ))

    db.commit()

    govt_status_label = (
        "Verified / Pending Official Submission"
        if not government_adapter.is_configured()
        else "Officially Submitted to BBMP"
    )

    govt_status_message = (
        "Verified incident created. Official submission is pending because the government reporting API is not configured."
        if not government_adapter.is_configured()
        else "Official complaint registered with municipal authority."
    )

    return {
        "status": "EVENT_LOGGED",
        "category": frame.category,
        "confidence": frame.confidence,
        "incident_id": incident_id,
        "incident_code": inc_code,
        "is_new_incident": is_new,
        "latitude": frame.latitude,
        "longitude": frame.longitude,
        "gps_accuracy": frame.gps_accuracy,
        "speed": frame.speed,
        "heading": frame.heading,
        "ward_number": ward_num,
        "ward_name": ward_name or "Bengaluru Urban",
        "zone_name": ward_zone,
        "assembly_constituency": ac_name or "Bengaluru Urban",
        "mla_name": mla_name or "Not Seeded",
        "mla_party": mla_party or "N/A",
        "parliamentary_constituency": pc_name or "Bengaluru",
        "mp_name": mp_name or "Not Seeded",
        "mp_party": mp_party or "N/A",
        "boundary_warning": boundary_warn,
        "boundary_warning_message": boundary_msg,
        "report_status": govt_status_label,
        "government_message": govt_status_message,
        "evidence_url": evidence_url,
        "session_detections_count": session.detections_count,
        "confirmed_incidents_count": session.confirmed_incidents_count,
        "detections": _detections_payload(cv_analysis, frame.bbox, frame.confidence, frame.category),
        "bbox": frame.bbox
    }

@router.post("/sync-offline")
def sync_offline_frames(
    frames: List[DriveDetectionFrame],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Synchronize offline queued drive detections when network connectivity is restored (Section 23).
    Deduplicates against existing database incidents to prevent duplicate reporting.
    """
    synced_count = 0
    verified_count = 0
    merged_count = 0

    for frame in frames:
        try:
            res = process_dashcam_frame(frame, db, current_user)
            synced_count += 1
            if res.get("status") == "EVENT_LOGGED":
                if res.get("is_new_incident"):
                    verified_count += 1
                else:
                    merged_count += 1
            elif res.get("status") == "TEMPORAL_SUPPRESSED":
                merged_count += 1
        except Exception as e:
            print(f"[Offline Sync Warning] {e}")

    return {
        "status": "SYNC_COMPLETED",
        "synced_frames": synced_count,
        "verified_incidents": verified_count,
        "merged_duplicates": merged_count
    }

@router.get("/sessions/my", response_model=List[DriveSessionOut])
def get_my_drive_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List historical drive sessions for the citizen."""
    sessions = db.query(DriveSession).filter(
        DriveSession.user_id == current_user.id
    ).order_by(DriveSession.start_time.desc()).all()
    return [DriveSessionOut.model_validate(s) for s in sessions]
