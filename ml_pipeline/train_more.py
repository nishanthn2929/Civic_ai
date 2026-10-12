import sys
import shutil
from pathlib import Path
import numpy as np

# Ensure NumPy 2.0+ compatibility with Ultralytics trapz
if not hasattr(np, "trapz"):
    np.trapz = getattr(np, "trapezoid", None)
    if np.trapz is None:
        import scipy.integrate
        np.trapz = scipy.integrate.trapezoid

from ultralytics import RTDETR

def train_more(epochs=6, batch=4, imgsz=384):
    print("=" * 65)
    print("   CIVIC AI: FINE-TUNING ROAD DEFECT & POTHOLE RT-DETR MODEL")
    print("=" * 65)
    
    weights_path = Path("ml_pipeline/weights/rtdetr_pothole_best.pt")
    if not weights_path.exists():
        weights_path = Path("backend/data/rtdetr_pothole_best.pt")
    
    data_yaml = Path("ml_pipeline/coco_dataset/data.yaml").resolve()
    
    print(f"Base Weights:       {weights_path}")
    print(f"Dataset YAML:       {data_yaml}")
    print(f"Additional Epochs:  {epochs}")
    print(f"Batch Size:         {batch}")
    print(f"Resolution:         {imgsz}")
    
    # 1. Load existing trained model
    print("\n[Step 1/3] Loading checkpoint weights into RT-DETR architecture...")
    model = RTDETR(str(weights_path))
    
    # 2. Train for additional epochs with gentle fine-tuning LR
    print("\n[Step 2/3] Executing fine-tuning loop on road surface dataset...")
    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        batch=batch,
        imgsz=imgsz,
        project="ml_pipeline/runs",
        name="pothole_rtdetr_finetuned",
        exist_ok=True,
        verbose=True,
        plots=True,
        workers=2,
        lr0=0.0003,       # Gentle fine-tuning starting learning rate
        lrf=0.01,
        warmup_epochs=1,
        mosaic=0.5,
        fliplr=0.5,
        degrees=6.0,
        hsv_v=0.3
    )
    
    # 3. Validation & Evaluation
    print("\n[Step 3/3] Evaluating fine-tuned model against validation set...")
    metrics = model.val(data=str(data_yaml), split="val", imgsz=imgsz, verbose=False)
    
    p = float(metrics.box.p.mean()) if hasattr(metrics.box.p, "mean") else float(metrics.box.p)
    r = float(metrics.box.r.mean()) if hasattr(metrics.box.r, "mean") else float(metrics.box.r)
    map50 = float(metrics.box.map50)
    map50_95 = float(metrics.box.map)
    
    print("\n" + "=" * 55)
    print("       FINE-TUNING EVALUATION BENCHMARKS")
    print("=" * 55)
    print(f"  Precision (P):       {p:.4f}")
    print(f"  Recall (R):          {r:.4f}")
    print(f"  mAP@50:              {map50:.4f}")
    print(f"  mAP@50-95:           {map50_95:.4f}")
    print("=" * 55)
    
    # Deploy updated weights
    run_best = Path("runs/detect/ml_pipeline/runs/pothole_rtdetr_finetuned/weights/best.pt")
    if not run_best.exists():
        run_best = Path("ml_pipeline/runs/pothole_rtdetr_finetuned/weights/best.pt")
    if run_best.exists():
        # Backup old weights
        backup_path = Path("ml_pipeline/weights/rtdetr_pothole_best_backup.pt")
        if weights_path.exists():
            shutil.copy(weights_path, backup_path)
            print(f"\nCreated safety backup of previous model: {backup_path}")
        
        # Copy to canonical weights locations
        target1 = Path("ml_pipeline/weights/rtdetr_pothole_best.pt")
        target2 = Path("backend/data/rtdetr_pothole_best.pt")
        shutil.copy(run_best, target1)
        shutil.copy(run_best, target2)
        print(f"Updated active pipeline weights: {target1}")
        print(f"Updated backend runtime weights: {target2}")
        print("\n[SUCCESS] Model successfully fine-tuned and deployed for live inference!")
    else:
        print("\nNote: Best weights file not found in run directory.")

if __name__ == "__main__":
    epochs = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    train_more(epochs=epochs, batch=4, imgsz=384)
