import cv2
import json
from pathlib import Path
from ultralytics import YOLO

# --------------------------------
# FLOWAI VEHICLE DETECTION SYSTEM
# --------------------------------

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = BASE_DIR / "yolov8n.pt"
VIDEO_PATH = BASE_DIR / "traffic.mp4"

OUTPUT_DIR = BASE_DIR / "output"
RESULT_DIR = BASE_DIR / "results"

OUTPUT_DIR.mkdir(exist_ok=True)
RESULT_DIR.mkdir(exist_ok=True)

OUTPUT_VIDEO = OUTPUT_DIR / "traffic_detected.mp4"
OUTPUT_JSON = RESULT_DIR / "detections.json"

# YOLO COCO vehicle class IDs
VEHICLE_CLASSES = {
    1: "Bicycle",
    2: "Car",
    3: "Motorcycle",
    5: "Bus",
    7: "Truck"
}

# Initialize counts for every category
vehicle_ids = {
    name: set()
    for name in VEHICLE_CLASSES.values()
}

# Load YOLO model
print("Loading YOLO model...")

model = YOLO(str(MODEL_PATH))

print("YOLO model loaded successfully!")

# Open traffic video
cap = cv2.VideoCapture(str(VIDEO_PATH))

if not cap.isOpened():
    print("ERROR: Cannot open traffic.mp4")
    raise SystemExit

fps = cap.get(cv2.CAP_PROP_FPS)
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

if fps <= 0:
    fps = 25

# Create output video
fourcc = cv2.VideoWriter_fourcc(*"mp4v")

writer = cv2.VideoWriter(
    str(OUTPUT_VIDEO),
    fourcc,
    fps,
    (width, height)
)

if not writer.isOpened():
    print("ERROR: Cannot create output video")
    cap.release()
    raise SystemExit

all_detections = []
frame_number = 0

print("Starting FlowAI vehicle detection...")

# --------------------------------
# PROCESS VIDEO FRAME BY FRAME
# --------------------------------

while True:

    ret, frame = cap.read()

    if not ret:
        break

    frame_number += 1

    results = model.track(
        frame,
        persist=True,
        tracker="bytetrack.yaml",
        classes=list(VEHICLE_CLASSES.keys()),
        conf=0.30,
        verbose=False
    )

    frame_detections = []

    for result in results:

        if result.boxes is None:
            continue

        for box in result.boxes:

            class_id = int(box.cls[0])
            confidence = float(box.conf[0])

            vehicle_name = VEHICLE_CLASSES[class_id]

            x1, y1, x2, y2 = map(
                int,
                box.xyxy[0].tolist()
            )

            track_id = None

            if box.id is not None:
                track_id = int(box.id[0])

                vehicle_ids[vehicle_name].add(track_id)

            # Draw bounding box
            cv2.rectangle(
                frame,
                (x1, y1),
                (x2, y2),
                (0, 255, 0),
                2
            )

            # Vehicle label
            label = vehicle_name

            if track_id is not None:
                label += f" ID:{track_id}"

            label += f" {confidence:.2f}"

            cv2.putText(
                frame,
                label,
                (x1, max(y1 - 10, 20)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 0),
                2
            )

            frame_detections.append({
                "vehicle": vehicle_name,
                "confidence": round(confidence, 3),
                "track_id": track_id,
                "bounding_box": [x1, y1, x2, y2]
            })

    # --------------------------------
    # DISPLAY LIVE VEHICLE COUNTS
    # --------------------------------

    y_position = 30

    cv2.putText(
        frame,
        "FLOWAI VEHICLE DETECTION",
        (10, y_position),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 255),
        2
    )

    y_position += 35

    for vehicle, ids in vehicle_ids.items():

        text = f"{vehicle}: {len(ids)}"

        cv2.putText(
            frame,
            text,
            (10, y_position),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 255),
            2
        )

        y_position += 30

    # Save processed frame
    writer.write(frame)

    # Store JSON results
    all_detections.append({
        "frame": frame_number,
        "timestamp_seconds": round(frame_number / fps, 2),
        "detections": frame_detections
    })

    if frame_number % 30 == 0:
        print(
            f"Processed {frame_number}/{total_frames} frames"
        )

# --------------------------------
# RELEASE VIDEO RESOURCES
# --------------------------------

cap.release()
writer.release()

# --------------------------------
# FINAL VEHICLE COUNTS
# --------------------------------

final_counts = {
    vehicle: len(ids)
    for vehicle, ids in vehicle_ids.items()
}

# Combined two-wheeler count
bike_count = (
    final_counts["Bicycle"]
    + final_counts["Motorcycle"]
)

final_results = {
    "project": "FlowAI",
    "total_frames_processed": frame_number,
    "vehicle_counts": final_counts,
    "total_bikes": bike_count,
    "total_vehicles": sum(final_counts.values()),
    "detections": all_detections
}

# Save JSON
with open(OUTPUT_JSON, "w") as file:
    json.dump(final_results, file, indent=4)

# --------------------------------
# DISPLAY FINAL RESULTS
# --------------------------------

print("\n================================")
print("       FLOWAI RESULTS")
print("================================")

print("Cars:", final_counts["Car"])
print("Motorcycles:", final_counts["Motorcycle"])
print("Bicycles:", final_counts["Bicycle"])
print("Total Bikes:", bike_count)
print("Buses:", final_counts["Bus"])
print("Trucks:", final_counts["Truck"])

print("--------------------------------")
print("Total Vehicles:", final_results["total_vehicles"])

print("\nDetection completed successfully!")

print("Output Video:", OUTPUT_VIDEO)
print("JSON Results:", OUTPUT_JSON)