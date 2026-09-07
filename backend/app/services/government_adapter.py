from datetime import datetime, timezone
from typing import Dict, Any, Optional
from backend.app.models.models import Incident
from backend.app.core.config import settings

class GovernmentAdapter:
    """
    Modular integration adapter adhering to strict ethics:
    Never scrape or automate login to unauthorized portals.
    1. Authorized API integration (if official credentials provided).
    2. Citizen-assisted handoff package generation when direct API access is absent.
    """

    def __init__(self):
        self.api_endpoint = settings.GOVT_API_ENDPOINT
        self.api_key = settings.GOVT_API_KEY
        self.is_enabled = settings.GOVT_INTEGRATION_ENABLED

    def submit_incident_to_government(self, incident: Incident) -> Dict[str, Any]:
        """Submit incident to authorized BBMP / Government API if enabled."""
        if not self.is_enabled:
            return {
                "success": False,
                "status": "UNAUTHORIZED_OR_DISABLED",
                "message": "Official Government API integration is currently disabled or pending authorization."
            }

        # Simulated response from an authorized municipal API
        simulated_complaint_id = f"BBMP-GRV-2026-{incident.id:05d}"
        return {
            "success": True,
            "external_complaint_id": simulated_complaint_id,
            "status": "ACKNOWLEDGED",
            "department": incident.department.name if incident.department else "BBMP Central",
            "submitted_at": datetime.now(timezone.utc).isoformat()
        }

    def generate_citizen_handoff_package(self, incident: Incident) -> Dict[str, Any]:
        """
        Produce a formatted official grievance dossier for the citizen to present
        or submit to BBMP Sahaya / 1533 helpline.
        """
        ward_name = incident.ward.ward_name if incident.ward else "Bengaluru Urban"
        zone_name = incident.ward.zone_name if incident.ward else "BBMP Zone"
        dept_name = incident.department.name if incident.department else "BBMP Infrastructure"

        dossier_text = (
            f"OFFICIAL CIVIC COMPLAINT SUMMARY\n"
            f"Reference Code: {incident.incident_code}\n"
            f"Issue Type: {incident.category}\n"
            f"BBMP Ward: {ward_name} (Zone: {zone_name})\n"
            f"Location: Lat {incident.latitude:.6f}, Lng {incident.longitude:.6f}\n"
            f"Assigned Municipal Dept: {dept_name}\n"
            f"Calculated Severity: {incident.severity}\n"
            f"Number of Confirming Citizen Reports: {incident.reports_count}\n"
            f"Reported Timestamp: {incident.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
            f"Description: {incident.description or incident.title}\n"
        )

        return {
            "incident_code": incident.incident_code,
            "formatted_dossier": dossier_text,
            "official_portal_url": "https://site.bbmp.gov.in/sahaya.html",
            "bbmp_helpline": "1533",
            "evidence_image": incident.primary_media_url,
            "instructions": "Copy this verified technical dossier to log directly into BBMP Sahaya app or present to your ward corporator/engineer."
        }

govt_adapter = GovernmentAdapter()
