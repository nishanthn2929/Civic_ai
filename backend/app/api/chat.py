from typing import List, Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.app.core.config import settings

router = APIRouter(prefix="/chat", tags=["Civic AI Assistant"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(min_length=1, max_length=20)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    active_tab: Optional[str] = None


class ChatResponse(BaseModel):
    message: str
    model: str


SYSTEM_PROMPT = """You are CivicAI Concierge, the helpful assistant inside a Bengaluru civic issue reporting platform.
Answer clearly and concisely. Help users report potholes and civic defects, understand photo GPS sources, use Voice AI, find BBMP ward context, track reports, and understand AI confidence/severity.
Never invent a ward, representative, complaint ID, government policy, or report status. Explain that exact photo location requires EXIF GPS or readable printed GPS coordinates; otherwise the system uses device GPS or a manual pin.
Do not claim to have submitted a report. Do not request passwords, API keys, or unnecessary personal data.
The current app can navigate users to Public Portal, Report Defect, Voice AI, Drive Mode, and My Reports.
"""


def generate_local_civic_guidance(query: str, active_tab: Optional[str] = None) -> str:
    q = query.lower()
    if "pothole" in q or "report" in q or "file" in q:
        return (
            "To report a road defect or pothole:\n"
            "1. Navigate to the 'Report Defect' tab.\n"
            "2. Upload a road photo. If your camera has GPS enabled, the system automatically extracts the exact EXIF coordinates and identifies your BBMP Ward, MLA, and MP.\n"
            "3. Our AI RT-DETR model pre-screens the defect area and assesses severity (Low, Medium, High).\n"
            "4. Review the details and submit to create or link to a verified municipal incident."
        )
    if "voice" in q or "audio" in q or "speak" in q or "kannada" in q:
        return (
            "Voice AI Reporting allows you to report issues hands-free in English or Kannada:\n"
            "1. Switch to the 'Voice AI' tab.\n"
            "2. Tap 'Start Recording' and describe the issue (e.g., 'Large pothole on 80 Feet Road near Koramangala Sony Signal').\n"
            "3. Our NLP engine extracts the category, severity, and landmark coordinates automatically."
        )
    if "photo" in q or "exif" in q or "location" in q or "gps" in q:
        return (
            "Photo Location Detection hierarchy:\n"
            "1. **EXIF GPS Metadata**: Extracted directly from your photo's camera metadata.\n"
            "2. **Printed/Camera GPS Stamps**: Read via OCR when GPS watermarking is enabled on your phone.\n"
            "3. **Device GPS**: Captured in real-time if permitted by your browser.\n"
            "4. **Interactive Map Pin**: You can always adjust the pin manually to pinpoint the defect."
        )
    if "drive" in q or "dashcam" in q:
        return (
            "AI Dashcam Drive Mode transforms your vehicle mount into an autonomous road inspector:\n"
            "- Minimalist Zero-Touch HUD with real-time audio chimes.\n"
            "- Temporal Filtering merges consecutive video frames of the same pothole into a single verified incident.\n"
            "- Offline resilience stores detections locally if you lose connectivity and syncs when back online."
        )
    if "track" in q or "my report" in q or "status" in q:
        return (
            "You can track all your submissions under the 'My Reports' tab. Once BBMP officers upload resolution evidence ('Before vs After' photo proof), you can submit Citizen Verification to confirm the fix was completed satisfactorily."
        )
    return (
        "Welcome to the Bengaluru Civic AI Platform! You can report road defects via Photo, Voice AI (English/Kannada), or Dashcam Drive Mode. "
        "Our system automatically identifies the exact BBMP Ward, Assembly Constituency (MLA), and Parliamentary Constituency (MP) via GIS Point-in-Polygon, "
        "and aggregates duplicate reports to streamline BBMP municipal ticket resolution."
    )


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not settings.AI_API_KEY:
        last_user_msg = next((m.content for m in reversed(request.messages) if m.role == "user"), "")
        fallback_reply = generate_local_civic_guidance(last_user_msg, request.active_tab)
        return ChatResponse(message=fallback_reply, model="CivicAI-Local-KnowledgeEngine")

    context = []
    if request.latitude is not None and request.longitude is not None:
        context.append(f"User map coordinates: {request.latitude:.6f}, {request.longitude:.6f}.")
    if request.active_tab:
        context.append(f"User is currently viewing: {request.active_tab}.")

    system_text = SYSTEM_PROMPT + ("\n" + " ".join(context) if context else "")
    if settings.AI_PROVIDER.lower() == "google":
        payload = {
            "systemInstruction": {"parts": [{"text": system_text}]},
            "contents": [
                {"role": "user" if message.role == "user" else "model", "parts": [{"text": message.content}]}
                for message in request.messages
            ],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 350}
        }
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.AI_MODEL}:generateContent?key={settings.AI_API_KEY}"
        headers = {"Content-Type": "application/json"}
    else:
        payload = {
            "model": settings.AI_MODEL,
            "messages": [
                {"role": "system", "content": system_text},
                *[message.model_dump() for message in request.messages]
            ],
            "temperature": 0.3,
            "max_tokens": 350
        }
        url = f"{settings.AI_BASE_URL.rstrip('/')}/chat/completions"
        headers = {"Authorization": f"Bearer {settings.AI_API_KEY}", "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            if settings.AI_PROVIDER.lower() == "google":
                message = "".join(
                    part.get("text", "")
                    for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                ).strip()
                response_model = settings.AI_MODEL
            else:
                message = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                response_model = data.get("model", settings.AI_MODEL)
            if not message:
                raise ValueError("Provider returned an empty response")
            return ChatResponse(message=message, model=response_model)
    except httpx.HTTPStatusError as error:
        detail = error.response.text[:500]
        raise HTTPException(status_code=502, detail=f"AI provider rejected the request: {detail}") from error
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail="The AI provider could not be reached. Try again shortly.") from error
