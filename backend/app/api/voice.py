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
        detected_category=parsed["detected_category"],
        suggested_severity=parsed["suggested_severity"],
        extracted_description=parsed["extracted_description"],
        confidence=parsed["confidence"],
        ward_name=ward_name
    )
