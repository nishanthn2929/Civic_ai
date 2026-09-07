import math
from datetime import datetime, timezone
from typing import Optional, Tuple, List
from sqlalchemy.orm import Session
from backend.app.models.models import Incident, IncidentStatus, ReportMedia
from backend.app.services.gis_service import gis_service
from backend.app.services.ai_cv import cv_service
from backend.app.core.config import settings

class DuplicateDetectionEngine:
    def __init__(
        self,
        weight_loc: float = 0.40,
        weight_cat: float = 0.30,
        weight_vis: float = 0.20,
        weight_time: float = 0.10,
        threshold: float = 0.68,
        max_search_radius_meters: float = 35.0
    ):
        self.w_loc = weight_loc
        self.w_cat = weight_cat
        self.w_vis = weight_vis
        self.w_time = weight_time
        self.threshold = threshold
        self.max_radius = max_search_radius_meters

    def find_duplicate_incident(
        self,
        db: Session,
        category: str,
        lat: float,
        lon: float,
        image_phash: Optional[str] = None
    ) -> Tuple[Optional[Incident], float]:
        """
        Scan active incidents near coordinates and return matching Incident if duplicate score >= threshold.
        """
        # Active incident filter: exclude CLOSED incidents
        active_incidents = db.query(Incident).filter(
            Incident.status.notin_([IncidentStatus.CLOSED.value])
        ).all()

        best_incident = None
        highest_score = 0.0

        for inc in active_incidents:
            dist = gis_service.haversine_distance_meters(lat, lon, inc.latitude, inc.longitude)
            if dist > self.max_radius:
                continue

            # 1. Location similarity (1.0 for <= 8m, decaying to 0 at max_radius)
            if dist <= 8.0:
                s_loc = 1.0
            else:
                s_loc = max(0.0, (self.max_radius - dist) / (self.max_radius - 8.0))

            # 2. Category similarity
            if inc.category.lower() == category.lower():
                s_cat = 1.0
            elif {inc.category.lower(), category.lower()}.issubset({"pothole", "road damage", "road crack"}):
                s_cat = 0.65
            else:
                s_cat = 0.0

            # 3. Time similarity (exponential decay over days)
            now = datetime.now(timezone.utc)
            inc_date = inc.created_at
            if inc_date.tzinfo is None:
                inc_date = inc_date.replace(tzinfo=timezone.utc)
            days_diff = max(0.0, (now - inc_date).total_seconds() / 86400.0)
            s_time = math.exp(-0.04 * days_diff)  # Half-life ~17 days

            # 4. Visual similarity via pHash
            s_vis = 0.70  # Default neutral visual similarity if comparison image is missing
            if image_phash and inc.primary_media_url:
                # Find phash of primary media if recorded
                media_record = db.query(ReportMedia).filter(
                    ReportMedia.media_url == inc.primary_media_url
                ).first()
                if media_record and media_record.image_phash:
                    s_vis = cv_service.phash_similarity(image_phash, media_record.image_phash)

            # Calculate composite weighted duplicate score
            score = (
                (self.w_loc * s_loc)
                + (self.w_cat * s_cat)
                + (self.w_vis * s_vis)
                + (self.w_time * s_time)
            )

            if score > highest_score:
                highest_score = score
                best_incident = inc

        if best_incident and highest_score >= self.threshold:
            return best_incident, round(highest_score, 3)

        return None, round(highest_score, 3)

duplicate_engine = DuplicateDetectionEngine()
