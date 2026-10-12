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
    parser = argparse.ArgumentParser(description="Bengaluru Civic AI: RT-DETR multiclass civic issue training pipeline")
    parser.add_argument("--data", type=str, default="ml_pipeline/coco_dataset/data.yaml", help="Path to dataset data.yaml")
    parser.add_argument("--epochs", type=int, default=12, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=8, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=416, help="Image resolution")
    parser.add_argument("--weights", type=str, default="rtdetr-l.pt", help="RT-DETR pretrained weights")
    parser.add_argument("--project", type=str, default="ml_pipeline/runs", help="Output directory")
    parser.add_argument("--name", type=str, default="civic_multiclass_rtdetr_run", help="Run name")
    parser.add_argument("--export", action="store_true", default=True, help="Export to ONNX after training")
    return parser.parse_args()

def train():
    args = parse_args()
    print("==================================================================")
    print("   CIVIC AI: RT-DETR MULTICLASS CIVIC ISSUE TRAINING PIPELINE")
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

    required_categories = {
        "pothole",
        "road_damage",
        "road_crack",
        "garbage_overflow",
        "water_leakage",
        "broken_streetlight",
    }
    try:
        import yaml
        with data_path.open("r", encoding="utf-8") as data_file:
            dataset_config = yaml.safe_load(data_file) or {}
        class_names = {str(name).lower().replace(" ", "_") for name in dataset_config.get("names", {}).values()}
        missing_categories = required_categories - class_names
        if missing_categories:
            print(
                "Error: multiclass training requires labeled classes: "
                + ", ".join(sorted(missing_categories))
            )
            print("Add matching images and YOLO labels before starting training.")
            sys.exit(1)
    except ImportError:
        print("Error: PyYAML is required to validate dataset classes.")
        sys.exit(1)

    try:
        from ultralytics import RTDETR
    except ImportError:
        print("Error: ultralytics package is required for training.")
        sys.exit(1)

    print("\n[Step 1/4] Initializing RT-DETR architecture from pretrained weights...")
    model = RTDETR(args.weights)

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
        # Destination 1: canonical multiclass weights for backend inference.
        weights_dir = Path("ml_pipeline/weights")
        weights_dir.mkdir(parents=True, exist_ok=True)
        dest1 = weights_dir / "civic_multiclass_rtdetr_best.pt"
        shutil.copy(best_weights_src, dest1)
        print(f"\nSaved best weights to: {dest1}")

        # Destination 2: backend/data/rtdetr_pothole_best.pt (for backend live inference)
        backend_data = Path("backend/data")
        backend_data.mkdir(parents=True, exist_ok=True)
        dest2 = backend_data / "civic_multiclass_rtdetr_best.pt"
        shutil.copy(best_weights_src, dest2)
        print(f"Copied weights to backend for live inference: {dest2}")

    if args.export:
        print("\n[Step 4/4] Exporting trained model to ONNX format...")
        try:
            onnx_path = model.export(format="onnx", imgsz=args.imgsz)
            print(f"Exported ONNX model: {onnx_path}")
        except Exception as e:
            print(f"ONNX export note: {e}")

    print("\n[Success] RT-DETR multiclass civic issue model trained and integrated successfully!")

if __name__ == "__main__":
    train()
