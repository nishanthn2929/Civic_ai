from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr, Field

# ----------------- User Schemas -----------------
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    role: Optional[str] = "citizen"
    department_id: Optional[int] = None
    ward_id: Optional[int] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    phone: Optional[str] = None
    role: str
    department_id: Optional[int] = None
    ward_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class TokenData(BaseModel):
    user_id: Optional[int] = None
    role: Optional[str] = None

# ----------------- Ward & Department Schemas -----------------
class DepartmentOut(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str] = None
    escalation_sla_hours: int

    class Config:
        from_attributes = True

class WardOut(BaseModel):
    id: int
    ward_number: int
    ward_name: str
    zone_name: str
    boundary_geojson: Optional[str] = None

    class Config:
        from_attributes = True

# ----------------- Report & Media Schemas -----------------
class ReportPreScreenResponse(BaseModel):
    detected_category: str
    confidence: float
    suggested_severity: str
    severity_reason: Optional[str] = None
    severity_factors: Optional[Dict[str, Any]] = None
    blur_score: float
    is_clear: bool
    bboxes: List[Dict[str, Any]] = []
    has_exif_gps: bool = False
    exif_latitude: Optional[float] = None
    exif_longitude: Optional[float] = None
    resolved_latitude: float
    resolved_longitude: float
    location_source: str = "DEFAULT"
    bengaluru_ward: Optional[str] = None
    bengaluru_zone: Optional[str] = None
    formatted_address: Optional[str] = None
    is_within_bengaluru: bool = True
    suggested_department: Optional[str] = None

class ReportCreate(BaseModel):
    category: str
    raw_text: Optional[str] = None
    latitude: float
    longitude: float
    address: Optional[str] = None
    source: Optional[str] = "manual"
    ai_confidence: Optional[float] = 0.0
    severity: Optional[str] = None
    severity_reason: Optional[str] = None
    media_base64: Optional[str] = None  # Optional base64 or multipart upload

class ReportMediaOut(BaseModel):
    id: int
    media_url: str
    blur_score: Optional[float] = None
    bbox_json: Optional[str] = None

    class Config:
        from_attributes = True

class ReportOut(BaseModel):
    id: int
    source: str
    raw_text: Optional[str] = None
    category: str
    ai_confidence: float
    latitude: float
    longitude: float
    address: Optional[str] = None
    ward_id: Optional[int] = None
    ward_name: Optional[str] = None
    incident_id: Optional[int] = None
    status: str
    created_at: datetime
    media: List[ReportMediaOut] = []

    class Config:
        from_attributes = True

# ----------------- Incident Schemas -----------------
class IncidentStatusHistoryOut(BaseModel):
    id: int
    old_status: Optional[str] = None
    new_status: str
    changed_by_id: Optional[int] = None
    changed_by_name: Optional[str] = None
    comment: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ResolutionOut(BaseModel):
    id: int
    before_media_url: Optional[str] = None
    after_media_url: str
    work_notes: Optional[str] = None
    repair_cost: Optional[float] = None
    completed_at: datetime
    citizen_verified: Optional[bool] = None
    citizen_feedback: Optional[str] = None
    verified_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class IncidentOut(BaseModel):
    id: int
    incident_code: str
    category: str
    title: str
    description: Optional[str] = None
    severity: str
    priority_score: float
    status: str
    latitude: float
    longitude: float
    address: Optional[str] = None
    ward_id: Optional[int] = None
    ward_name: Optional[str] = None
    zone_name: Optional[str] = None
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    assigned_to_id: Optional[int] = None
    assigned_to_name: Optional[str] = None
    reports_count: int
    primary_media_url: Optional[str] = None
    govt_complaint_id: Optional[str] = None
    govt_status: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    resolution: Optional[ResolutionOut] = None
    status_history: List[IncidentStatusHistoryOut] = []

    class Config:
        from_attributes = True

class IncidentUpdateStatus(BaseModel):
    new_status: str
    comment: Optional[str] = None

class IncidentAssign(BaseModel):
    officer_id: int
    instructions: Optional[str] = None

class ResolutionCreate(BaseModel):
    work_notes: str
    repair_cost: Optional[float] = None
    after_image_base64: Optional[str] = None

class CitizenVerificationRequest(BaseModel):
    verified: bool
    feedback: Optional[str] = None

# ----------------- Drive Session & Detection Schemas -----------------
class DriveSessionStart(BaseModel):
    latitude: float
    longitude: float

class DriveSessionEnd(BaseModel):
    session_id: int
    distance_km: Optional[float] = 0.0

class DriveDetectionFrame(BaseModel):
    session_id: int
    timestamp_ms: int
    latitude: float
    longitude: float
    category: str = "Pothole"
    confidence: float
    bbox: List[float] = []  # [x1, y1, x2, y2]
    image_base64: Optional[str] = None

class DriveSessionOut(BaseModel):
    id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    distance_km: float
    frames_processed: int
    detections_count: int
    confirmed_incidents_count: int
    status: str

    class Config:
        from_attributes = True

# ----------------- Voice Schemas -----------------
class VoiceReportRequest(BaseModel):
    transcript: str
    language: Optional[str] = "en"
    latitude: float
    longitude: float

class VoiceReportParsedOut(BaseModel):
    transcript: str
    detected_category: str
    suggested_severity: str
    extracted_description: str
    confidence: float
    ward_name: Optional[str] = None

# ----------------- Public Dashboard Schemas -----------------
class PublicStats(BaseModel):
    total_incidents: int
    resolved_incidents: int
    in_progress_incidents: int
    pending_incidents: int
    critical_incidents: int
    resolution_rate_percentage: float
    avg_resolution_time_hours: float
    category_breakdown: Dict[str, int]
    zone_breakdown: Dict[str, int]

class PublicIncidentMapItem(BaseModel):
    id: int
    incident_code: str
    category: str
    severity: str
    status: str
    latitude: float
    longitude: float
    ward_name: Optional[str] = None
    zone_name: Optional[str] = None
    created_at: datetime
    primary_media_url: Optional[str] = None
    # Strictly zero citizen PII

# ----------------- Admin Configuration Schemas -----------------
class ConfigSettingUpdate(BaseModel):
    key: str
    value: str
    description: Optional[str] = None

class ConfigSettingOut(BaseModel):
    id: int
    key: str
    value: str
    description: Optional[str] = None
    updated_at: datetime

    class Config:
        from_attributes = True

class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    details_json: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
