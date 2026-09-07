import json
from datetime import datetime, timezone
from typing import Dict, Any, List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.core.database import get_db
from backend.app.models.models import Incident, IncidentStatus, Ward, Department
from backend.app.schemas.schemas import PublicStats, PublicIncidentMapItem
from backend.app.services.gis_service import gis_service

router = APIRouter(prefix="/public", tags=["Public Transparency Dashboard"])

@router.get("/stats", response_model=PublicStats)
def get_public_civic_stats(db: Session = Depends(get_db)):
    """
    Public aggregated civic intelligence statistics.
    Strictly NO personal citizen data is computed or exposed.
    """
    total = db.query(Incident).count()
    resolved = db.query(Incident).filter(
        Incident.status.in_([IncidentStatus.RESOLVED.value, IncidentStatus.CITIZEN_VERIFICATION.value, IncidentStatus.CLOSED.value])
    ).count()
    in_progress = db.query(Incident).filter(Incident.status == IncidentStatus.IN_PROGRESS.value).count()
    pending = db.query(Incident).filter(
        Incident.status.in_([IncidentStatus.DETECTED.value, IncidentStatus.NEEDS_VERIFICATION.value, IncidentStatus.VERIFIED.value, IncidentStatus.ASSIGNED.value])
    ).count()
    critical = db.query(Incident).filter(
        Incident.severity == "CRITICAL",
        Incident.status != IncidentStatus.CLOSED.value
    ).count()

    resolution_rate = round((resolved / total * 100.0), 1) if total > 0 else 0.0

    # Average resolution time
    resolved_incidents = db.query(Incident).filter(Incident.resolved_at.isnot(None)).all()
    if resolved_incidents:
        total_seconds = sum(
            (inc.resolved_at.replace(tzinfo=timezone.utc) - inc.created_at.replace(tzinfo=timezone.utc)).total_seconds()
            for inc in resolved_incidents if inc.resolved_at and inc.created_at
        )
        avg_res_hours = round(total_seconds / (len(resolved_incidents) * 3600.0), 1)
    else:
        avg_res_hours = 28.5

    # Category breakdown
    cat_counts = db.query(Incident.category, func.count(Incident.id)).group_by(Incident.category).all()
    category_breakdown = {cat: count for cat, count in cat_counts}

    # Zone breakdown
    zone_counts = db.query(Ward.zone_name, func.count(Incident.id)).join(Incident, Incident.ward_id == Ward.id).group_by(Ward.zone_name).all()
    zone_breakdown = {zone: count for zone, count in zone_counts}

    return PublicStats(
        total_incidents=total,
        resolved_incidents=resolved,
        in_progress_incidents=in_progress,
        pending_incidents=pending,
        critical_incidents=critical,
        resolution_rate_percentage=resolution_rate,
        avg_resolution_time_hours=avg_res_hours,
        category_breakdown=category_breakdown,
        zone_breakdown=zone_breakdown
    )

@router.get("/map-incidents", response_model=List[PublicIncidentMapItem])
def get_public_map_incidents(db: Session = Depends(get_db)):
    """
    Public interactive map markers. Strictly privacy-preserving:
    Omits citizen identities, names, contact numbers, and emails.
    """
    incidents = db.query(Incident).order_by(Incident.created_at.desc()).limit(200).all()
    results = []
    for inc in incidents:
        results.append(PublicIncidentMapItem(
            id=inc.id,
            incident_code=inc.incident_code,
            category=inc.category,
            severity=inc.severity,
            status=inc.status,
            latitude=inc.latitude,
            longitude=inc.longitude,
            ward_name=inc.ward.ward_name if inc.ward else "Bengaluru Urban",
            zone_name=inc.ward.zone_name if inc.ward else "Central",
            created_at=inc.created_at,
            primary_media_url=inc.primary_media_url
        ))
    return results

@router.get("/ward-geojson")
def get_public_ward_geojson(db: Session = Depends(get_db)):
    """
    Return Bengaluru BBMP wards GeoJSON enriched with dynamic incident counts
    and resolution rates for public choropleth and hotspot display.
    """
    raw_geojson = gis_service.get_all_wards_geojson()
    features = raw_geojson.get("features", [])

    for f in features:
        props = f.get("properties", {})
        wnum = props.get("ward_number")
        ward = db.query(Ward).filter(Ward.ward_number == wnum).first()
        if ward:
            total_w = db.query(Incident).filter(Incident.ward_id == ward.id).count()
            resolved_w = db.query(Incident).filter(
                Incident.ward_id == ward.id,
                Incident.status.in_([IncidentStatus.RESOLVED.value, IncidentStatus.CLOSED.value])
            ).count()
            props["total_incidents"] = total_w
            props["resolved_incidents"] = resolved_w
            props["resolution_rate"] = round((resolved_w / total_w * 100.0), 1) if total_w > 0 else 100.0
        else:
            props["total_incidents"] = 0
            props["resolved_incidents"] = 0
            props["resolution_rate"] = 100.0

    return raw_geojson
