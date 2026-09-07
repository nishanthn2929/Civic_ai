import base64
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.models.models import (
    User, Incident, IncidentStatus, IncidentStatusHistory, Resolution,
    Assignment, AuditLog, Notification, Ward, Department
)
from backend.app.schemas.schemas import IncidentOut, IncidentUpdateStatus, IncidentAssign
from backend.app.api.deps import get_current_active_user, require_role
from backend.app.api.incidents import serialize_incident

router = APIRouter(prefix="/authority", tags=["Authority Operations"])

def save_media_file(data_bytes: bytes, extension: str = "jpg") -> str:
    filename = f"resolution_{uuid.uuid4().hex[:12]}.{extension}"
    filepath = os.path.join(settings.MEDIA_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(data_bytes)
    return f"/media/{filename}"

@router.get("/metrics")
def get_authority_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["authority", "admin"]))
):
    """Retrieve operational KPIs for the municipal authority dashboard."""
    # Filter by officer department if assigned, or show all for admin
    query = db.query(Incident)
    if current_user.department_id and current_user.role == "authority":
        query = query.filter(Incident.department_id == current_user.department_id)

    total = query.count()
    pending = query.filter(Incident.status.in_([IncidentStatus.DETECTED.value, IncidentStatus.NEEDS_VERIFICATION.value])).count()
    verified = query.filter(Incident.status == IncidentStatus.VERIFIED.value).count()
    assigned = query.filter(Incident.status == IncidentStatus.ASSIGNED.value).count()
    in_progress = query.filter(Incident.status == IncidentStatus.IN_PROGRESS.value).count()
    resolved = query.filter(Incident.status.in_([IncidentStatus.RESOLVED.value, IncidentStatus.CITIZEN_VERIFICATION.value, IncidentStatus.CLOSED.value])).count()
    critical = query.filter(Incident.severity == "CRITICAL", Incident.status != IncidentStatus.CLOSED.value).count()

    resolution_rate = round((resolved / total * 100.0), 1) if total > 0 else 0.0

    # Calculate average resolution time (hours)
    resolved_incidents = query.filter(Incident.resolved_at.isnot(None)).all()
    if resolved_incidents:
        total_seconds = sum(
            (inc.resolved_at.replace(tzinfo=timezone.utc) - inc.created_at.replace(tzinfo=timezone.utc)).total_seconds()
            for inc in resolved_incidents
            if inc.resolved_at and inc.created_at
        )
        avg_resolution_hours = round(total_seconds / (len(resolved_incidents) * 3600.0), 1)
    else:
        avg_resolution_hours = 24.0

    return {
        "total_incidents": total,
        "pending": pending,
        "verified": verified,
        "assigned": assigned,
        "in_progress": in_progress,
        "resolved": resolved,
        "critical": critical,
        "resolution_rate_percentage": resolution_rate,
        "avg_resolution_hours": avg_resolution_hours
    }

@router.post("/incidents/{incident_id}/assign", response_model=IncidentOut)
def assign_incident(
    incident_id: int,
    assign_in: IncidentAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["authority", "admin"]))
):
    """Assign incident to field engineer/officer and advance status."""
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found.")

    officer = db.query(User).filter(User.id == assign_in.officer_id).first()
    if not officer:
        raise HTTPException(status_code=404, detail="Assignee officer not found.")

    old_status = inc.status
    inc.assigned_to_id = officer.id
    inc.status = IncidentStatus.ASSIGNED.value

    db.add(Assignment(
        incident_id=inc.id,
        assigned_by_id=current_user.id,
        assigned_to_id=officer.id,
        instructions=assign_in.instructions
    ))

    db.add(IncidentStatusHistory(
        incident_id=inc.id,
        old_status=old_status,
        new_status=IncidentStatus.ASSIGNED.value,
        changed_by_id=current_user.id,
        comment=f"Assigned to {officer.name}. Instructions: {assign_in.instructions or 'Standard resolution protocol.'}"
    ))

    db.commit()
    db.refresh(inc)
    return serialize_incident(inc)

@router.post("/incidents/{incident_id}/status", response_model=IncidentOut)
def update_incident_status(
    incident_id: int,
    update_in: IncidentUpdateStatus,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["authority", "admin"]))
):
    """Transition incident through valid workflow states with audit remark."""
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found.")

    old_status = inc.status
    inc.status = update_in.new_status
    if update_in.new_status == IncidentStatus.IN_PROGRESS.value and not inc.assigned_to_id:
        inc.assigned_to_id = current_user.id

    db.add(IncidentStatusHistory(
        incident_id=inc.id,
        old_status=old_status,
        new_status=update_in.new_status,
        changed_by_id=current_user.id,
        comment=update_in.comment or f"Status transitioned to {update_in.new_status} by officer."
    ))

    db.commit()
    db.refresh(inc)
    return serialize_incident(inc)

@router.post("/incidents/{incident_id}/resolve", response_model=IncidentOut)
async def submit_resolution(
    incident_id: int,
    work_notes: str = Form(...),
    repair_cost: Optional[float] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["authority", "admin"]))
):
    """
    Upload after-repair evidence image, record repair notes and cost,
    and transition status to CITIZEN_VERIFICATION.
    """
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found.")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Resolution proof image is required.")

    after_media_url = save_media_file(contents)
    now = datetime.now(timezone.utc)

    # Upsert resolution record
    resolution = db.query(Resolution).filter(Resolution.incident_id == inc.id).first()
    if not resolution:
        resolution = Resolution(
            incident_id=inc.id,
            officer_id=current_user.id,
            before_media_url=inc.primary_media_url,
            after_media_url=after_media_url,
            work_notes=work_notes,
            repair_cost=repair_cost,
            completed_at=now
        )
        db.add(resolution)
    else:
        resolution.after_media_url = after_media_url
        resolution.work_notes = work_notes
        resolution.repair_cost = repair_cost
        resolution.completed_at = now

    old_status = inc.status
    inc.status = IncidentStatus.CITIZEN_VERIFICATION.value
    inc.resolved_at = now

    db.add(IncidentStatusHistory(
        incident_id=inc.id,
        old_status=old_status,
        new_status=IncidentStatus.CITIZEN_VERIFICATION.value,
        changed_by_id=current_user.id,
        comment=f"Work completed. After-repair proof uploaded. Awaiting citizen confirmation."
    ))

    # Audit log
    db.add(AuditLog(
        user_id=current_user.id,
        action="INCIDENT_RESOLVED_PROOF_UPLOADED",
        entity_type="incident",
        entity_id=inc.id,
        details_json=f'{{"repair_cost": {repair_cost or 0.0}, "notes": "{work_notes}"}}'
    ))

    db.commit()
    db.refresh(inc)
    return serialize_incident(inc)
