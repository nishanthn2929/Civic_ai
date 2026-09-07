from typing import Dict, Any, Tuple
from backend.app.core.config import settings

class IncidentVerificationService:
    @staticmethod
    def verify_report_quality(
        ai_confidence: float,
        blur_score: float,
        lat: float,
        lon: float
    ) -> Tuple[bool, float, str]:
        """
        Verify incoming report signals:
        - Checks GPS is inside Bengaluru metropolitan envelope (~12.75 - 13.20 N, 77.40 - 77.80 E)
        - Checks blur score meets minimum clarity
        - Checks AI confidence meets threshold
        Returns: (is_verified, composite_quality_score, status_reason)
        """
        # 1. GPS validity check
        is_in_bengaluru = (12.75 <= lat <= 13.25) and (77.35 <= lon <= 77.85)
        if not is_in_bengaluru:
            return False, 0.2, "GPS coordinates outside Bengaluru municipal boundaries"

        # 2. Blur / Image quality check
        blur_ratio = min(1.0, blur_score / max(settings.DEFAULT_BLUR_THRESHOLD, 1.0))

        # 3. Composite score calculation
        composite_score = (
            (ai_confidence * 0.50)
            + (blur_ratio * 0.30)
            + (1.0 * 0.20)  # Valid location bonus
        )
        composite_score = round(min(1.0, max(0.0, composite_score)), 3)

        # 4. Decision
        if composite_score >= 0.60 and blur_score >= (settings.DEFAULT_BLUR_THRESHOLD * 0.6):
            return True, composite_score, "Verified: High quality evidence and valid coordinates"
        else:
            return False, composite_score, "Needs Verification: Low AI confidence or image clarity"

verification_service = IncidentVerificationService()
