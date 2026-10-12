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
        self._init_model()

    def _init_model(self):
        """Initialize the road-defect detector using the best available trained model."""
        try:
            from ultralytics import YOLO, RTDETR
            data_yolo = Path(settings.DATA_DIR) / "yolov8_pothole_best.pt"
            pipeline_yolo = Path(__file__).resolve().parent.parent.parent.parent / "ml_pipeline" / "weights" / "yolov8_pothole_best.pt"
            data_multiclass = Path(settings.DATA_DIR) / "civic_multiclass_rtdetr_best.pt"
            pipeline_multiclass = Path(__file__).resolve().parent.parent.parent.parent / "ml_pipeline" / "weights" / "civic_multiclass_rtdetr_best.pt"
            data_pothole = Path(settings.DATA_DIR) / "rtdetr_pothole_best.pt"
            pipeline_pothole = Path(__file__).resolve().parent.parent.parent.parent / "ml_pipeline" / "weights" / "rtdetr_pothole_best.pt"

            if data_yolo.exists():
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
                            bw = x2 - x1
                            bh = y2 - y1

                            # Road ROI constraint: Potholes exist on the road surface
                            # Exclude boxes entirely in sky / horizon (y1 < h * 0.14)
                            if y1 < (h * 0.14) and y2 < (h * 0.22):
                                continue
                            if bw < 18 or bh < 15 or (bw * bh) > (w * h * 0.75):
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

                            candidate_boxes.append({
                                "class_name": mapped_category,
                                "confidence": round(conf, 3),
                                "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                                "area": bw * bh
                            })
            except Exception as e:
                print(f"[Inference Error] Model inference warning: {e}")

        # 2. Heuristic cavity & texture fallback if neural detector found no boxes in the road frame
        if len(candidate_boxes) == 0:
            try:
                hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
                road_mask = np.zeros((h, w), dtype=np.uint8)
                road_mask[int(h * 0.14):, :] = 255

                puddle_mask = ((hsv[:,:,0] >= 10) & (hsv[:,:,0] <= 36) & 
                               (hsv[:,:,1] >= 12) & (hsv[:,:,1] <= 65) & 
                               (hsv[:,:,2] >= 90) & (hsv[:,:,2] <= 195)).astype(np.uint8) * 255
                puddle_mask = cv2.bitwise_and(puddle_mask, road_mask)
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
                closed = cv2.morphologyEx(puddle_mask, cv2.MORPH_CLOSE, kernel)
                contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

                for cnt in contours:
                    area = cv2.contourArea(cnt)
                    if area > (w * h * 0.008):
                        x, y, cw, ch = cv2.boundingRect(cnt)
                        ratio = cw / max(1, ch)
                        if 0.4 <= ratio <= 3.2 and cw < (w * 0.85) and ch < (h * 0.85):
                            pad = int(min(cw, ch) * 0.14)
                            x1 = max(0.0, float(x - pad))
                            y1 = max(float(h * 0.14), float(y - pad))
                            x2 = min(float(w), float(x + cw + pad))
                            y2 = min(float(h), float(y + ch + pad))
                            calc_conf = min(0.95, max(0.72, 0.75 + (area / (w * h) * 1.5)))
                            candidate_boxes.append({
                                "class_name": "Pothole",
                                "confidence": round(calc_conf, 3),
                                "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                                "area": (x2 - x1) * (y2 - y1)
                            })
            except Exception as e:
                print(f"[Cavity Detector Notice] {e}")

            # 3. CLAHE Contour Texture Fallback if still empty and model is None
            if len(candidate_boxes) == 0:
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                roi_y_start = int(h * 0.20)
                road_roi = gray[roi_y_start:h, :]
                clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
                enhanced_roi = clahe.apply(road_roi)
                blurred = cv2.GaussianBlur(enhanced_roi, (5, 5), 0)
                thresh_dark = cv2.adaptiveThreshold(
                    blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 7
                )
                edges = cv2.Canny(blurred, 25, 80)
                combined_mask = cv2.bitwise_or(thresh_dark, edges)
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
                closed = cv2.morphologyEx(combined_mask, cv2.MORPH_CLOSE, kernel)
                contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                min_area = max(180, int(w * h * 0.002))
                max_area = int(w * h * 0.50)
                for cnt in contours:
                    area = cv2.contourArea(cnt)
                    if min_area < area < max_area:
                        x, y, cw, ch = cv2.boundingRect(cnt)
                        aspect_ratio = float(cw) / max(ch, 1)
                        if 0.30 < aspect_ratio < 4.5:
                            real_y = y + roi_y_start
                            area_ratio = area / (w * h)
                            calc_conf = min(0.95, max(0.65, 0.70 + (area_ratio * 1.5)))
                            candidate_boxes.append({
                                "class_name": "Pothole",
                                "confidence": round(calc_conf, 3),
                                "bbox": [float(x), float(real_y), float(x + cw), float(real_y + ch)],
                                "area": area
                            })

        # 4. Sort and apply NMS deduplication to guarantee tight, non-overlapping bounding boxes
        candidate_boxes.sort(key=lambda item: item["confidence"], reverse=True)
        final_kept = []
        for cand in candidate_boxes:
            b1 = cand["bbox"]
            overlap = False
            for kept in final_kept:
                b2 = kept["bbox"]
                ix1 = max(b1[0], b2[0])
                iy1 = max(b1[1], b2[1])
                ix2 = min(b1[2], b2[2])
                iy2 = min(b1[3], b2[3])
                iw = max(0.0, ix2 - ix1)
                ih = max(0.0, iy2 - iy1)
                inter = iw * ih
                union = (b1[2]-b1[0])*(b1[3]-b1[1]) + (b2[2]-b2[0])*(b2[3]-b2[1]) - inter
                iou = inter / max(1e-6, union)
                if iou > 0.25:
                    overlap = True
                    break
            if not overlap:
                final_kept.append(cand)
                if len(final_kept) >= 6:
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
