import re
from typing import Dict, Any, Optional

class NLPVoiceService:
    def __init__(self):
        # Kannada & English keyword dictionary for civic categories
        # Note: Garbage Overflow, Water Leakage, Open Manhole removed as per specification
        self.category_keywords = {
            "Pothole": [
                # English
                "pothole", "potholes", "crater", "craters", "road pit", "trench",
                "cavity", "hole in road", "depression", "deep hole", "pit",
                # Kannada Script
                "ಗುಂಡಿ", "ಗುಂಡಿಗಳು", "ತಗ್ಗು", "ಹಳ್ಳ", "ಖಡ್ಡ", "ಖಡ್ಡಾ", "ರಸ್ತೆ ಗುಂಡಿ",
                # Transliterated Kannada
                "gundi", "gundigalu", "taggu", "halla", "hallah", "khadda", "khada"
            ],
            "Road Damage": [
                # English
                "road damage", "damaged road", "broken road", "broken asphalt", "tar broken",
                "tar peeled", "bad road", "uneven road", "patch", "patchwork",
                "speed breaker broken", "road worn out", "sinkhole", "asphalt",
                # Kannada Script
                "ರಸ್ತೆ ಹಾಳಾಗಿದೆ", "ರಸ್ತೆ ಕಿತ್ತುಹೋಗಿದೆ", "ಹಾಳಾದ ರಸ್ತೆ", "ಡಾಂಬರು", "ರಸ್ತೆ ಹಾನಿ",
                "ರಸ್ತೆ", "ಕಿತ್ತುಹೋಗಿದೆ", "ರಸ್ತೆ ಸರಿ ಇಲ್ಲ",
                # Transliterated Kannada
                "raste haalagide", "dambar", "kittuhogide", "raste kharab", "dhaari",
                "rasta kharab", "halada raste", "haalaagide"
            ],
            "Road Crack": [
                # English
                "road crack", "crack", "cracks", "fissure", "road slit", "surface break",
                "crevice", "split road", "pavement crack",
                # Kannada Script
                "ಬಿರುಕು", "ಬಿರುಕುಗಳು", "ಸೀಳು", "ರಸ್ತೆ ಬಿರುಕು", "ಬಿರುಕು ಬಿಟ್ಟಿದೆ",
                # Transliterated Kannada
                "biruku", "birukugalu", "seelu", "biruku bittide"
            ],
            "Broken Streetlight": [
                # English
                "streetlight", "street light", "street lamp", "light not working",
                "dark road", "bulb fused", "pole damage", "no lights", "lamp post",
                # Kannada Script
                "ಬೀದಿ ದೀಪ", "ಬೆಳಕು ಇಲ್ಲ", "ದೀಪ ಆಫ್ ಆಗಿದೆ", "ಕಂಬ ಮುರಿದಿದೆ", "ಸ್ಟ್ರೀಟ್ ಲೈಟ್",
                # Transliterated Kannada
                "beedi deepa", "belaku illa", "street light kharab", "deepa"
            ],
            "Drainage Problem": [
                # English
                "drain", "drainage", "sewage", "gutter", "overflow", "storm drain",
                "blocked drain", "foul water", "waterlogging", "clogged drain",
                # Kannada Script
                "ಚರಂಡಿ", "ಮೋರಿ", "ಕೊಳಚೆ ನೀರು", "ನೀರು ನಿಂತಿದೆ", "ಚರಂಡಿ ಬ್ಲಾಕ್", "ಮೋರಿ ತುಂಬಿದೆ",
                # Transliterated Kannada
                "charandi", "mori", "neeru nintide", "gutter block", "mori block"
            ]
        }

        # Urgency & Severity indicators
        self.high_urgency_words = [
            # English
            "accident", "danger", "dangerous", "urgent", "bikes falling", "deep",
            "huge", "massive", "people falling", "critical", "risk", "hazard", "fatal", "severe",
            # Kannada Script
            "ಅಪಾಯ", "ಅಪಘಾತ", "ದೊಡ್ಡ", "ಭಾರಿ", "ತುರ್ತು", "ಬೀಳುತ್ತಿದ್ದಾರೆ", "ಸಾವು", "ತೀವ್ರ",
            # Transliterated
            "apaya", "apagatha", "dodda", "bhaari", "biddare"
        ]

        self.low_urgency_words = [
            "small", "minor", "little", "slight",
            "ಸಣ್ಣ", "ಸ್ವಲ್ಪ", "ಚಿಕ್ಕ",
            "chikka", "sanna", "swalpa"
        ]

    def _contains_kannada(self, text: str) -> bool:
        """Check if string contains Kannada Unicode characters (U+0C80 to U+0CFF)."""
        return bool(re.search(r'[\u0C80-\u0CFF]', text))

    def _matches_keyword(self, keyword: str, text: str) -> bool:
        """Robust keyword matching for both multi-word phrases and agglutinative Kannada script."""
        kw = keyword.lower().strip()
        # For non-ASCII or multi-word phrases, do substring search
        if any(ord(c) > 127 for c in kw) or " " in kw:
            return kw in text
        # For single English words, use word boundary to prevent false substring matches (e.g. 'hole' in 'whole')
        return bool(re.search(rf"\b{re.escape(kw)}\b", text))

    def parse_transcript(self, transcript: str, language: str = "en") -> Dict[str, Any]:
        """
        Convert citizen speech transcript into structured civic report fields.
        Strictly validates that a real civic issue is mentioned before fabricating a ticket.
        """
        cleaned_text = transcript.strip().lower()
        is_kannada_input = language.startswith("kn") or self._contains_kannada(cleaned_text)

        if not cleaned_text:
            return {
                "is_valid_civic": False,
                "validation_message": "ಧ್ವನಿ ದೂರು ಖಾಲಿಯಾಗಿದೆ." if is_kannada_input else "Voice transcript is empty.",
                "detected_category": None,
                "suggested_severity": None,
                "extracted_description": "",
                "confidence": 0.0
            }

        # 1. Match Category with keyword frequency analysis
        best_category: Optional[str] = None
        best_matches = 0
        matches_per_category: Dict[str, int] = {}

        for category, keywords in self.category_keywords.items():
            matches = sum(1 for kw in keywords if self._matches_keyword(kw, cleaned_text))
            if matches > 0:
                matches_per_category[category] = matches
            if matches > best_matches:
                best_matches = matches
                best_category = category

        # 2. Strict Civic Defect Validation:
        # If no category keywords matched, this is random text, greetings, insults, or non-civic noise!
        if best_matches == 0 or not best_category:
            msg = (
                "ಧ್ವನಿಯಲ್ಲಿ ಯಾವುದೇ ರಸ್ತೆ ಸಮಸ್ಯೆ ಅಥವಾ ದೂರು ಪತ್ತೆಯಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಗುಂಡಿ, ಹಾಳಾದ ರಸ್ತೆ ಅಥವಾ ಬಿರುಕಿನ ಬಗ್ಗೆ ಸ್ಪಷ್ಟವಾಗಿ ಮಾತನಾಡಿ."
                if is_kannada_input else
                "No civic defect or road problem was detected in this recording. Please mention a specific issue like a pothole, broken road, or crack."
            )
            return {
                "is_valid_civic": False,
                "validation_message": msg,
                "detected_category": None,
                "suggested_severity": None,
                "extracted_description": transcript.strip(),
                "confidence": 0.0
            }

        # 3. Extract Severity & Urgency
        severity = "MEDIUM"
        urgency_hits = sum(1 for w in self.high_urgency_words if self._matches_keyword(w, cleaned_text))
        low_hits = sum(1 for w in self.low_urgency_words if self._matches_keyword(w, cleaned_text))

        if urgency_hits >= 2:
            severity = "CRITICAL"
        elif urgency_hits == 1:
            severity = "HIGH"
        elif low_hits > 0 and urgency_hits == 0:
            severity = "LOW"

        # Confidence is high when genuine defect keywords match
        confidence = min(0.95, 0.65 + (best_matches * 0.10) + (urgency_hits * 0.08))

        # 4. Clean and format description
        extracted_description = transcript.strip()
        if not extracted_description.endswith((".", "!", "?", "।")):
            extracted_description += "."

        return {
            "is_valid_civic": True,
            "validation_message": None,
            "detected_category": best_category,
            "suggested_severity": severity,
            "extracted_description": extracted_description,
            "confidence": round(confidence, 2)
        }

nlp_service = NLPVoiceService()
