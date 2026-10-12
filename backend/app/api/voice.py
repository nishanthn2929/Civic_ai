from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.schemas import VoiceReportRequest, VoiceReportParsedOut
from backend.app.services.nlp_voice_service import nlp_service
from backend.app.services.gis_service import gis_service

router = APIRouter(prefix="/voice", tags=["Voice Reporting"])

@router.post("/parse", response_model=VoiceReportParsedOut)
def parse_voice_transcript(req: VoiceReportRequest, db: Session = Depends(get_db)):
    """
    Parse a speech transcript (English or Kannada), extract category, severity,
    and description, and associate with the nearest Bengaluru Ward.
    """
    if not req.transcript or not req.transcript.strip():
        raise HTTPException(status_code=400, detail="Voice transcript is empty.")

    # Run NLP extraction
    parsed = nlp_service.parse_transcript(req.transcript, language=req.language or "en")

    # GIS lookup for Bengaluru ward
    ward_info = gis_service.find_ward_by_coordinates(req.latitude, req.longitude)
    ward_name = ward_info["ward_name"] if ward_info else "Bengaluru Urban"

    return VoiceReportParsedOut(
        transcript=req.transcript,
        is_valid_civic=parsed.get("is_valid_civic", True),
        validation_message=parsed.get("validation_message"),
        detected_category=parsed.get("detected_category"),
        suggested_severity=parsed.get("suggested_severity"),
        extracted_description=parsed.get("extracted_description", req.transcript),
        confidence=parsed.get("confidence", 0.0),
        ward_name=ward_name,
        zone_name=ward_info.get("zone_name") if ward_info else None,
        formatted_address=ward_info.get("formatted_address") if ward_info else None,
        is_within_bengaluru=ward_info.get("is_within_bengaluru", False) if ward_info else False,
        latitude=req.latitude,
        longitude=req.longitude,
        assembly_constituency=ward_info.get("assembly_constituency") if ward_info else None,
        mla_name=ward_info.get("mla_name") if ward_info else None,
        parliamentary_constituency=ward_info.get("parliamentary_constituency") if ward_info else None,
        mp_name=ward_info.get("mp_name") if ward_info else None
    )
