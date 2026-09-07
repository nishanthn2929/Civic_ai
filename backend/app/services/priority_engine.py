import math
from typing import Tuple
from backend.app.models.models import IncidentSeverity

class SeverityPriorityEngine:
    # Base severity score out of 100 for categories
    CATEGORY_BASE_SEVERITY = {
        "Open Manhole": 90.0,
        "Pothole": 75.0,
        "Water Leakage": 70.0,
        "Drainage Problem": 65.0,
        "Road Damage": 60.0,
        "Garbage Overflow": 55.0,
        "Broken Streetlight": 50.0,
        "Road Crack": 40.0,
        "Other": 45.0
    }

    @classmethod
    def calculate_severity(cls, category: str, ai_confidence: float, user_severity: str = "MEDIUM") -> str:
        """Compute objective physical severity."""
        base = cls.CATEGORY_BASE_SEVERITY.get(category, 50.0)
        
        user_multiplier = {
            "LOW": 0.8,
            "MEDIUM": 1.0,
            "HIGH": 1.2,
            "CRITICAL": 1.4
        }.get(user_severity.upper(), 1.0)

        calc_score = base * (0.6 + 0.4 * ai_confidence) * user_multiplier

        if calc_score >= 85.0:
            return IncidentSeverity.CRITICAL.value
        elif calc_score >= 65.0:
            return IncidentSeverity.HIGH.value
        elif calc_score >= 45.0:
            return IncidentSeverity.MEDIUM.value
        else:
            return IncidentSeverity.LOW.value

    @classmethod
    def calculate_priority_score(
        cls,
        severity: str,
        reports_count: int,
        ai_confidence: float = 0.8,
        zone_traffic_weight: float = 1.0,
        age_hours: float = 0.0
    ) -> float:
        """
        Compute dispatch urgency priority score (0.0 to 100.0).
        Priority escalates as more citizens report the same issue.
        """
        sev_weight = {
            IncidentSeverity.LOW.value: 30.0,
            IncidentSeverity.MEDIUM.value: 55.0,
            IncidentSeverity.HIGH.value: 75.0,
            IncidentSeverity.CRITICAL.value: 95.0
        }.get(severity, 50.0)

        # Multi-report multiplier: log2(reports_count + 1) * 6 (up to +20 points)
        report_bonus = min(20.0, math.log2(reports_count + 1) * 6.5)

        # Age escalation bonus: 1 point per 12 hours pending, max 15 points
        age_bonus = min(15.0, (age_hours / 12.0) * 1.0)

        # Base formula
        raw_score = (sev_weight * 0.60) + (report_bonus) + (age_bonus) + (ai_confidence * 5.0)
        final_score = min(100.0, max(10.0, raw_score * zone_traffic_weight))
        return round(final_score, 1)

    @classmethod
    def map_score_to_priority_level(cls, score: float) -> str:
        if score >= 85.0:
            return IncidentSeverity.CRITICAL.value
        elif score >= 65.0:
            return IncidentSeverity.HIGH.value
        elif score >= 45.0:
            return IncidentSeverity.MEDIUM.value
        return IncidentSeverity.LOW.value

priority_engine = SeverityPriorityEngine()
