import base64
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
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
from backend.app.api.deps import get_current_active_user, get_current_user
from backend.app.services.gis_service import gis_service
from backend.app.services.ai_cv import cv_service
from backend.app.services.duplicate_engine import duplicate_engine
from backend.app.services.priority_engine import priority_engine
from backend.app.services.routing_service import routing_service

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

@router.post("/sessions/start", response_model=DriveSessionOut)
def start_drive_session(
    data: DriveSessionStart,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Start an AI Dashcam monitoring session."""
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
    Process incoming road detection frame with TEMPORAL FILTERING (Section 10).
    Consecutive frames of the same road defect within 2.5 seconds or 15 meters
    are merged into ONE single detection event, preventing report spam.
    """
    session = db.query(DriveSession).filter(
        DriveSession.id == frame.session_id,
        DriveSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Active drive session not found.")

    session.frames_processed += 1

    # Check minimum confidence
    if frame.confidence < settings.DEFAULT_CONFIDENCE_THRESHOLD:
        db.commit()
        return {
            "status": "IGNORED_LOW_CONFIDENCE",
            "confidence": frame.confidence,
            "threshold": settings.DEFAULT_CONFIDENCE_THRESHOLD
        }

    now = datetime.now(timezone.utc)

    # 1. Temporal Filtering: Look for recent detections in this drive session
    recent_detections = db.query(DriveDetection).filter(
        DriveDetection.session_id == session.id
    ).order_by(DriveDetection.timestamp.desc()).limit(5).all()

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
                # Update confidence if this frame is higher quality
                if frame.confidence > past_det.confidence:
                    past_det.confidence = frame.confidence
                db.commit()
                return {
                    "status": "TEMPORAL_SUPPRESSED",
                    "message": "Consecutive frame of current road defect merged.",
                    "session_detections_count": session.detections_count
                }

    # 2. NEW DETECTION EVENT CONFIRMED
    evidence_url = None
    phash = None
    if frame.image_base64:
        try:
            evidence_url = save_base64_image(frame.image_base64)
            # Compute phash from decoded bytes
            data = base64.b64decode(frame.image_base64.split(",")[1] if "," in frame.image_base64 else frame.image_base64)
            cv_res = cv_service.detect_in_image(data)
            phash = cv_res["phash"]
        except Exception as e:
            print(f"[Dashcam Image Warning] {e}")

    session.detections_count += 1

    # 3. Bengaluru Ward lookup
    ward_info = gis_service.find_ward_by_coordinates(frame.latitude, frame.longitude)
    ward = None
    if ward_info:
        ward = db.query(Ward).filter(Ward.ward_number == ward_info["ward_number"]).first()

    # 4. Multi-Signal Duplicate Incident Check
    existing_incident, dup_score = duplicate_engine.find_duplicate_incident(
        db=db,
        category=frame.category,
        lat=frame.latitude,
        lon=frame.longitude,
        image_phash=phash
    )

    incident_id = None
    if existing_incident:
        # Merge with existing physical civic incident
        incident_id = existing_incident.id
        existing_incident.reports_count += 1
        existing_incident.priority_score = priority_engine.calculate_priority_score(
            severity=existing_incident.severity,
            reports_count=existing_incident.reports_count,
            ai_confidence=frame.confidence
        )
        db.add(IncidentStatusHistory(
            incident_id=existing_incident.id,
            old_status=existing_incident.status,
            new_status=existing_incident.status,
            comment=f"Dashcam Drive Mode detection confirmed incident #{existing_incident.incident_code}. Total reports: {existing_incident.reports_count}."
        ))
    else:
        # Create new verified incident
        session.confirmed_incidents_count += 1
        dept = routing_service.get_department_for_category(db, frame.category)
        calc_sev = priority_engine.calculate_severity(frame.category, frame.confidence)
        calc_pri = priority_engine.calculate_priority_score(calc_sev, 1, frame.confidence)
        inc_code = f"BLR-DASH-{uuid.uuid4().hex[:6].upper()}"

        new_inc = Incident(
            incident_code=inc_code,
            category=frame.category,
            title=f"Dashcam detected {frame.category} at {ward_info['ward_name'] if ward_info else 'Bengaluru'}",
            description=f"AI Dashcam Drive Mode detection with {frame.confidence*100:.1f}% confidence.",
            severity=calc_sev,
            priority_score=calc_pri,
            status=IncidentStatus.VERIFIED.value,
            latitude=frame.latitude,
            longitude=frame.longitude,
            address=f"{ward_info['ward_name'] if ward_info else 'Bengaluru'}, Karnataka",
            ward_id=ward.id if ward else None,
            department_id=dept.id if dept else None,
            reports_count=1,
            primary_media_url=evidence_url
        )
        db.add(new_inc)
        db.flush()
        incident_id = new_inc.id

        db.add(IncidentStatusHistory(
            incident_id=new_inc.id,
            old_status=None,
            new_status=IncidentStatus.VERIFIED.value,
            comment=f"New incident verified via AI Dashcam Drive Mode (Conf: {frame.confidence:.2f})."
        ))

    # 5. Log Drive Detection and supporting Report
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

    rep = Report(
        user_id=current_user.id,
        source=ReportSource.DASHCAM.value,
        raw_text=f"Dashcam AI road detection (Confidence: {frame.confidence*100:.1f}%)",
        category=frame.category,
        ai_confidence=frame.confidence,
        latitude=frame.latitude,
        longitude=frame.longitude,
        address=f"{ward_info['ward_name'] if ward_info else 'Bengaluru'}, Karnataka",
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

    return {
        "status": "EVENT_LOGGED",
        "category": frame.category,
        "confidence": frame.confidence,
        "incident_id": incident_id,
        "is_new_incident": existing_incident is None,
        "ward": ward_info["ward_name"] if ward_info else "Bengaluru Urban",
        "session_detections_count": session.detections_count
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
