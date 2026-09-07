import os
from PIL import Image, ImageDraw

def create_sample_ml_data():
    base_dir = "ml_pipeline/sample_dataset"
    for split in ["train", "val"]:
        os.makedirs(f"{base_dir}/images/{split}", exist_ok=True)
        os.makedirs(f"{base_dir}/labels/{split}", exist_ok=True)

    # Generate 4 train images and 2 val images
    samples = [
        ("train", "sample_pothole_01.jpg", [0.45, 0.55, 0.30, 0.20], 0), # 0 = pothole
        ("train", "sample_damage_02.jpg", [0.50, 0.60, 0.40, 0.25], 1),  # 1 = road_damage
        ("train", "sample_crack_03.jpg", [0.40, 0.50, 0.25, 0.15], 2),   # 2 = road_crack
        ("train", "sample_pothole_04.jpg", [0.60, 0.65, 0.35, 0.22], 0),
        ("val", "sample_pothole_val1.jpg", [0.48, 0.58, 0.32, 0.22], 0),
        ("val", "sample_damage_val2.jpg", [0.52, 0.62, 0.38, 0.24], 1)
    ]

    for split, img_name, bbox, cls_id in samples:
        img_path = f"{base_dir}/images/{split}/{img_name}"
        lbl_path = f"{base_dir}/labels/{split}/{img_name.replace('.jpg', '.txt')}"
        
        # Create image
        img = Image.new("RGB", (640, 640), color=(70, 72, 75))
        draw = ImageDraw.Draw(img)
        # Draw road line
        draw.line([320, 0, 320, 640], fill=(220, 220, 220), width=4)
        # Draw simulated cavity
        cx, cy, bw, bh = int(bbox[0]*640), int(bbox[1]*640), int(bbox[2]*640), int(bbox[3]*640)
        draw.ellipse([cx - bw//2, cy - bh//2, cx + bw//2, cy + bh//2], fill=(30, 30, 30), outline=(15, 15, 15), width=3)
        img.save(img_path)

        # Write label (YOLO format: class_id cx cy w h)
        with open(lbl_path, "w") as f:
            f.write(f"{cls_id} {bbox[0]:.4f} {bbox[1]:.4f} {bbox[2]:.4f} {bbox[3]:.4f}\n")

    # Write data.yaml
    yaml_content = f"""path: {os.path.abspath(base_dir).replace('\\', '/')}
train: images/train
val: images/val
names:
  0: pothole
  1: road_damage
  2: road_crack
"""
    with open(f"{base_dir}/data.yaml", "w") as f:
        f.write(yaml_content)

    print("Sample ML dataset prepared successfully.")

if __name__ == "__main__":
    create_sample_ml_data()
