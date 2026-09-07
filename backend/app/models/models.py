from datetime import datetime, timezone
import enum
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, Enum as SQLEnum, Table
)
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

def utcnow():
    return datetime.now(timezone.utc)

class UserRole(str, enum.Enum):
    CITIZEN = "citizen"
    AUTHORITY = "authority"
    ADMIN = "admin"

class IncidentSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class IncidentStatus(str, enum.Enum):
    DETECTED = "DETECTED"
    NEEDS_VERIFICATION = "NEEDS_VERIFICATION"
    VERIFIED = "VERIFIED"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    CITIZEN_VERIFICATION = "CITIZEN_VERIFICATION"
    CLOSED = "CLOSED"
    REOPENED = "REOPENED"

class ReportSource(str, enum.Enum):
    MANUAL = "manual"
    VOICE = "voice"
    DASHCAM = "dashcam"

class ReportStatus(str, enum.Enum):
    SUBMITTED = "submitted"
    VERIFIED = "verified"
    MERGED = "merged"
    REJECTED = "rejected"

# User table
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    phone = Column(String(20), nullable=True)
    role = Column(String(20), default=UserRole.CITIZEN.value, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    ward_id = Column(Integer, ForeignKey("wards.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    department = relationship("Department", back_populates="users")
    ward = relationship("Ward", back_populates="officers", foreign_keys=[ward_id])
    reports = relationship("Report", back_populates="user")
    drive_sessions = relationship("DriveSession", back_populates="user")
    assigned_incidents = relationship("Incident", back_populates="assigned_to", foreign_keys="Incident.assigned_to_id")
    notifications = relationship("Notification", back_populates="user")

# Department table
class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)  # e.g., BBMP_ROADS, BWSSB
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    contact_email = Column(String(120), nullable=True)
    escalation_sla_hours = Column(Integer, default=48)
    created_at = Column(DateTime, default=utcnow)

    users = relationship("User", back_populates="department")
    incidents = relationship("Incident", back_populates="department")

# Ward table (Bengaluru administrative wards)
class Ward(Base):
    __tablename__ = "wards"

    id = Column(Integer, primary_key=True, index=True)
    ward_number = Column(Integer, unique=True, index=True, nullable=False)
    ward_name = Column(String(100), nullable=False)
    zone_name = Column(String(100), nullable=False)  # e.g., East, South, Mahadevapura
    boundary_geojson = Column(Text, nullable=True)  # Polygon/MultiPolygon
    officer_in_charge_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    officers = relationship("User", back_populates="ward", foreign_keys=[User.ward_id])
    incidents = relationship("Incident", back_populates="ward")
    reports = relationship("Report", back_populates="ward")

# Reports (individual observations)
class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    source = Column(String(20), default=ReportSource.MANUAL.value, nullable=False)
    raw_text = Column(Text, nullable=True)
    category = Column(String(80), nullable=False)  # Pothole, Road Damage, etc.
    ai_confidence = Column(Float, default=0.0)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address = Column(String(255), nullable=True)
    ward_id = Column(Integer, ForeignKey("wards.id"), nullable=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=True)
    quality_score = Column(Float, default=1.0)
    status = Column(String(20), default=ReportStatus.SUBMITTED.value)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="reports")
    ward = relationship("Ward", back_populates="reports")
    incident = relationship("Incident", back_populates="reports")
    media = relationship("ReportMedia", back_populates="report", cascade="all, delete-orphan")
    ai_detections = relationship("AIDetection", back_populates="report", cascade="all, delete-orphan")
    voice_detail = relationship("VoiceReport", back_populates="report", uselist=False, cascade="all, delete-orphan")

# Report Media (images, frames)
class ReportMedia(Base):
    __tablename__ = "report_media"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    media_url = Column(String(255), nullable=False)
    media_type = Column(String(50), default="image/jpeg")
    image_phash = Column(String(64), nullable=True)  # Perceptual hash for visual similarity
    bbox_json = Column(Text, nullable=True)  # Detection boxes
    blur_score = Column(Float, nullable=True)  # Laplacian variance
    created_at = Column(DateTime, default=utcnow)

    report = relationship("Report", back_populates="media")

# AI Detection detail
class AIDetection(Base):
    __tablename__ = "ai_detections"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    class_name = Column(String(80), nullable=False)
    confidence = Column(Float, nullable=False)
    bbox_x1 = Column(Float, nullable=True)
    bbox_y1 = Column(Float, nullable=True)
    bbox_x2 = Column(Float, nullable=True)
    bbox_y2 = Column(Float, nullable=True)
    raw_metadata = Column(Text, nullable=True)

    report = relationship("Report", back_populates="ai_detections")

# Canonical Civic Incident
class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    incident_code = Column(String(50), unique=True, index=True, nullable=False)  # e.g., BLR-PTH-1024
    category = Column(String(80), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(String(20), default=IncidentSeverity.MEDIUM.value)
    priority_score = Column(Float, default=50.0)  # 0 to 100
    status = Column(String(30), default=IncidentStatus.DETECTED.value, index=True)
    
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address = Column(String(255), nullable=True)
    ward_id = Column(Integer, ForeignKey("wards.id"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    reports_count = Column(Integer, default=1)
    primary_media_url = Column(String(255), nullable=True)
    
    # Government integration reference (only set if authorized or handoff generated)
    govt_complaint_id = Column(String(100), nullable=True)
    govt_status = Column(String(50), nullable=True)
    govt_synced_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    resolved_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    ward = relationship("Ward", back_populates="incidents")
    department = relationship("Department", back_populates="incidents")
    assigned_to = relationship("User", back_populates="assigned_incidents", foreign_keys=[assigned_to_id])
    reports = relationship("Report", back_populates="incident")
    status_history = relationship("IncidentStatusHistory", back_populates="incident", cascade="all, delete-orphan")
    resolution = relationship("Resolution", back_populates="incident", uselist=False, cascade="all, delete-orphan")

# Incident Status Audit Trail
class IncidentStatusHistory(Base):
    __tablename__ = "incident_status_history"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=False)
    old_status = Column(String(30), nullable=True)
    new_status = Column(String(30), nullable=False)
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    incident = relationship("Incident", back_populates="status_history")
    changed_by = relationship("User")

# Resolution details and evidence
class Resolution(Base):
    __tablename__ = "resolutions"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=False, unique=True)
    officer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    before_media_url = Column(String(255), nullable=True)
    after_media_url = Column(String(255), nullable=False)
    work_notes = Column(Text, nullable=True)
    repair_cost = Column(Float, nullable=True)
    completed_at = Column(DateTime, default=utcnow)
    
    citizen_verified = Column(Boolean, nullable=True)  # True = confirmed, False = rejected
    citizen_feedback = Column(Text, nullable=True)
    verified_at = Column(DateTime, nullable=True)

    incident = relationship("Incident", back_populates="resolution")
    officer = relationship("User")

# Officer Assignments
class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=False)
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    instructions = Column(Text, nullable=True)
    assigned_at = Column(DateTime, default=utcnow)

    incident = relationship("Incident")
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])

# Voice reports
class VoiceReport(Base):
    __tablename__ = "voice_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    audio_url = Column(String(255), nullable=True)
    transcript = Column(Text, nullable=False)
    language = Column(String(10), default="en")  # en, kn
    extracted_category = Column(String(80), nullable=True)
    extracted_severity = Column(String(20), nullable=True)
    confidence = Column(Float, default=0.0)

    report = relationship("Report", back_populates="voice_detail")

# Drive sessions
class DriveSession(Base):
    __tablename__ = "drive_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    start_time = Column(DateTime, default=utcnow)
    end_time = Column(DateTime, nullable=True)
    distance_km = Column(Float, default=0.0)
    frames_processed = Column(Integer, default=0)
    detections_count = Column(Integer, default=0)
    confirmed_incidents_count = Column(Integer, default=0)
    status = Column(String(20), default="ACTIVE")  # ACTIVE, COMPLETED

    user = relationship("User", back_populates="drive_sessions")
    detections = relationship("DriveDetection", back_populates="session", cascade="all, delete-orphan")

# Individual detections recorded during a drive
class DriveDetection(Base):
    __tablename__ = "drive_detections"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("drive_sessions.id"), nullable=False)
    timestamp = Column(DateTime, default=utcnow)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    category = Column(String(80), default="Pothole")
    confidence = Column(Float, nullable=False)
    bbox_json = Column(Text, nullable=True)
    evidence_url = Column(String(255), nullable=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=True)

    session = relationship("DriveSession", back_populates="detections")

# In-app notifications
class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    link = Column(String(255), nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="notifications")

# System-wide configuration settings (Admin-tunable)
class ConfigSetting(Base):
    __tablename__ = "config_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(80), unique=True, index=True, nullable=False)
    value = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

# Audit logs for all governance actions
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(Integer, nullable=True)
    details_json = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=utcnow)
