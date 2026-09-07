import argparse
import os
import shutil
import sys
from pathlib import Path
import numpy as np

# NumPy 2.0 compatibility patch for ultralytics metrics integration
if not hasattr(np, "trapz"):
    np.trapz = getattr(np, "trapezoid", None)
    if np.trapz is None:
        import scipy.integrate
        np.trapz = scipy.integrate.trapezoid

def parse_args():
    parser = argparse.ArgumentParser(description="Bengaluru Civic AI: Road Damage & Pothole Model Training Pipeline")
    parser.add_argument("--data", type=str, default="ml_pipeline/coco_dataset/data.yaml", help="Path to dataset data.yaml")
    parser.add_argument("--epochs", type=int, default=12, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=8, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=416, help="Image resolution")
    parser.add_argument("--weights", type=str, default="yolov8n.pt", help="Pretrained weights")
    parser.add_argument("--project", type=str, default="ml_pipeline/runs", help="Output directory")
    parser.add_argument("--name", type=str, default="pothole_yolov8_run", help="Run name")
    parser.add_argument("--export", action="store_true", default=True, help="Export to ONNX after training")
    return parser.parse_args()

def train():
    args = parse_args()
    print("==================================================================")
    print("   CIVIC AI: ROAD DAMAGE & POTHOLE MODEL TRAINING PIPELINE")
    print("==================================================================")
    print(f"Dataset:    {args.data}")
    print(f"Weights:    {args.weights}")
    print(f"Epochs:     {args.epochs}")
    print(f"Batch Size: {args.batch}")
    print(f"Resolution: {args.imgsz}")

    data_path = Path(args.data).resolve()
    if not data_path.exists():
        print(f"Error: Dataset yaml not found at {args.data}")
        sys.exit(1)

    try:
        from ultralytics import YOLO
    except ImportError:
        print("Error: ultralytics package is required for training.")
        sys.exit(1)

    print("\n[Step 1/4] Initializing base YOLOv8 architecture from pretrained weights...")
    model = YOLO(args.weights)

    print("\n[Step 2/4] Starting training loop with road surface augmentations...")
    results = model.train(
        data=str(data_path),
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        project=args.project,
        name=args.name,
        exist_ok=True,
        verbose=True,
        plots=True,
        workers=2,
        # Augmentation settings to simulate road perspectives, shadows, and motion blur
        mosaic=1.0,
        fliplr=0.5,
        degrees=10.0,
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4
    )

    print("\n[Step 3/4] Evaluating trained model on hold-out validation set...")
    metrics = model.val(data=str(data_path), split="val", imgsz=args.imgsz, verbose=False)
    p = float(metrics.box.p.mean()) if hasattr(metrics.box.p, "mean") else float(metrics.box.p)
    r = float(metrics.box.r.mean()) if hasattr(metrics.box.r, "mean") else float(metrics.box.r)
    map50 = float(metrics.box.map50)
    map50_95 = float(metrics.box.map)

    print("\n" + "=" * 50)
    print("        TRAINING EVALUATION BENCHMARKS")
    print("=" * 50)
    print(f"  Precision (P):       {p:.4f}")
    print(f"  Recall (R):          {r:.4f}")
    print(f"  mAP@50:              {map50:.4f}")
    print(f"  mAP@50-95:           {map50_95:.4f}")
    print("=" * 50)

    # Save best weights to canonical target paths
    best_weights_src = Path(args.project) / args.name / "weights" / "best.pt"
    if best_weights_src.exists():
        # Destination 1: ml_pipeline/weights/pothole_best.pt
        weights_dir = Path("ml_pipeline/weights")
        weights_dir.mkdir(parents=True, exist_ok=True)
        dest1 = weights_dir / "pothole_best.pt"
        shutil.copy(best_weights_src, dest1)
        print(f"\nSaved best weights to: {dest1}")

        # Destination 2: backend/data/yolov8_pothole_best.pt (for backend live inference)
        backend_data = Path("backend/data")
        backend_data.mkdir(parents=True, exist_ok=True)
        dest2 = backend_data / "yolov8_pothole_best.pt"
        shutil.copy(best_weights_src, dest2)
        print(f"Copied weights to backend for live inference: {dest2}")

    if args.export:
        print("\n[Step 4/4] Exporting trained model to ONNX format...")
        try:
            onnx_path = model.export(format="onnx", imgsz=args.imgsz)
            print(f"Exported ONNX model: {onnx_path}")
        except Exception as e:
            print(f"ONNX export note: {e}")

    print("\n[Success] Pothole model trained, verified, and integrated successfully!")

if __name__ == "__main__":
    train()
