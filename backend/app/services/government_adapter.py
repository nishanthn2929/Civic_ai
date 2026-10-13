import logging
import os
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from backend.app.core.config import settings

logger = logging.getLogger("GovernmentReportingAdapter")

class GovernmentReportingAdapter:
    """
    Official Government Integration Adapter for BBMP Sahaya & Civic Helplines.
    
    Strict Operational Rules:
    1. ONLY submit when valid government API credentials and endpoint are officially configured.
    2. NEVER fake an API response or generate fake complaint tracking IDs.
    3. If official API is not configured or disabled:
       Set report status to 'READY_FOR_OFFICIAL_SUBMISSION' / 'VERIFIED_PENDING_OFFICIAL_SUBMISSION'.
    4. Provide clear user-facing explanation:
       "Verified incident created. Official submission is pending because the government reporting API is not configured."
    """

    def __init__(self):
        self.api_url = getattr(settings, "BBMP_API_BASE_URL", None) or getattr(settings, "GOVT_API_ENDPOINT", None)
        self.api_key = getattr(settings, "BBMP_API_KEY", None) or getattr(settings, "GOVT_API_KEY", None)
        self.auto_submit = getattr(settings, "BBMP_AUTO_SUBMIT_ENABLED", False) or getattr(settings, "GOVT_INTEGRATION_ENABLED", False)

    def is_configured(self) -> bool:
        """Check whether genuine government submission credentials are configured."""
        if not self.auto_submit:
            return False
        if not self.api_url or not self.api_key:
            return False
        if "mock" in self.api_url.lower() or "mock" in self.api_key.lower():
            # Mock or dummy credentials should not claim official government submission
            return False
        return True

    def create_complaint(self, incident_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a complaint in the official municipal system.
        If no authorized official API is configured, return pending status with complete technical dossier.
        """
        now = datetime.now(timezone.utc).isoformat()
        
        if not self.is_configured():
            logger.info("[GovernmentReportingAdapter] Official submission held: API not configured with live credentials.")
            return {
                "submission_status": "READY_FOR_OFFICIAL_SUBMISSION",
                "is_submitted": False,
                "official_complaint_id": None,
                "message": "Verified incident created. Official submission is pending because the government reporting API is not configured.",
                "primary_authority": "BBMP Ward Office / Road Infrastructure Division",
                "ward_number": incident_data.get("ward_number"),
                "ward_name": incident_data.get("ward_name"),
                "assembly_constituency": incident_data.get("assembly_constituency"),
                "mla_name": incident_data.get("mla_name"),
                "parliamentary_constituency": incident_data.get("parliamentary_constituency"),
                "mp_name": incident_data.get("mp_name"),
                "timestamp": now,
                "dossier_package": {
                    "incident_code": incident_data.get("incident_code"),
                    "category": incident_data.get("category", "POTHOLE"),
                    "latitude": incident_data.get("latitude"),
                    "longitude": incident_data.get("longitude"),
                    "gps_accuracy": incident_data.get("gps_accuracy"),
                    "evidence_url": incident_data.get("primary_media_url"),
                    "priority_score": incident_data.get("priority_score"),
                    "bbmp_helpline": "1533"
                }
            }

        # If live credentials exist, send to official government API
        try:
            import requests
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            res = requests.post(f"{self.api_url}/complaints", json=incident_data, headers=headers, timeout=10)
            if res.status_code in [200, 201]:
                res_json = res.json()
                return {
                    "submission_status": "OFFICIALLY_SUBMITTED",
                    "is_submitted": True,
                    "official_complaint_id": res_json.get("complaint_id"),
                    "message": f"Successfully submitted to official BBMP system. Tracking ID: {res_json.get('complaint_id')}",
                    "timestamp": now
                }
            else:
                return {
                    "submission_status": "OFFICIAL_API_ERROR",
                    "is_submitted": False,
                    "official_complaint_id": None,
                    "message": f"Official government API returned status {res.status_code}.",
                    "timestamp": now
                }
        except Exception as e:
            logger.error(f"[GovernmentReportingAdapter] Failed to transmit to official API: {e}")
            return {
                "submission_status": "OFFICIAL_API_UNAVAILABLE",
                "is_submitted": False,
                "official_complaint_id": None,
                "message": f"Government reporting endpoint unreachable: {str(e)}",
                "timestamp": now
            }

    def get_complaint_status(self, complaint_id: str) -> Dict[str, Any]:
        """Fetch tracking status of a previously submitted complaint."""
        if not self.is_configured():
            return {
                "complaint_id": complaint_id,
                "status": "LOCAL_VERIFIED",
                "message": "Live government sync unavailable without authorized API access."
            }
        try:
            import requests
            headers = {"Authorization": f"Bearer {self.api_key}"}
            res = requests.get(f"{self.api_url}/complaints/{complaint_id}", headers=headers, timeout=5)
            if res.status_code == 200:
                return res.json()
        except Exception as e:
            logger.error(f"Failed to check complaint status: {e}")
        return {"complaint_id": complaint_id, "status": "UNKNOWN"}

    def upload_evidence(self, complaint_id: str, file_path: str) -> Dict[str, Any]:
        """Upload photo/video evidence to official complaint record."""
        if not self.is_configured():
            return {"status": "SKIPPED", "message": "Evidence preserved locally in media storage."}
        try:
            import requests
            headers = {"Authorization": f"Bearer {self.api_key}"}
            with open(file_path, "rb") as f:
                res = requests.post(
                    f"{self.api_url}/complaints/{complaint_id}/evidence",
                    files={"file": f},
                    headers=headers,
                    timeout=15
                )
            return res.json() if res.status_code == 200 else {"status": "FAILED"}
        except Exception as e:
            return {"status": "ERROR", "error": str(e)}

    def update_complaint(self, complaint_id: str, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing complaint record."""
        if not self.is_configured():
            return {"status": "SKIPPED", "message": "Official API not configured."}
        try:
            import requests
            headers = {"Authorization": f"Bearer {self.api_key}"}
            res = requests.patch(f"{self.api_url}/complaints/{complaint_id}", json=update_data, headers=headers, timeout=5)
            return res.json() if res.status_code == 200 else {"status": "FAILED"}
        except Exception as e:
            return {"status": "ERROR", "error": str(e)}

    def submit_incident_to_government(self, incident: Any) -> Dict[str, Any]:
        """Backwards compatibility helper for admin handoff."""
        return self.create_complaint({
            "incident_code": incident.incident_code,
            "category": incident.category,
            "latitude": incident.latitude,
            "longitude": incident.longitude,
            "gps_accuracy": getattr(incident, "gps_accuracy", None),
            "ward_number": getattr(incident, "ward_number", None),
            "ward_name": getattr(incident, "ward_name", None),
            "assembly_constituency": getattr(incident, "assembly_constituency_name", None),
            "mla_name": getattr(incident, "mla_name", None),
            "parliamentary_constituency": getattr(incident, "parliamentary_constituency_name", None),
            "mp_name": getattr(incident, "mp_name", None),
            "primary_media_url": getattr(incident, "primary_media_url", None),
            "priority_score": getattr(incident, "priority_score", 50.0)
        })

    def generate_citizen_handoff_package(self, incident: Any) -> Dict[str, Any]:
        """Generate citizen dossier formatted for BBMP Sahaya 1533 helpline."""
        dossier = (
            f"BBMP CIVIC GRIEVANCE TECHNICAL DOSSIER\n"
            f"Incident Code: {incident.incident_code}\n"
            f"Category: {incident.category}\n"
            f"GPS Coordinates: {incident.latitude:.6f}, {incident.longitude:.6f}\n"
            f"Ward: #{getattr(incident, 'ward_number', 'N/A')} - {getattr(incident, 'ward_name', 'Bengaluru')}\n"
            f"Assembly: {getattr(incident, 'assembly_constituency_name', 'N/A')}\n"
            f"MLA: {getattr(incident, 'mla_name', 'N/A')}\n"
            f"Parliament: {getattr(incident, 'parliamentary_constituency_name', 'N/A')}\n"
            f"MP: {getattr(incident, 'mp_name', 'N/A')}\n"
            f"Severity: {incident.severity}\n"
            f"Priority Score: {incident.priority_score}\n"
            f"Timestamp: {incident.created_at.isoformat() if incident.created_at else 'N/A'}\n"
            f"BBMP 24x7 Helpline: 1533\n"
            f"BBMP Sahaya 2.0 Portal: https://nammabengaluru.org.in/"
        )
        return {
            "incident_id": incident.id,
            "incident_code": incident.incident_code,
            "mode": "CITIZEN_ASSISTED_HANDOFF",
            "formatted_dossier": dossier,
            "bbmp_helpline": "1533",
            "official_portal_url": "https://nammabengaluru.org.in/",
            "ipgrs_portal_url": "https://ipgrs.karnataka.gov.in/",
            "sahaaya_app_url": "https://play.google.com/store/apps/details?id=com.nammabengaluruNew.org",
            "created_at": datetime.now(timezone.utc).isoformat()
        }

government_adapter = GovernmentReportingAdapter()
govt_adapter = government_adapter
