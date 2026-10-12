import json
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any
import cv2
import numpy as np
from sqlalchemy.orm import Session
from backend.app.models.models import Incident, IncidentStatus, Report, ReportMedia, IncidentStatusHistory, ReportStatus
from backend.app.services.gis_service import gis_service
from backend.app.services.ai_cv import cv_service
from backend.app.core.config import settings

class DuplicateDetectionEngine:
    """
    Multi-Signal Duplicate Civic Issue Detection Engine.
    
    Combines 4 distinct signals:
      1. Location similarity — GPS distance (Haversine formula within search radius e.g. 50m)
      2. Issue type similarity — Pothole, garbage, streetlight, water leak, etc.
      3. Visual similarity — Feature embeddings comparison (cosine similarity)
      4. Text similarity — Semantic complaint description similarity
      
    Classification Rules:
      - Score >= 0.85 (>=85%)  -> Confirmed duplicate: link directly to primary report/incident
      - 0.70 <= Score < 0.85   -> Possible duplicate: ask user for confirmation
      - Score < 0.70           -> New report: create fresh complaint
    """
    def __init__(
        self,
        weight_loc: float = 0.35,
        weight_cat: float = 0.25,
        weight_vis: float = 0.20,
        weight_text: float = 0.20,
        confirmed_threshold: float = 0.85,
        possible_threshold: float = 0.70,
        max_search_radius_meters: float = 50.0
    ):
        self.w_loc = weight_loc
        self.w_cat = weight_cat
        self.w_vis = weight_vis
        self.w_text = weight_text
        self.confirmed_threshold = confirmed_threshold
        self.possible_threshold = possible_threshold
        self.threshold = possible_threshold  # Backward compatibility
        self.max_radius = max_search_radius_meters

    # ---------------- 1. Image Embedding & Visual Similarity ---------------- #
    def extract_image_embedding(self, image_input: Any) -> Optional[List[float]]:
        """
        Extract a normalized 128-dimensional multi-resolution visual feature embedding.
        Captures spatial color distribution (HSV/LAB) and gradient direction histograms.
        Normalized to unit L2 length for fast cosine dot-product comparisons.
        """
        try:
            if isinstance(image_input, (bytes, bytearray)):
                np_arr = np.frombuffer(image_input, np.uint8)
                img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            elif isinstance(image_input, np.ndarray):
                img = image_input
            elif isinstance(image_input, (str, Path)):
                img_path = str(image_input)
                if not os.path.exists(img_path):
                    # Check in media dir
                    candidate = os.path.join(settings.MEDIA_DIR, os.path.basename(img_path))
                    if os.path.exists(candidate):
                        img_path = candidate
                img = cv2.imread(img_path)
            else:
                return None

            if img is None:
                return None

            # Resize to standard canonical size for embedding extraction
            img_resized = cv2.resize(img, (128, 128), interpolation=cv2.INTER_AREA)

            # 1. Color moments in LAB color space (robust to ambient road lighting changes)
            lab = cv2.cvtColor(img_resized, cv2.COLOR_BGR2LAB)
            hsv = cv2.cvtColor(img_resized, cv2.COLOR_BGR2HSV)
            
            # Split into 4x4 spatial quadrants (16 cells)
            cells_lab = [lab[r*32:(r+1)*32, c*32:(c+1)*32] for r in range(4) for c in range(4)]
            cells_hsv = [hsv[r*32:(r+1)*32, c*32:(c+1)*32] for r in range(4) for c in range(4)]

            features = []
            for cell in cells_lab:
                # Means and standard deviations of L, A, B channels (6 values per cell * 16 = 96)
                m, s = cv2.meanStdDev(cell)
                features.extend([float(m[0][0]), float(m[1][0]), float(m[2][0]),
                                 float(s[0][0]), float(s[1][0]), float(s[2][0])])

            # 2. Gradient orientation histogram across image (32 directional bins -> total 128)
            gray = cv2.cvtColor(img_resized, cv2.COLOR_BGR2GRAY)
            gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
            gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
            mag, ang = cv2.cartToPolar(gx, gy, angleInDegrees=True)
            hist, _ = np.histogram(ang, bins=32, range=(0, 360), weights=mag)
            features.extend([float(v) for v in hist])

            vec = np.array(features, dtype=np.float32)
            norm = np.linalg.norm(vec)
            if norm > 1e-6:
                vec = vec / norm
            return [round(float(x), 6) for x in vec]
        except Exception as e:
            print(f"[DuplicateEngine] Visual embedding extraction notice: {e}")
            return None

    def compare_image_embeddings(
        self,
        emb1: Optional[List[float]],
        emb2: Optional[List[float]],
        phash1: Optional[str] = None,
        phash2: Optional[str] = None
    ) -> float:
        """
        Compute visual similarity using cosine similarity between embeddings.
        Falls back to pHash Hamming similarity if embeddings are not both present.
        """
        if emb1 and emb2 and len(emb1) == len(emb2):
            v1 = np.array(emb1, dtype=np.float32)
            v2 = np.array(emb2, dtype=np.float32)
            dot = float(np.dot(v1, v2))
            return max(0.0, min(1.0, dot))
        
        # Fallback to pHash Hamming distance
        if phash1 and phash2:
            return cv2_phash_sim(phash1, phash2)
            
        return 0.70  # Neutral baseline if only one or neither has image

    # ---------------- 2. Text Semantic Similarity ---------------- #
    def compute_text_similarity(
        self,
        text1: Optional[str],
        text2: Optional[str]
    ) -> float:
        """
        Compute semantic similarity between two civic issue descriptions.
        Uses stopword filtering, civic domain synonyms, and token overlap.
        """
        t1 = (text1 or "").strip().lower()
        t2 = (text2 or "").strip().lower()

        if not t1 and not t2:
            return 0.75
        if not t1 or not t2:
            return 0.60

        if t1 == t2:
            return 1.0

        stopwords = {
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with",
            "about", "near", "right", "is", "are", "was", "were", "of", "by", "it", "this",
            "that", "there", "has", "have", "been", "please", "fix", "urgent", "very"
        }

        raw_words1 = re.findall(r"\w+", t1)
        raw_words2 = re.findall(r"\w+", t2)

        words1 = {w for w in raw_words1 if w not in stopwords and len(w) > 1}
        words2 = {w for w in raw_words2 if w not in stopwords and len(w) > 1}

        if not words1 or not words2:
            return 0.60

        # Civic synonym dictionary
        synonym_groups = [
            {"pothole", "potholes", "crater", "craters", "pit", "pits", "hole", "holes", "khadda", "gundi", "depression", "cavity"},
            {"damage", "damaged", "broken", "crack", "cracks", "tar", "asphalt", "surface", "uneven", "rasta", "dhaari"},
            {"garbage", "waste", "trash", "kachra", "dump", "kuppe", "kasa", "smell", "blackspot", "litter", "debris"},
            {"water", "leak", "leakage", "pipeline", "pipe", "burst", "neeru", "valve", "bwssb", "flowing"},
            {"drain", "drainage", "sewage", "gutter", "mori", "manhole", "overflow", "chamber"},
            {"streetlight", "light", "lamp", "dark", "pole", "bulb", "belaku", "fused", "unlit"},
            {"footpath", "sidewalk", "pedestrian", "paver", "kerb", "curb", "slab"}
        ]

        def expand_synonyms(word_set):
            expanded = set(word_set)
            for w in word_set:
                for grp in synonym_groups:
                    if w in grp:
                        expanded.update(grp)
            return expanded

        exp1 = expand_synonyms(words1)
        exp2 = expand_synonyms(words2)

        # 1. Token overlap
        intersection = len(exp1.intersection(exp2))
        union = len(exp1.union(exp2))
        jaccard = intersection / max(1, union)
        dice = (2.0 * intersection) / max(1, len(words1) + len(words2))

        # 2. Check if they belong to the same civic defect category domain
        domain_match = False
        for grp in synonym_groups:
            if any(w in grp for w in words1) and any(w in grp for w in words2):
                domain_match = True
                break

        domain_boost = 0.20 if domain_match else 0.0
        base_sim = (0.50 * dice) + (0.50 * jaccard) + domain_boost

        return max(0.0, min(1.0, round(base_sim, 3)))

    # ---------------- 3. Issue Category Similarity ---------------- #
    def compute_category_similarity(self, cat1: str, cat2: str) -> float:
        """
        Check issue type similarity.
        Exact match = 1.0. Related civic taxonomy cluster = 0.65 - 0.70.
        """
        c1 = (cat1 or "").strip().lower()
        c2 = (cat2 or "").strip().lower()

        if c1 == c2:
            return 1.0

        road_related = {"pothole", "road damage", "road crack", "uneven road", "street cavity"}
        waste_related = {"garbage", "garbage overflow", "trash dump", "black spot", "waste"}
        drain_related = {"drainage problem", "open manhole", "water leakage", "sewage overflow"}
        light_related = {"broken streetlight", "streetlight", "street light", "dark street"}

        for cluster in [road_related, waste_related, drain_related, light_related]:
            if c1 in cluster and c2 in cluster:
                return 0.70

        return 0.0

    # ---------------- 4. Location Distance & Similarity ---------------- #
    def compute_location_similarity(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float
    ) -> Tuple[float, float]:
        """
        Calculate GPS distance via Haversine and smooth location similarity score.
        Within 8m -> 1.0
        Within 8m to max_radius (50m) -> linear decay to 0.0
        Beyond max_radius -> 0.0
        """
        dist_m = gis_service.haversine_distance_meters(lat1, lon1, lat2, lon2)
        if dist_m > self.max_radius:
            return 0.0, dist_m

        if dist_m <= 8.0:
            s_loc = 1.0
        else:
            s_loc = max(0.0, (self.max_radius - dist_m) / (self.max_radius - 8.0))

        return s_loc, dist_m

    # ---------------- 5. Multi-Signal Candidate Matcher ---------------- #
    def find_duplicate_candidate(
        self,
        db: Session,
        category: str,
        lat: float,
        lon: float,
        raw_text: Optional[str] = None,
        image_bytes: Optional[bytes] = None,
        image_embedding: Optional[List[float]] = None,
        image_phash: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Compare incoming report with active nearby existing civic incidents & reports.
        Computes composite duplicate score from all 4 signals.
        Returns match metadata, score breakdown, and rule recommendation.
        """
        # Extract embedding for incoming image if bytes provided and embedding not passed
        if image_embedding is None and image_bytes:
            image_embedding = self.extract_image_embedding(image_bytes)

        # Active incident query: exclude resolved / closed incidents
        active_incidents = db.query(Incident).filter(
            Incident.status.notin_([IncidentStatus.CLOSED.value, IncidentStatus.RESOLVED.value])
        ).all()

        best_incident = None
        best_primary_report = None
        highest_score = 0.0
        best_signals = {
            "location": 0.0,
            "category": 0.0,
            "visual": 0.0,
            "text": 0.0,
            "distance_meters": 999.0
        }

        for inc in active_incidents:
            s_loc, dist = self.compute_location_similarity(lat, lon, inc.latitude, inc.longitude)
            if dist > self.max_radius:
                continue

            # 1. Category similarity
            s_cat = self.compute_category_similarity(category, inc.category)
            if s_cat == 0.0 and s_loc < 0.85:
                # Completely different category unless virtually identical spot
                continue

            # 2. Text similarity
            s_text = self.compute_text_similarity(raw_text, inc.description or inc.title)

            # 3. Visual similarity (compare with incident primary media and primary report)
            s_vis = 0.70
            primary_rep = db.query(Report).filter(Report.incident_id == inc.id).order_by(Report.id.asc()).first()
            
            # Check existing embeddings
            target_emb = None
            target_phash = None
            if primary_rep:
                if primary_rep.image_embedding:
                    try:
                        target_emb = json.loads(primary_rep.image_embedding)
                    except Exception:
                        pass
                # Check media records
                media_rec = db.query(ReportMedia).filter(ReportMedia.report_id == primary_rep.id).first()
                if media_rec:
                    target_phash = media_rec.image_phash

            # If embedding exists for target, compare
            if image_embedding or target_emb or image_phash or target_phash:
                s_vis = self.compare_image_embeddings(
                    image_embedding,
                    target_emb,
                    image_phash,
                    target_phash
                )

            # Composite multi-signal weighted score
            has_vis = bool((image_embedding is not None or image_phash is not None) and (target_emb is not None or target_phash is not None))
            has_text = bool(raw_text and (inc.description or inc.title))

            w_l = self.w_loc
            w_c = self.w_cat
            w_v = self.w_vis if has_vis else 0.0
            w_t = self.w_text if has_text else 0.0

            total_w = w_l + w_c + w_v + w_t
            if total_w > 0:
                score = (
                    (w_l * s_loc)
                    + (w_c * s_cat)
                    + (w_v * s_vis if has_vis else 0.0)
                    + (w_t * s_text if has_text else 0.0)
                ) / total_w
            else:
                score = s_loc

            if score > highest_score:
                highest_score = score
                best_incident = inc
                best_primary_report = primary_rep
                best_signals = {
                    "location": round(s_loc, 3),
                    "category": round(s_cat, 3),
                    "visual": round(s_vis, 3),
                    "text": round(s_text, 3),
                    "distance_meters": round(dist, 1)
                }

        highest_score = round(highest_score, 3)

        # Classification Rules:
        # >= 0.85 -> Confirmed duplicate
        # 0.70 to 0.84 -> Possible duplicate (ask confirmation)
        # < 0.70 -> New report
        if highest_score >= self.confirmed_threshold and best_incident is not None:
            status = "CONFIRMED_DUPLICATE"
            action = "confirmed"
        elif highest_score >= self.possible_threshold and best_incident is not None:
            status = "POSSIBLE_DUPLICATE"
            action = "ask_confirmation"
        else:
            status = "NEW_REPORT"
            action = "create_new"

        return {
            "status": status,
            "action": action,
            "score": highest_score,
            "percentage": round(highest_score * 100.0, 1),
            "thresholds": {
                "confirmed": self.confirmed_threshold,
                "possible": self.possible_threshold,
                "search_radius_meters": self.max_radius
            },
            "signals": best_signals,
            "matched_incident": best_incident,
            "primary_report": best_primary_report
        }

    # ---------------- 6. Backward Compatible Helper ---------------- #
    def find_duplicate_incident(
        self,
        db: Session,
        category: str,
        lat: float,
        lon: float,
        image_phash: Optional[str] = None,
        raw_text: Optional[str] = None
    ) -> Tuple[Optional[Incident], float]:
        """
        Preserve backward-compatible API signature for existing callers.
        """
        res = self.find_duplicate_candidate(
            db=db,
            category=category,
            lat=lat,
            lon=lon,
            raw_text=raw_text,
            image_phash=image_phash
        )
        if res["matched_incident"] and res["score"] >= self.possible_threshold:
            return res["matched_incident"], res["score"]
        return None, res["score"]


def cv2_phash_sim(hash1: Optional[str], hash2: Optional[str]) -> float:
    """Helper for hamming distance perceptual hash similarity."""
    if not hash1 or not hash2 or len(hash1) != len(hash2):
        return 0.0
    try:
        bits1 = bin(int(hash1, 16))[2:].zfill(len(hash1) * 4)
        bits2 = bin(int(hash2, 16))[2:].zfill(len(hash2) * 4)
        dist = sum(c1 != c2 for c1, c2 in zip(bits1, bits2))
        return max(0.0, 1.0 - (dist / float(len(bits1))))
    except Exception:
        return 0.5

duplicate_engine = DuplicateDetectionEngine()
