import os
import shutil
from pathlib import Path
from huggingface_hub import snapshot_download

def download_and_prepare_dataset():
    print("==================================================================")
    print("      DOWNLOADING REAL ROAD POTHOLE DETECTION DATASET")
    print("==================================================================")
    target_dir = Path("ml_pipeline/dataset").resolve()
    target_dir.mkdir(parents=True, exist_ok=True)

    repo_id = "Ryukijano/Pothole-detection-Yolov8"
    print(f"Downloading repository: {repo_id} via huggingface_hub...")
    
    downloaded_path = snapshot_download(
        repo_id=repo_id,
        repo_type="dataset",
        local_dir=str(target_dir),
        ignore_patterns=["*.git*", "*.md", "*.txt"]
    )
    print(f"Download completed to: {downloaded_path}")

    # Inspect splits
    train_imgs = list((target_dir / "train" / "images").glob("*.*"))
    val_imgs = list((target_dir / "valid" / "images").glob("*.*"))
    test_imgs = list((target_dir / "test" / "images").glob("*.*"))

    print(f"Verified dataset splits:")
    print(f"  -> Train Images: {len(train_imgs)}")
    print(f"  -> Valid Images: {len(val_imgs)}")
    print(f"  -> Test Images:  {len(test_imgs)}")

    # Generate normalized data.yaml with absolute paths and clear class naming
    yaml_content = f"""path: {str(target_dir).replace('\\', '/')}
train: train/images
val: valid/images
test: test/images

nc: 1
names:
  0: pothole
"""
    yaml_path = target_dir / "data.yaml"
    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write(yaml_content)

    print(f"Generated clean data.yaml at: {yaml_path}")
    print("Dataset preparation ready for RT-DETR training!")

if __name__ == "__main__":
    download_and_prepare_dataset()
