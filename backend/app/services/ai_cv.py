import io
import os
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import cv2
import numpy as np

# Ensure NumPy 2.0+ compatibility with Ultralytics trapz calls
if not hasattr(np, "trapz"):
    np.trapz = getattr(np, "trapezoid", None)

from PIL import Image
from backend.app.core.config import settings

class ComputerVisionService:
    def __init__(self):
        self.model = None
        self.model_name = "None"
        self.face_cascade = None
        self._init_face_cascade()
        self._init_model()

    def _init_face_cascade(self):
        """Load OpenCV frontal face and upperbody Haar cascades to reject human false positives."""
        self.face_cascades = []
        cascade_names = [
            "haarcascade_frontalface_alt2.xml",
            "haarcascade_frontalface_default.xml",
            "haarcascade_profileface.xml",
            "haarcascade_upperbody.xml"
        ]
        for name in cascade_names:
            try:
                p = cv2.data.haarcascades + name
                casc = cv2.CascadeClassifier(p)
                if not casc.empty():
                    self.face_cascades.append(casc)
            except Exception:
                pass

    def _init_model(self):
        """Initialize the road-defect detector using the best available trained model."""
        try:
            from ultralytics import YOLO, RTDETR
            data_pothole = Path(settings.DATA_DIR) / "rtdetr_pothole_best.pt"
            pipeline_pothole = Path(__file__).resolve().parent.parent.parent.parent / "ml_pipeline" / "weights" / "rtdetr_pothole_best.pt"
            data_yolo = Path(settings.DATA_DIR) / "yolov8_pothole_best.pt"
            pipeline_yolo = Path(__file__).resolve().parent.parent.parent.parent / "ml_pipeline" / "weights" / "yolov8_pothole_best.pt"
            data_multiclass = Path(settings.DATA_DIR) / "civic_multiclass_rtdetr_best.pt"
            pipeline_multiclass = Path(__file__).resolve().parent.parent.parent.parent / "ml_pipeline" / "weights" / "civic_multiclass_rtdetr_best.pt"

            if data_pothole.exists():
                self.model = RTDETR(str(data_pothole))
                self.model_name = f"Custom-Trained RT-DETR ({data_pothole.name})"
            elif pipeline_pothole.exists():
                self.model = RTDETR(str(pipeline_pothole))
                self.model_name = f"Custom-Trained RT-DETR ({pipeline_pothole.name})"
            elif data_yolo.exists():
                self.model = YOLO(str(data_yolo))
                self.model_name = f"Fine-Tuned Road Detector ({data_yolo.name})"
            elif pipeline_yolo.exists():
                self.model = YOLO(str(pipeline_yolo))
                self.model_name = f"Fine-Tuned Road Detector ({pipeline_yolo.name})"
            elif data_multiclass.exists():
                self.model = RTDETR(str(data_multiclass))
                self.model_name = f"Custom Multiclass RT-DETR ({data_multiclass.name})"
            elif pipeline_multiclass.exists():
                self.model = RTDETR(str(pipeline_multiclass))
                self.model_name = f"Custom Multiclass RT-DETR ({pipeline_multiclass.name})"
            elif data_pothole.exists():
                self.model = RTDETR(str(data_pothole))
                self.model_name = f"Custom-Trained RT-DETR ({data_pothole.name})"
            elif pipeline_pothole.exists():
                self.model = RTDETR(str(pipeline_pothole))
                self.model_name = f"Custom-Trained RT-DETR ({pipeline_pothole.name})"
            else:
                self.model = YOLO("yolov8n.pt")
                self.model_name = "YOLOv8n (pretrained fallback)"
            print(f"[CV Service] Loaded road defect detection model: {self.model_name}")
        except Exception as e:
            print(f"[CV Service Warning] Ultralytics initialization notice: {e}. Fallback detection pipeline active.")
            self.model = None
            self.model_name = "Contour-Texture Fallback"

    @staticmethod
    def compute_blur_score(image_np: np.ndarray) -> float:
        """Compute the Laplacian variance to detect image blur. Higher = sharper."""
        if len(image_np.shape) == 3:
            gray = cv2.cvtColor(image_np, cv2.COLOR_BGR2GRAY)
        else:
            gray = image_np
        return float(cv2.Laplacian(gray, cv2.CV_64F).var())

    @staticmethod
    def compute_phash(image_np: np.ndarray, hash_size: int = 8) -> str:
        """Compute 64-bit difference hash (dHash) for visual similarity comparison."""
        if len(image_np.shape) == 3:
            gray = cv2.cvtColor(image_np, cv2.COLOR_BGR2GRAY)
        else:
            gray = image_np
        # Resize to (hash_size + 1, hash_size)
        resized = cv2.resize(gray, (hash_size + 1, hash_size), interpolation=cv2.INTER_AREA)
        diff = resized[:, 1:] > resized[:, :-1]
        # Convert boolean array to hex string
        return "".join(f"{int(''.join(map(str, row.astype(int))), 2):02x}" for row in diff)

    @staticmethod
    def phash_similarity(hash1: Optional[str], hash2: Optional[str]) -> float:
        """Return similarity score between 0.0 and 1.0 based on Hamming distance."""
        if not hash1 or not hash2 or len(hash1) != len(hash2):
            return 0.0
        # Convert hex strings to bit sequences
        bits1 = bin(int(hash1, 16))[2:].zfill(len(hash1) * 4)
        bits2 = bin(int(hash2, 16))[2:].zfill(len(hash2) * 4)
        hamming_dist = sum(c1 != c2 for c1, c2 in zip(bits1, bits2))
        max_dist = len(bits1)
        return max(0.0, 1.0 - (hamming_dist / max_dist))

    def detect_in_image(
        self,
        image_bytes: bytes,
        confidence_threshold: float = 0.40
    ) -> Dict[str, Any]:
        """Run AI road defect / pothole detection on raw image bytes."""
        # Decode image using OpenCV
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Invalid image file or unable to decode image.")

        h, w = img.shape[:2]
        blur_val = self.compute_blur_score(img)
        phash = self.compute_phash(img)
        is_clear = blur_val >= settings.DEFAULT_BLUR_THRESHOLD

        # 0. Multi-Cascade Human Subject & Skin-Tone Pre-Screening:
        detected_humans = []
        has_prominent_human = False
        if getattr(self, 'face_cascades', None):
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            for casc in self.face_cascades:
                try:
                    boxes = casc.detectMultiScale(
                        gray, scaleFactor=1.12, minNeighbors=3, minSize=(30, 30)
                    )
                    if len(boxes) > 0:
                        for (hx, hy, hw, hh) in boxes:
                            detected_humans.append((hx, hy, hw, hh))
                            # Flag if a person / face occupies > 3% of the frame
                            if (hw * hh) > (w * h * 0.03):
                                has_prominent_human = True
                except Exception:
                    pass

        # Global Human Skin Tone Check (Kovac/Chai standard YCrCb model)
        ycrcb_full = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
        cr_full = ycrcb_full[:, :, 1]
        cb_full = ycrcb_full[:, :, 2]
        full_skin_mask = (cr_full >= 133) & (cr_full <= 173) & (cb_full >= 77) & (cb_full <= 127)
        frame_skin_ratio = float(np.mean(full_skin_mask))

        # If a human subject is in the camera view (>5% skin or prominent face/upperbody),
        # suppress road pothole detections completely
        if has_prominent_human or frame_skin_ratio > 0.05:
            return {
                "detected_category": "Other",
                "confidence": 0.0,
                "suggested_severity": "LOW",
                "severity_reason": "LOW: Human subject/face/skin detected in camera frame. Pothole detection suppressed.",
                "severity_factors": {
                    "severity": "LOW",
                    "defect_area_pct": 0.0,
                    "total_area_pct": 0.0,
                    "defect_count": 0,
                    "risk_level": "MINOR",
                    "hazard_summary": "Human subject detected in camera view",
                    "recommended_action": "Mount camera facing forward onto road surface"
                },
                "blur_score": round(blur_val, 2),
                "is_clear": is_clear,
                "phash": phash,
                "detections": [],
                "image_dimensions": {"width": w, "height": h}
            }

        # Convert image to HSV for asphalt/concrete saturation screening
        hsv_img = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

        def _is_valid_road_defect_box(x1, y1, x2, y2):
            bw = x2 - x1
            bh = y2 - y1
            if bw < 12 or bh < 8:
                return False

            # Road Region of Interest: center point must not be in top 30% of frame (sky / horizon)
            center_y = (y1 + y2) / 2.0
            if center_y < (h * 0.30):
                return False

            # Bottom-edge cutoff / car hood / border artifact filter:
            # Rejects boxes clipped or touching the bottom frame boundary (y2 >= 95% of height)
            if y2 >= (h * 0.95) and (y1 > (h * 0.80) or bh < (h * 0.14)):
                return False

            # Side border cutoff artifact filter:
            if (x1 <= 2.0 and x2 < (w * 0.08)) or (x2 >= (w - 2.0) and (x2 - x1) < (w * 0.08)):
                return False

            # Max Area Filter: reject if area > 35% of total frame area
            box_area = bw * bh
            if (box_area / float(w * h)) > 0.35:
                return False

            # Aspect Ratio Filter: reject tall vertical boxes where width / height < 0.70
            # Potholes and road cavities are horizontally elongated or rounded ellipses
            if (bw / max(1.0, bh)) < 0.70:
                return False

            # Human overlap check: reject if overlapping with any detected face/upper body
            for (fx, fy, fw, fh) in detected_humans:
                ix1 = max(x1, float(fx))
                iy1 = max(y1, float(fy))
                ix2 = min(x2, float(fx + fw))
                iy2 = min(y2, float(fy + fh))
                if ix2 > ix1 and iy2 > iy1:
                    inter = (ix2 - ix1) * (iy2 - iy1)
                    if (inter / box_area > 0.08) or (inter / float(fw * fh) > 0.08):
                        return False

            # Crop box coordinates
            bx1 = max(0, min(w - 1, int(x1)))
            by1 = max(0, min(h - 1, int(y1)))
            bx2 = max(bx1 + 1, min(w, int(x2)))
            by2 = max(by1 + 1, min(h, int(y2)))
            crop = img[by1:by2, bx1:bx2]
            if crop.size == 0:
                return False

            # YCrCb Skin Tone Check: reject if >10% of pixels in box match human skin
            crop_ycrcb = ycrcb_full[by1:by2, bx1:bx2]
            cr = crop_ycrcb[:, :, 1]
            cb = crop_ycrcb[:, :, 2]
            box_skin = (cr >= 133) & (cr <= 173) & (cb >= 77) & (cb <= 127)
            if float(np.mean(box_skin)) > 0.10:
                return False

            # Low-saturation check: real asphalt / concrete road surfaces have low saturation (mean HSV S < 52)
            # Rejects high-saturation items (pink/red clothing, skin tones, vibrant indoor objects)
            crop_hsv = hsv_img[by1:by2, bx1:bx2]
            mean_sat = float(np.mean(crop_hsv[:, :, 1]))
            if mean_sat >= 52.0:
                return False

            # Achromatic Road Check: Asphalt is gray/black stone (R ≈ G ≈ B)
            # Human skin and warm room clothing have high (R - B) differences
            b_mean = float(np.mean(crop[:, :, 0]))
            r_mean = float(np.mean(crop[:, :, 2]))
            if abs(r_mean - b_mean) > 25.0:
                return False

            return True

        detections: List[Dict[str, Any]] = []
        candidate_boxes: List[Dict[str, Any]] = []

        # 1. Neural Model Inference (YOLOv8 / RT-DETR)
        if self.model is not None:
            try:
                results = self.model(img, conf=confidence_threshold, verbose=False)
                for r in results:
                    if len(r.boxes) > 0:
                        for box in r.boxes:
                            cls_id = int(box.cls[0].item())
                            cls_name = self.model.names[cls_id]
                            conf = float(box.conf[0].item())
                            xyxy = box.xyxy[0].tolist()

                            # Clamp box strictly within image bounds
                            x1 = max(0.0, min(float(w), xyxy[0]))
                            y1 = max(0.0, min(float(h), xyxy[1]))
                            x2 = max(0.0, min(float(w), xyxy[2]))
                            y2 = max(0.0, min(float(h), xyxy[3]))

                            # Apply strict road, face, skin, and geometry validations
                            if not _is_valid_road_defect_box(x1, y1, x2, y2):
                                continue

                            # Map detector classes from the multiclass civic dataset.
                            mapped_category = "Pothole"
                            if cls_name.lower() in ["crack", "road_crack"]:
                                mapped_category = "Road Crack"
                            elif cls_name.lower() in ["damage", "road_damage"]:
                                mapped_category = "Road Damage"
                            elif cls_name.lower() in ["garbage", "garbage_overflow", "trash", "waste"]:
                                mapped_category = "Garbage Overflow"
                            elif cls_name.lower() in ["water_leakage", "water_leak", "leakage", "pipe_leak"]:
                                mapped_category = "Water Leakage"
                            elif cls_name.lower() in ["streetlight", "street_light", "broken_streetlight"]:
                                mapped_category = "Broken Streetlight"

                            bw = x2 - x1
                            bh = y2 - y1
                            candidate_boxes.append({
                                "class_name": mapped_category,
                                "confidence": round(conf, 3),
                                "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                                "area": bw * bh
                            })
            except Exception as e:
                print(f"[Inference Error] Model inference warning: {e}")

        # 2. Heuristic cavity & texture fallback ONLY if NO neural model could be loaded at all
        if self.model is None and len(candidate_boxes) == 0:
            try:
                road_mask = np.zeros((h, w), dtype=np.uint8)
                road_mask[int(h * 0.30):, :] = 255

                puddle_mask = ((hsv_img[:,:,0] >= 10) & (hsv_img[:,:,0] <= 36) & 
                               (hsv_img[:,:,1] >= 12) & (hsv_img[:,:,1] <= 60) & 
                               (hsv_img[:,:,2] >= 90) & (hsv_img[:,:,2] <= 195)).astype(np.uint8) * 255
                puddle_mask = cv2.bitwise_and(puddle_mask, road_mask)
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
                closed = cv2.morphologyEx(puddle_mask, cv2.MORPH_CLOSE, kernel)
                contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

                for cnt in contours:
                    area = cv2.contourArea(cnt)
                    if area > (w * h * 0.008):
                        x, y, cw, ch = cv2.boundingRect(cnt)
                        pad = int(min(cw, ch) * 0.14)
                        x1 = max(0.0, float(x - pad))
                        y1 = max(float(h * 0.30), float(y - pad))
                        x2 = min(float(w), float(x + cw + pad))
                        y2 = min(float(h), float(y + ch + pad))
                        if _is_valid_road_defect_box(x1, y1, x2, y2):
                            calc_conf = min(0.95, max(0.78, 0.78 + (area / (w * h) * 1.5)))
                            candidate_boxes.append({
                                "class_name": "Pothole",
                                "confidence": round(calc_conf, 3),
                                "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                                "area": (x2 - x1) * (y2 - y1)
                            })
            except Exception as e:
                print(f"[Cavity Detector Notice] {e}")

        # 4. Multi-scale NMS & Enveloping: merge duplicate sub-boxes on the same road defect
        candidate_boxes.sort(key=lambda item: item["confidence"], reverse=True)
        final_kept: List[Dict[str, Any]] = []

        for cand in candidate_boxes:
            b1 = cand["bbox"]
            a1 = max(1.0, (b1[2] - b1[0]) * (b1[3] - b1[1]))
            matched_idx = -1

            for idx, kept in enumerate(final_kept):
                b2 = kept["bbox"]
                a2 = max(1.0, (b2[2] - b2[0]) * (b2[3] - b2[1]))

                ix1 = max(b1[0], b2[0])
                iy1 = max(b1[1], b2[1])
                ix2 = min(b1[2], b2[2])
                iy2 = min(b1[3], b2[3])
                iw = max(0.0, ix2 - ix1)
                ih = max(0.0, iy2 - iy1)
                inter = iw * ih

                if inter > 0:
                    union = a1 + a2 - inter
                    iou = inter / max(1e-6, union)
                    iom = inter / min(a1, a2)  # Intersection over Minimum (nested containment)

                    # If IoU > 0.20 or containment iom > 0.30: detects the same physical defect
                    if iou > 0.20 or iom > 0.30:
                        matched_idx = idx
                        break

            if matched_idx >= 0:
                # Merge into existing detection to form one comprehensive, clean envelope
                existing = final_kept[matched_idx]
                eb = existing["bbox"]
                merged_bbox = [
                    round(min(eb[0], b1[0]), 1),
                    round(min(eb[1], b1[1]), 1),
                    round(max(eb[2], b1[2]), 1),
                    round(max(eb[3], b1[3]), 1)
                ]
                merged_w = merged_bbox[2] - merged_bbox[0]
                merged_h = merged_bbox[3] - merged_bbox[1]
                # Keep merged box if within sensible defect dimensions (<= 35% frame area)
                if (merged_w * merged_h) <= (w * h * 0.35):
                    existing["bbox"] = merged_bbox
                    existing["confidence"] = max(existing["confidence"], cand["confidence"])
                    existing["area"] = merged_w * merged_h
            else:
                final_kept.append(cand)
                if len(final_kept) >= 3:  # Keep display clean: max 3 distinct road defects per frame
                    break

        for det in final_kept:
            b = det["bbox"]
            det["normalized_bbox"] = [
                round(b[0] / w, 4),
                round(b[1] / h, 4),
                round(b[2] / w, 4),
                round(b[3] / h, 4)
            ]
            detections.append(det)

        # Calculate dominant category and overall confidence
        if detections:
            primary = max(detections, key=lambda d: d["confidence"])
            detected_category = primary["class_name"]
            confidence = primary["confidence"]
        else:
            # Do not turn an image with no supported road-defect detection into
            # a false Road Damage report. Let the citizen choose another category.
            detected_category = "Other"
            confidence = 0.35

        # Compute physical defect dimensions and road area ratios
        total_defect_area_ratio = 0.0
        max_box_area_ratio = 0.0
        for det in detections:
            bbox = det.get("bbox", [0, 0, 0, 0])
            bw = max(0.0, float(bbox[2]) - float(bbox[0]))
            bh = max(0.0, float(bbox[3]) - float(bbox[1]))
            ratio = (bw * bh) / float(w * h)
            total_defect_area_ratio += ratio
            if ratio > max_box_area_ratio:
                max_box_area_ratio = ratio

        area_pct = round(max_box_area_ratio * 100, 1)
        total_pct = round(total_defect_area_ratio * 100, 1)
        num_defects = len(detections)

        # Multi-factor Severity Classification: LOW, MEDIUM, HIGH
        if detected_category in ["Open Manhole"]:
            suggested_severity = "HIGH"
            severity_reason = (
                f"HIGH: Critical open chamber/manhole detected. Immediate severe fall hazard for pedestrians "
                f"and acute rollover/wheel trap hazard for two-wheelers."
            )
        elif max_box_area_ratio >= 0.08 or total_defect_area_ratio >= 0.12 or (confidence >= 0.75 and max_box_area_ratio >= 0.05):
            suggested_severity = "HIGH"
            severity_reason = (
                f"HIGH: Prominent road cavity occupying {area_pct}% of the image frame "
                f"({total_pct}% total defect area across {num_defects} detection{'s' if num_defects != 1 else ''}). "
                f"Poses immediate suspension/rim damage and two-wheeler skidding risk."
            )
        elif max_box_area_ratio >= 0.025 or total_defect_area_ratio >= 0.04 or confidence >= 0.60:
            suggested_severity = "MEDIUM"
            severity_reason = (
                f"MEDIUM: Moderate road defect covering {area_pct}% of visible road surface. "
                f"Requires vehicular deceleration; risks wheel misalignment and tire sidewall impact at normal speed."
            )
        elif detected_category == "Other":
            suggested_severity = "LOW"
            severity_reason = (
                "LOW: No supported road defect was detected with enough confidence. "
                "Please review the image and choose the correct civic issue category."
            )
        else:
            suggested_severity = "LOW"
            severity_reason = (
                f"LOW: Minor surface defect/crack covering {area_pct}% of road view. "
                f"Asphalt integrity is beginning to weather; traffic flow remains safe but preventive crack sealing is recommended."
            )

        severity_factors = {
            "severity": suggested_severity,
            "defect_area_pct": area_pct,
            "total_area_pct": total_pct,
            "defect_count": num_defects,
            "risk_level": "CRITICAL" if suggested_severity == "HIGH" else "MODERATE" if suggested_severity == "MEDIUM" else "MINOR",
            "hazard_summary": (
                "Wheel trap & two-wheeler fall risk" if suggested_severity == "HIGH"
                else "Vehicle deflection & rim impact risk" if suggested_severity == "MEDIUM"
                else "Surface weathering & early wear"
            ),
            "recommended_action": (
                "Emergency cold-mix pothole patching within 24 hours" if suggested_severity == "HIGH"
                else "Scheduled asphalt leveling repair within 72 hours" if suggested_severity == "MEDIUM"
                else "Routine municipal crack sealing and inspection"
            )
        }

        return {
            "detected_category": detected_category,
            "confidence": confidence,
            "suggested_severity": suggested_severity,
            "severity_reason": severity_reason,
            "severity_factors": severity_factors,
            "blur_score": round(blur_val, 2),
            "is_clear": is_clear,
            "phash": phash,
            "detections": detections,
            "image_dimensions": {"width": w, "height": h}
        }

cv_service = ComputerVisionService()
