
import io
import json
import os
import shutil
import urllib.request
import zipfile
from pathlib import Path

def prepare_real_dataset():
    print("==================================================================")
    print("   FETCHING AND CONVERTING REAL COCO ROAD POTHOLE DATASET")
    print("==================================================================")
    base_dir = Path("ml_pipeline/coco_dataset").resolve()
    base_dir.mkdir(parents=True, exist_ok=True)

    splits = {
        "train": "https://huggingface.co/datasets/keremberke/pothole-segmentation/resolve/main/data/train.zip",
        "val": "https://huggingface.co/datasets/keremberke/pothole-segmentation/resolve/main/data/valid.zip",
        "test": "https://huggingface.co/datasets/keremberke/pothole-segmentation/resolve/main/data/test.zip"
    }

    for split, url in splits.items():
        print(f"\n[Split: {split}] Downloading from Hugging Face: {url}...")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as resp:
            zip_bytes = resp.read()
        
        z = zipfile.ZipFile(io.BytesIO(zip_bytes))
        
        # Read COCO annotations JSON
        coco_json_bytes = z.read("_annotations.coco.json")
        coco_data = json.loads(coco_json_bytes)

        images_dir = base_dir / split / "images"
        labels_dir = base_dir / split / "labels"
        images_dir.mkdir(parents=True, exist_ok=True)
        labels_dir.mkdir(parents=True, exist_ok=True)

        # Build image lookup: id -> info
        images_map = {img["id"]: img for img in coco_data["images"]}
        
        # Group annotations by image_id
        annotations_by_img = {}
        for ann in coco_data["annotations"]:
            img_id = ann["image_id"]
            annotations_by_img.setdefault(img_id, []).append(ann)

        extracted_images = 0
        extracted_labels = 0

        for img_id, img_info in images_map.items():
            file_name = img_info["file_name"]
            img_width = float(img_info["width"])
            img_height = float(img_info["height"])

            # Extract image file
            try:
                img_data = z.read(file_name)
                with open(images_dir / file_name, "wb") as f:
                    f.write(img_data)
                extracted_images += 1
            except KeyError:
                continue

            # Generate Ultralytics detector label text file (.txt)
            label_filename = Path(file_name).stem + ".txt"
            label_path = labels_dir / label_filename

            yolo_lines = []
            if img_id in annotations_by_img:
                for ann in annotations_by_img[img_id]:
                    # COCO bbox: [x_min, y_min, width, height]
                    bx, by, bw, bh = ann["bbox"]
                    
                    # Convert to normalized detector format: [x_center, y_center, w, h]
                    x_center = (bx + (bw / 2.0)) / img_width
                    y_center = (by + (bh / 2.0)) / img_height
                    norm_w = bw / img_width
                    norm_h = bh / img_height

                    # Clip to valid [0.0, 1.0] range
                    x_center = max(0.001, min(0.999, x_center))
                    y_center = max(0.001, min(0.999, y_center))
                    norm_w = max(0.001, min(0.999, norm_w))
                    norm_h = max(0.001, min(0.999, norm_h))

                    yolo_lines.append(f"0 {x_center:.6f} {y_center:.6f} {norm_w:.6f} {norm_h:.6f}")

            with open(label_path, "w", encoding="utf-8") as f:
                f.write("\n".join(yolo_lines) + "\n" if yolo_lines else "")
            
            if yolo_lines:
                extracted_labels += 1

        print(f"  -> Extracted {extracted_images} images, {extracted_labels} images with pothole bounding boxes.")

    # Write clean data.yaml
    yaml_content = f"""path: {str(base_dir).replace('\\', '/')}
train: train/images
val: val/images
test: test/images

nc: 1
names:
  0: pothole
"""
    with open(base_dir / "data.yaml", "w", encoding="utf-8") as f:
        f.write(yaml_content)

    print(f"\n[Complete] Verified RT-DETR road pothole dataset created at: {base_dir}")
    print("data.yaml successfully configured.")

if __name__ == "__main__":
    prepare_real_dataset()
