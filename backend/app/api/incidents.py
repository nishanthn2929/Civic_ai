from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.models.models import (
    User, Incident, IncidentStatus, IncidentStatusHistory, Resolution,
    Report, Ward, Department, AuditLog, Notification
)
from backend.app.schemas.schemas import (
    IncidentOut, IncidentUpdateStatus, CitizenVerificationRequest, ResolutionOut,
    IncidentStatusHistoryOut, IncidentLinkedReportOut
)
from backend.app.api.deps import get_current_user, get_current_active_user, require_role

router = APIRouter(prefix="/incidents", tags=["Incidents"])

def ensure_utc(dt):
    if dt is None:
        return None
    if getattr(dt, "tzinfo", None) is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

def serialize_incident(inc: Incident) -> IncidentOut:
    status_history_out = []
    for h in inc.status_history:
        status_history_out.append(IncidentStatusHistoryOut(
            id=h.id,
            old_status=h.old_status,
            new_status=h.new_status,
            changed_by_id=h.changed_by_id,
            changed_by_name=h.changed_by.name if h.changed_by else "System",
            comment=h.comment,
            created_at=ensure_utc(h.created_at)
        ))

    resolution_out = None
    if inc.resolution:
        resolution_out = ResolutionOut(
            id=inc.resolution.id,
            before_media_url=inc.resolution.before_media_url,
            after_media_url=inc.resolution.after_media_url,
            work_notes=inc.resolution.work_notes,
            repair_cost=inc.resolution.repair_cost,
            completed_at=ensure_utc(inc.resolution.completed_at),
            citizen_verified=inc.resolution.citizen_verified,
            citizen_feedback=inc.resolution.citizen_feedback,
            verified_at=ensure_utc(inc.resolution.verified_at)
        )

    linked_reports_out = []
    if getattr(inc, "reports", None):
        for r in inc.reports:
            media_url = None
            if getattr(r, "media", None) and len(r.media) > 0:
                media_url = r.media[0].media_url
            reporter_name = r.user.name if getattr(r, "user", None) and r.user else "Citizen"
            rep_date = r.created_at or getattr(inc, "created_at", None)
            linked_reports_out.append(IncidentLinkedReportOut(
                id=r.id,
                raw_text=r.raw_text,
                created_at=ensure_utc(rep_date),
                duplicate_status=r.duplicate_status or ("CONFIRMED_DUPLICATE" if r.is_duplicate else "PRIMARY_REPORT"),
                duplicate_score=r.duplicate_score,
                is_duplicate=bool(r.is_duplicate),
                media_url=media_url,
                reporter_name=reporter_name
            ))

    return IncidentOut(
        id=inc.id,
        incident_code=inc.incident_code,
        category=inc.category,
        title=inc.title,
        description=inc.description,
        severity=inc.severity,
        priority_score=inc.priority_score,
        status=inc.status,
        latitude=inc.latitude,
        longitude=inc.longitude,
        gps_accuracy=inc.gps_accuracy,
        location_source=inc.location_source,
        location_timestamp=ensure_utc(inc.location_timestamp),
        photo_latitude=inc.photo_latitude,
        photo_longitude=inc.photo_longitude,
        photo_gps_available=inc.photo_gps_available,
        photo_gps_source=inc.photo_gps_source,
        photo_altitude=inc.photo_altitude,
        photo_timestamp=inc.photo_timestamp,
        ward_number=inc.ward_number or (inc.ward.ward_number if inc.ward else None),
        ward_name=inc.ward_name or (inc.ward.ward_name if inc.ward else "Bengaluru Urban"),
        ward_detection_method=inc.ward_detection_method,
        zone_name=inc.ward.zone_name if inc.ward else "Central",
        assembly_constituency_number=inc.assembly_constituency_number,
        assembly_constituency_name=inc.assembly_constituency_name,
        mla_name=inc.mla_name,
        mla_party=inc.mla_party,
        mla_source=inc.mla_source,
        mla_last_verified=inc.mla_last_verified,
        parliamentary_constituency_number=inc.parliamentary_constituency_number,
        parliamentary_constituency_name=inc.parliamentary_constituency_name,
        mp_name=inc.mp_name,
        mp_party=inc.mp_party,
        mp_source=inc.mp_source,
        mp_last_verified=inc.mp_last_verified,
        boundary_warning=inc.boundary_warning,
        address=inc.address,
        ward_id=inc.ward_id,
        department_id=inc.department_id,
        department_name=inc.department.name if inc.department else "BBMP Central",
        assigned_to_id=inc.assigned_to_id,
        assigned_to_name=inc.assigned_to.name if inc.assigned_to else None,
        reports_count=inc.reports_count,
        primary_media_url=inc.primary_media_url,
        duplicate_count=inc.duplicate_count or 0,
        duplicate_group_id=inc.duplicate_group_id,
        has_duplicates=bool(inc.has_duplicates or (inc.reports_count and inc.reports_count > 1) or (inc.duplicate_count and inc.duplicate_count > 0)),
        govt_complaint_id=inc.govt_complaint_id,
        govt_status=inc.govt_status,
        created_at=ensure_utc(inc.created_at),
        updated_at=ensure_utc(inc.updated_at),
        resolved_at=ensure_utc(inc.resolved_at),
        resolution=resolution_out,
        status_history=status_history_out,
        linked_reports=linked_reports_out
    )

@router.get("", response_model=List[IncidentOut])
def list_incidents(
    ward_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    severity: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("newest"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Query incidents with filtering for dashboards and GIS maps."""
    query = db.query(Incident)

    if ward_id:
        query = query.filter(Incident.ward_id == ward_id)
    if category:
        query = query.filter(Incident.category == category)
    if status_filter:
        query = query.filter(Incident.status == status_filter)
    if severity:
        query = query.filter(Incident.severity == severity)
    if department_id:
        query = query.filter(Incident.department_id == department_id)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (Incident.incident_code.ilike(term)) |
            (Incident.title.ilike(term)) |
            (Incident.ward_name.ilike(term)) |
            (Incident.address.ilike(term)) |
            (Incident.category.ilike(term)) |
            (Incident.description.ilike(term))
        )

    if sort_by == "priority":
        query = query.order_by(Incident.priority_score.desc(), Incident.created_at.desc())
    elif sort_by == "reports":
        query = query.order_by(Incident.reports_count.desc(), Incident.priority_score.desc())
    else:  # "newest" (default)
        query = query.order_by(Incident.updated_at.desc(), Incident.created_at.desc(), Incident.id.desc())

    incidents = query.offset(skip).limit(limit).all()
    return [serialize_incident(inc) for inc in incidents]

@router.get("/code/{incident_code}", response_model=IncidentOut)
def get_incident_by_code(incident_code: str, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.incident_code == incident_code.strip()).first()
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident code '{incident_code}' not found.")
    return serialize_incident(inc)

@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident_detail(incident_id: int, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found.")
    return serialize_incident(inc)

@router.post("/{incident_id}/citizen-verify", response_model=IncidentOut)
def citizen_verify_resolution(
    incident_id: int,
    verif: CitizenVerificationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Citizen verifies whether the repaired civic issue is truly resolved.
    If confirmed -> CLOSED. If rejected -> REOPENED with audit reason.
    """
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found.")

    if not inc.resolution:
        raise HTTPException(status_code=400, detail="Incident does not have a resolution to verify.")

    old_status = inc.status
    now = datetime.now(timezone.utc)
    inc.resolution.citizen_verified = verif.verified
    inc.resolution.citizen_feedback = verif.feedback
    inc.resolution.verified_at = now

    if verif.verified:
        new_status = IncidentStatus.CLOSED.value
        inc.status = new_status
        inc.closed_at = now
        comment = f"Citizen verified successful repair: {verif.feedback or 'Confirmed resolved'}"
    else:
        new_status = IncidentStatus.REOPENED.value
        inc.status = new_status
        comment = f"Citizen rejected resolution. Issue reopened: {verif.feedback or 'Work unsatisfactory'}"

    # Log status change
    db.add(IncidentStatusHistory(
        incident_id=inc.id,
        old_status=old_status,
        new_status=new_status,
        changed_by_id=current_user.id,
        comment=comment
    ))

    # Log audit
    db.add(AuditLog(
        user_id=current_user.id,
        action="CITIZEN_VERIFICATION",
        entity_type="incident",
        entity_id=inc.id,
        details_json=f'{{"verified": {str(verif.verified).lower()}, "comment": "{verif.feedback or ""}"}}'
    ))

    db.commit()
    db.refresh(inc)
    return serialize_incident(inc)
