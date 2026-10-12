"""
Ultralytics YOLO Training Pipeline for Road Pothole Detection
Dataset: Kaggle-format Pothole Detection Dataset (data.yaml with train/val/test splits)
"""

import argparse
import os
import shutil
import sys
from pathlib import Path
import numpy as np

# NumPy 2.0+ compatibility patch for ultralytics metrics
if not hasattr(np, "trapz"):
    np.trapz = getattr(np, "trapezoid", None)
    if np.trapz is None:
        import scipy.integrate
        np.trapz = scipy.integrate.trapezoid


def parse_args():
    parser = argparse.ArgumentParser(description="Train YOLO model on Kaggle-format road pothole dataset")
    parser.add_argument(
        "--data",
        type=str,
        default="ml_pipeline/unified_potholes/data.yaml",
        help="Path to dataset data.yaml (Kaggle/YOLO format)"
    )
    parser.add_argument("--weights", type=str, default="yolov8n.pt", help="Pretrained YOLO base weights")
    parser.add_argument("--epochs", type=int, default=60, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=640, help="Image resolution")
    parser.add_argument("--patience", type=int, default=15, help="Early stopping patience")
    parser.add_argument("--project", type=str, default="ml_pipeline/runs", help="Output directory")
    parser.add_argument("--name", type=str, default="yolov8_pothole_run", help="Run name")
    return parser.parse_args()


def train_yolo():
    args = parse_args()
    print("=" * 68)
    print("   CIVIC AI: YOLO ROAD POTHOLE DETECTION TRAINING PIPELINE")
    print("=" * 68)
    print(f"Dataset YAML: {args.data}")
    print(f"Base Weights: {args.weights}")
    print(f"Epochs:       {args.epochs}")
    print(f"Batch Size:   {args.batch}")
    print(f"Resolution:   {args.imgsz}")

    data_path = Path(args.data).resolve()
    if not data_path.exists():
        fallbacks = [
            Path("ml_pipeline/coco_dataset/data.yaml").resolve(),
            Path("ml_pipeline/dataset/data.yaml").resolve(),
        ]
        found = False
        for fb in fallbacks:
            if fb.exists():
                print(f"[Notice] Dataset not found at {args.data}, falling back to: {fb}")
                data_path = fb
                found = True
                break
        if not found:
            print(f"[Error] No valid dataset data.yaml found at {args.data}")
            sys.exit(1)

    try:
        import yaml
        dataset_config = yaml.safe_load(data_path.read_text(encoding="utf-8")) or {}
        names = dataset_config.get("names", [])
        if isinstance(names, dict):
            names = list(names.values())
        normalized_names = [str(name).strip().lower() for name in names]
        if normalized_names != ["pothole"]:
            print(f"[Error] Refusing non-pothole dataset classes: {names}")
            sys.exit(1)
    except ImportError:
        print("[Error] PyYAML is required to validate the dataset classes.")
        sys.exit(1)

    try:
        from ultralytics import YOLO
    except ImportError:
        print("[Error] ultralytics package is required for YOLO training.")
        sys.exit(1)

    print("\n[Step 1/4] Initializing YOLO architecture for POTHOLE ONLY detection...")
    model = YOLO(args.weights)

    print("\n[Step 2/4] Starting training loop on the verified pothole-only dataset...")
    results = model.train(
        data=str(data_path),
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        project=args.project,
        name=args.name,
        patience=args.patience,
        exist_ok=True,
        verbose=True,
        plots=True,
        workers=0,
        lr0=0.01,
        lrf=0.01,
        warmup_epochs=1,
        close_mosaic=10,
        cos_lr=True,
        mosaic=0.5,
        fliplr=0.5,
        degrees=5.0
    )

    print("\n[Step 3/4] Evaluating fine-tuned model against validation split...")
    metrics = model.val(data=str(data_path), split="val", imgsz=args.imgsz, verbose=False)

    def _to_float(val):
        if hasattr(val, "mean"):
            return float(val.mean())
        if isinstance(val, (list, tuple, np.ndarray)):
            return float(np.mean(val)) if len(val) > 0 else 0.0
        return float(val) if val is not None else 0.0

    p = _to_float(metrics.box.p)
    r = _to_float(metrics.box.r)
    map50 = float(metrics.box.map50)
    map50_95 = float(metrics.box.map)

    print("\n" + "=" * 55)
    print("       YOLO POTHOLE MODEL EVALUATION SUMMARY")
    print("=" * 55)
    print(f"  Precision (P):       {p:.4f}")
    print(f"  Recall (R):          {r:.4f}")
    print(f"  mAP@50:              {map50:.4f}")
    print(f"  mAP@50-95:           {map50_95:.4f}")
    print("=" * 55)

    print("\n[Step 4/4] Deploying trained weights to runtime directories...")
    # Locate best.pt
    candidate_best = [
        Path(args.project) / args.name / "weights" / "best.pt",
        Path("runs/detect") / args.project / args.name / "weights" / "best.pt",
        Path(f"runs/detect/{args.name}/weights/best.pt")
    ]
    best_weights_path = None
    for cand in candidate_best:
        if cand.exists():
            best_weights_path = cand
            break

    if best_weights_path and best_weights_path.exists():
        pipeline_target = Path("ml_pipeline/weights/yolov8_pothole_best.pt")
        backend_target = Path("backend/data/yolov8_pothole_best.pt")

        pipeline_target.parent.mkdir(parents=True, exist_ok=True)
        backend_target.parent.mkdir(parents=True, exist_ok=True)

        shutil.copy(best_weights_path, pipeline_target)
        shutil.copy(best_weights_path, backend_target)

        print(f"  -> Saved weights to: {pipeline_target}")
        print(f"  -> Deployed weights to backend: {backend_target}")
        print("[SUCCESS] YOLO pothole detection model training and deployment complete!")
    else:
        print(f"[Warning] Best weights file not found in expected run directory: {candidate_best[0]}")


if __name__ == "__main__":
    train_yolo()
