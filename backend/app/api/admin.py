import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.models.models import (
    User, ConfigSetting, AuditLog, Incident, Ward, Department
)
from backend.app.schemas.schemas import (
    ConfigSettingUpdate, ConfigSettingOut, AuditLogOut, UserOut
)
from backend.app.api.deps import require_role
from backend.app.services.government_adapter import govt_adapter
from backend.app.services.duplicate_engine import duplicate_engine
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
