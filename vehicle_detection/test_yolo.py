from ultralytics import YOLO
from pathlib import Path

print("Checking YOLO model...")

# Get the folder where this Python file is located
folder = Path(__file__).resolve().parent

# Find the model inside the same folder
model_path = folder / "yolov8n.pt"

print("Looking for model at:", model_path)

if model_path.exists():
    model = YOLO(str(model_path))
    print("YOLO model loaded successfully!")
else:
    print("Model file not found!")
    print("Please download yolov8n.pt and place it inside:")
    print(folder)