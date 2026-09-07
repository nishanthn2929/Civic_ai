import argparse
import time
import sys
from pathlib import Path

def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate Road Defect & Pothole Detection Model")
    parser.add_argument("--weights", type=str, default="yolov8n.pt", help="Trained model weights")
    parser.add_argument("--data", type=str, default="ml_pipeline/sample_dataset/data.yaml", help="Path to data.yaml")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    parser.add_argument("--iou", type=float, default=0.50, help="NMS IoU threshold")
    return parser.parse_args()

def evaluate():
    args = parse_args()
    print("==================================================================")
    print("        CIVIC AI: COMPUTER VISION MODEL EVALUATION REPORT")
    print("==================================================================")
    
    try:
        from ultralytics import YOLO
    except ImportError:
        print("Error: ultralytics package is required.")
        sys.exit(1)

    model = YOLO(args.weights)
    print(f"Loaded Weights: {args.weights}")
    print(f"Testing Dataset: {args.data}")
    print(f"Confidence Threshold: {args.conf}")
    print(f"IoU Threshold: {args.iou}")

    print("\n--- Running Validation Benchmark ---")
    metrics = model.val(data=args.data, conf=args.conf, iou=args.iou, verbose=False)

    # Benchmark FPS speed
    print("\n--- Measuring Inference Latency & FPS ---")
    t0 = time.time()
    for _ in range(10):
        _ = model("ml_pipeline/sample_dataset/images/val/sample_pothole_val1.jpg", verbose=False)
    elapsed = time.time() - t0
    avg_latency_ms = (elapsed / 10.0) * 1000.0
    fps = 1000.0 / avg_latency_ms

    print("\n---------------- EVALUATION SUMMARY ----------------")
    print(f"Precision:            {metrics.box.p.mean():.4f}")
    print(f"Recall:               {metrics.box.r.mean():.4f}")
    print(f"mAP@50:               {metrics.box.map50:.4f}")
    print(f"mAP@50-95:            {metrics.box.map:.4f}")
    print(f"Average Latency:      {avg_latency_ms:.1f} ms")
    print(f"Inference Speed:      {fps:.1f} FPS (Target: >=15 FPS)")
    print("----------------------------------------------------\n")

if __name__ == "__main__":
    evaluate()
