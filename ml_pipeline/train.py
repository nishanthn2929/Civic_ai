import argparse
import os
import sys
from pathlib import Path

def parse_args():
    parser = argparse.ArgumentParser(description="Bengaluru Civic AI: Road Damage & Pothole Model Training Pipeline")
    parser.add_argument("--data", type=str, default="ml_pipeline/sample_dataset/data.yaml", help="Path to dataset data.yaml")
    parser.add_argument("--epochs", type=int, default=3, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=2, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=640, help="Image resolution")
    parser.add_argument("--weights", type=str, default="yolov8n.pt", help="Pretrained weights")
    parser.add_argument("--project", type=str, default="ml_pipeline/runs", help="Output directory")
    parser.add_argument("--name", type=str, default="pothole_model", help="Run name")
    parser.add_argument("--export", action="store_true", help="Export to ONNX after training")
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

    data_path = Path(args.data)
    if not data_path.exists():
        print(f"Error: Dataset yaml not found at {args.data}")
        sys.exit(1)

    try:
        from ultralytics import YOLO
    except ImportError:
        print("Error: ultralytics package is required for training.")
        sys.exit(1)

    print("\n[Step 1/4] Initializing base YOLO model architecture...")
    model = YOLO(args.weights)

    print("\n[Step 2/4] Starting training loop with data augmentations...")
    results = model.train(
        data=str(data_path),
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        project=args.project,
        name=args.name,
        exist_ok=True,
        verbose=True,
        plots=True
    )

    print("\n[Step 3/4] Evaluating trained model on validation split...")
    metrics = model.val()
    print(f"Validation mAP@50:    {metrics.box.map50:.4f}")
    print(f"Validation mAP@50-95: {metrics.box.map:.4f}")
    print(f"Validation Precision: {metrics.box.p.mean():.4f}")
    print(f"Validation Recall:    {metrics.box.r.mean():.4f}")

    if args.export:
        print("\n[Step 4/4] Exporting model to ONNX format...")
        model.export(format="onnx")

    print("\n[Success] Training pipeline completed successfully.")
    print(f"Artifacts saved to: {args.project}/{args.name}")

if __name__ == "__main__":
    train()
