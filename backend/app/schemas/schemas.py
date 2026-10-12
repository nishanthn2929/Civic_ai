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

class GoogleLoginRequest(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    role: Optional[str] = "citizen"
    google_id: Optional[str] = None

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
    photo_gps_available: bool = False
    photo_latitude: Optional[float] = None
    photo_longitude: Optional[float] = None
    photo_altitude: Optional[float] = None
    photo_timestamp: Optional[str] = None
    photo_gps_source: Optional[str] = None
    resolved_latitude: Optional[float] = None
    resolved_longitude: Optional[float] = None
    location_source: str = "DEFAULT"  # EXIF, DEVICE_GPS, MANUAL, NONE
    bengaluru_ward: Optional[str] = None
    bengaluru_zone: Optional[str] = None
    ward_number: Optional[int] = None
    formatted_address: Optional[str] = None
    is_within_bengaluru: bool = True
    suggested_department: Optional[str] = None
    assembly_constituency: Optional[str] = None
    assembly_constituency_number: Optional[int] = None
    mla_name: Optional[str] = None
    mla_party: Optional[str] = None
    mla_source: Optional[str] = None
    mla_profile_url: Optional[str] = None
    mla_last_verified: Optional[str] = None
    parliamentary_constituency: Optional[str] = None
    parliamentary_constituency_number: Optional[int] = None
    mp_name: Optional[str] = None
    mp_party: Optional[str] = None
    mp_source: Optional[str] = None
    mp_profile_url: Optional[str] = None
    mp_last_verified: Optional[str] = None
    boundary_warning: bool = False
    boundary_warning_message: Optional[str] = None
    location_unverified_message: Optional[str] = None

class ReportCreate(BaseModel):
    category: str
    raw_text: Optional[str] = None
    latitude: float
    longitude: float
    gps_accuracy: Optional[float] = None
    location_source: Optional[str] = "GPS"
    location_timestamp: Optional[datetime] = None
    photo_latitude: Optional[float] = None
    photo_longitude: Optional[float] = None
    photo_gps_available: Optional[bool] = False
    photo_gps_source: Optional[str] = None
    photo_altitude: Optional[float] = None
    photo_timestamp: Optional[str] = None
    ward_number: Optional[int] = None
    ward_name: Optional[str] = None
    ward_detection_method: Optional[str] = "POINT_IN_POLYGON"
    assembly_constituency_number: Optional[int] = None
    assembly_constituency_name: Optional[str] = None
    mla_name: Optional[str] = None
    mla_party: Optional[str] = None
    mla_source: Optional[str] = None
    mla_last_verified: Optional[datetime] = None
    parliamentary_constituency_number: Optional[int] = None
    parliamentary_constituency_name: Optional[str] = None
    mp_name: Optional[str] = None
    mp_party: Optional[str] = None
    mp_source: Optional[str] = None
    mp_last_verified: Optional[datetime] = None
    boundary_warning: Optional[bool] = False
    address: Optional[str] = None
    source: Optional[str] = "manual"
    ai_confidence: Optional[float] = 0.0
    severity: Optional[str] = None
    severity_reason: Optional[str] = None
    media_base64: Optional[str] = None  # Optional base64 or multipart upload
    user_action: Optional[str] = None  # None, "confirm_duplicate", "force_new"
    target_incident_id: Optional[int] = None
    primary_report_id: Optional[int] = None

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
    gps_accuracy: Optional[float] = None
    location_source: Optional[str] = "GPS"
    location_timestamp: Optional[datetime] = None
    photo_latitude: Optional[float] = None
    photo_longitude: Optional[float] = None
    photo_gps_available: Optional[bool] = False
    photo_gps_source: Optional[str] = None
    photo_altitude: Optional[float] = None
    photo_timestamp: Optional[str] = None
    ward_number: Optional[int] = None
    ward_name: Optional[str] = None
    ward_detection_method: Optional[str] = "POINT_IN_POLYGON"
    assembly_constituency_number: Optional[int] = None
    assembly_constituency_name: Optional[str] = None
    mla_name: Optional[str] = None
    mla_party: Optional[str] = None
    mla_source: Optional[str] = None
    mla_last_verified: Optional[datetime] = None
    parliamentary_constituency_number: Optional[int] = None
    parliamentary_constituency_name: Optional[str] = None
    mp_name: Optional[str] = None
    mp_party: Optional[str] = None
    mp_source: Optional[str] = None
    mp_last_verified: Optional[datetime] = None
    boundary_warning: Optional[bool] = False
    address: Optional[str] = None
    ward_id: Optional[int] = None
    incident_id: Optional[int] = None
    status: str
    is_duplicate: bool = False
    duplicate_status: Optional[str] = "NONE"
    duplicate_score: Optional[float] = None
    duplicate_signals: Optional[str] = None
    primary_report_id: Optional[int] = None
    duplicate_group_id: Optional[str] = None
    created_at: datetime
    media: List[ReportMediaOut] = []

    class Config:
        from_attributes = True

# ----------------- Duplicate Intelligence Schemas -----------------
class DuplicateSignalBreakdown(BaseModel):
    location: float
    category: float
    visual: float
    text: float
    distance_meters: float

class DuplicateMatchedIncidentOut(BaseModel):
    id: int
    incident_code: str
    category: str
    title: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    address: Optional[str] = None
    primary_media_url: Optional[str] = None
    created_at: datetime
    reports_count: int
    status: str

class DuplicateCheckResponse(BaseModel):
    status: str  # CONFIRMED_DUPLICATE | POSSIBLE_DUPLICATE | NEW_REPORT
    action: str  # confirmed | ask_confirmation | create_new
    score: float
    percentage: float
    thresholds: Dict[str, Any]
    signals: DuplicateSignalBreakdown
    matched_incident: Optional[DuplicateMatchedIncidentOut] = None
    primary_report_id: Optional[int] = None

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

class IncidentLinkedReportOut(BaseModel):
    id: int
    raw_text: Optional[str] = None
    created_at: Optional[datetime] = None
    duplicate_status: Optional[str] = None
    duplicate_score: Optional[float] = None
    is_duplicate: bool = False
    media_url: Optional[str] = None
    reporter_name: Optional[str] = None

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
    gps_accuracy: Optional[float] = None
    location_source: Optional[str] = "GPS"
    location_timestamp: Optional[datetime] = None
    photo_latitude: Optional[float] = None
    photo_longitude: Optional[float] = None
    photo_gps_available: Optional[bool] = False
    photo_gps_source: Optional[str] = None
    photo_altitude: Optional[float] = None
    photo_timestamp: Optional[str] = None
    ward_number: Optional[int] = None
    ward_detection_method: Optional[str] = "POINT_IN_POLYGON"
    assembly_constituency_number: Optional[int] = None
    assembly_constituency_name: Optional[str] = None
    mla_name: Optional[str] = None
    mla_party: Optional[str] = None
    mla_source: Optional[str] = None
    mla_last_verified: Optional[datetime] = None
    parliamentary_constituency_number: Optional[int] = None
    parliamentary_constituency_name: Optional[str] = None
    mp_name: Optional[str] = None
    mp_party: Optional[str] = None
    mp_source: Optional[str] = None
    mp_last_verified: Optional[datetime] = None
    boundary_warning: Optional[bool] = False
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
    duplicate_count: int = 0
    duplicate_group_id: Optional[str] = None
    has_duplicates: bool = False
    govt_complaint_id: Optional[str] = None
    govt_status: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    resolution: Optional[ResolutionOut] = None
    status_history: List[IncidentStatusHistoryOut] = []
    linked_reports: List[IncidentLinkedReportOut] = []

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
    gps_accuracy: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    category: str = "Pothole"
    confidence: float
    bbox: List[float] = []  # [x1, y1, x2, y2]
    image_base64: Optional[str] = None
    confirmed_submission: Optional[bool] = None

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
    is_valid_civic: bool = True
    validation_message: Optional[str] = None
    detected_category: Optional[str] = None
    suggested_severity: Optional[str] = None
    extracted_description: str
    confidence: float
    ward_name: Optional[str] = None
    zone_name: Optional[str] = None
    formatted_address: Optional[str] = None
    is_within_bengaluru: bool = False
    latitude: float
    longitude: float
    assembly_constituency: Optional[str] = None
    mla_name: Optional[str] = None
    parliamentary_constituency: Optional[str] = None
    mp_name: Optional[str] = None

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

# ----------------- Representative & Constituency Schemas -----------------
class MLABase(BaseModel):
    name: str
    party: str
    term: Optional[str] = "2023-2028"
    official_profile_url: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    source: Optional[str] = "Karnataka Legislative Assembly (16th KLA)"

class MLAUpdate(BaseModel):
    name: Optional[str] = None
    party: Optional[str] = None
    term: Optional[str] = None
    official_profile_url: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    source: Optional[str] = None

class MLAOut(MLABase):
    id: int
    assembly_constituency_id: int
    constituency_number: Optional[int] = None
    constituency_name: Optional[str] = None
    last_verified: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class MPBase(BaseModel):
    name: str
    party: str
    term: Optional[str] = "2024-2029"
    official_profile_url: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    source: Optional[str] = "Lok Sabha Secretariat (18th Lok Sabha)"

class MPUpdate(BaseModel):
    name: Optional[str] = None
    party: Optional[str] = None
    term: Optional[str] = None
    official_profile_url: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    source: Optional[str] = None

class MPOut(MPBase):
    id: int
    parliamentary_constituency_id: int
    constituency_number: Optional[int] = None
    constituency_name: Optional[str] = None
    last_verified: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class AssemblyConstituencyOut(BaseModel):
    id: int
    constituency_number: int
    constituency_name: str
    state: str
    district: str
    source: str
    source_url: str
    dataset_version: str
    mla: Optional[MLAOut] = None

    class Config:
        from_attributes = True

class ParliamentaryConstituencyOut(BaseModel):
    id: int
    constituency_number: int
    constituency_name: str
    state: str
    source: str
    source_url: str
    dataset_version: str
    mp: Optional[MPOut] = None

    class Config:
        from_attributes = True

