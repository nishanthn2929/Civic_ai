import re
from typing import Dict, Any

class NLPVoiceService:
    def __init__(self):
        # Kannada & English keyword dictionary for civic categories
        self.category_keywords = {
            "Pothole": [
                "pothole", "gundi", "khadda", "hole", "crater", "trench",
                "road hole", "bike falling", "skid", "road pit", "depression"
            ],
            "Road Damage": [
                "road damage", "tar broken", "broken road", "uneven road", "patch",
                "hump", "speed breaker broken", "asphalt", "rasta kharab", "dhaari"
            ],
            "Road Crack": [
                "crack", "cracks", "fissure", "road slit", "surface break"
            ],
            "Garbage Overflow": [
                "garbage", "kachra", "waste", "trash", "dump", "smell",
                "black spot", "plastic", "kuppe", "kasa", "cleaning"
            ],
            "Water Leakage": [
                "water leak", "pipeline burst", "drinking water", "bwssb leak",
                "pipe broken", "water flowing", "neeru", "valve leak"
            ],
            "Drainage Problem": [
                "drain", "drainage", "sewage", "gutter", "overflow", "manhole overflow",
                "mori", "blocking", "foul water"
            ],
            "Open Manhole": [
                "open manhole", "manhole cover missing", "manhole lid", "deep hole",
                "chamber open", "cover broken"
            ],
            "Broken Streetlight": [
                "streetlight", "light not working", "dark road", "street lamp",
                "bulb fused", "belaku", "pole damage"
            ]
        }

        self.high_urgency_words = [
            "accident", "danger", "dangerous", "urgent", "bikes falling", "deep",
            "huge", "massive", "people falling", "critical", "risk", "hazard", "fatal"
        ]

    def parse_transcript(self, transcript: str, language: str = "en") -> Dict[str, Any]:
        """Convert citizen speech transcript into structured civic report fields."""
        cleaned_text = transcript.strip().lower()
        if not cleaned_text:
            return {
                "detected_category": "Other",
                "suggested_severity": "MEDIUM",
                "extracted_description": "Unclear voice report",
                "confidence": 0.3
            }

        # 1. Match Category
        best_category = "Road Damage"
        best_matches = 0
        for category, keywords in self.category_keywords.items():
            matches = sum(1 for kw in keywords if re.search(rf"\b{re.escape(kw)}\b", cleaned_text))
            if matches > best_matches:
                best_matches = matches
                best_category = category

        # 2. Extract Severity & Urgency
        severity = "MEDIUM"
        urgency_hits = sum(1 for w in self.high_urgency_words if w in cleaned_text)
        if urgency_hits >= 2:
            severity = "CRITICAL"
        elif urgency_hits == 1 or "large" in cleaned_text or "big" in cleaned_text:
            severity = "HIGH"
        elif "small" in cleaned_text or "minor" in cleaned_text:
            severity = "LOW"

        confidence = min(0.95, 0.50 + (best_matches * 0.15) + (urgency_hits * 0.10))

        # 3. Clean and format description
        extracted_description = transcript.strip()
        if not extracted_description.endswith("."):
            extracted_description += "."

        return {
            "detected_category": best_category,
            "suggested_severity": severity,
            "extracted_description": extracted_description,
            "confidence": round(confidence, 2)
        }

nlp_service = NLPVoiceService()
