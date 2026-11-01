ROI_X1 = 0.15
ROI_Y1 = 0.40
ROI_X2 = 0.85
ROI_Y2 = 0.95
import cv2
import json
from pathlib import Path
from ultralytics import YOLO

# ==========================================
# FLOWAI - SMART TRAFFIC ANALYSIS SYSTEM
# ==========================================

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = BASE_DIR / "yolov8n.pt"
VIDEO_PATH = BASE_DIR / "traffic.mp4"

OUTPUT_DIR = BASE_DIR / "output"
RESULT_DIR = BASE_DIR / "results"

OUTPUT_DIR.mkdir(exist_ok=True)
RESULT_DIR.mkdir(exist_ok=True)

OUTPUT_VIDEO = OUTPUT_DIR / "traffic_detected.mp4"
OUTPUT_JSON = RESULT_DIR / "detections.json"

# ==========================================
# VEHICLE CLASSES
# ==========================================

VEHICLE_CLASSES = {
    1: "Bicycle",
    2: "Car",
    3: "Motorcycle",
    5: "Bus",
    7: "Truck"
}

vehicle_ids = {
    name: set()
    for name in VEHICLE_CLASSES.values()
}

# ==========================================
# TRAFFIC DENSITY SETTINGS
# ==========================================

LOW_LIMIT = 10
MEDIUM_LIMIT = 25

# ==========================================
# QUEUE REGION SETTINGS
# ==========================================

# Coordinates are percentages of the video frame.
# Change these values according to your road video.

ROI_X1 = 0.15
ROI_Y1 = 0.40
ROI_X2 = 0.85
ROI_Y2 = 0.95

# ==========================================
# TRAFFIC DENSITY FUNCTION
# ==========================================

def calculate_density(vehicle_count):

    if vehicle_count <= LOW_LIMIT:
        return "LOW"

    elif vehicle_count <= MEDIUM_LIMIT:
        return "MEDIUM"

    else:
        return "HIGH"


# ==========================================
# TRAFFIC SIGNAL SUGGESTION
# ==========================================

def signal_suggestion(density, queue_count):

    if density == "HIGH" or queue_count >= 15:
        return "Increase GREEN signal time"

    elif density == "MEDIUM" or queue_count >= 7:
        return "Moderately increase GREEN time"

    else:
        return "Normal GREEN signal time"


# ==========================================
# LOAD YOLO MODEL
# ==========================================

print("Loading YOLO model...")

if not MODEL_PATH.exists():
    print("ERROR: yolov8n.pt not found!")
    raise SystemExit

if not VIDEO_PATH.exists():
    print("ERROR: traffic.mp4 not found!")
    raise SystemExit

model = YOLO(str(MODEL_PATH))

print("YOLO model loaded successfully!")

# ==========================================
# OPEN TRAFFIC VIDEO
# ==========================================

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

# ==========================================
# DEFINE QUEUE REGION
# ==========================================

roi_x1 = int(width * ROI_X1)
roi_y1 = int(height * ROI_Y1)
roi_x2 = int(width * ROI_X2)
roi_y2 = int(height * ROI_Y2)

# ==========================================
# CREATE OUTPUT VIDEO
# ==========================================

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

# ==========================================
# INITIALIZE ANALYSIS
# ==========================================

all_detections = []

frame_number = 0

density_summary = {
    "LOW": 0,
    "MEDIUM": 0,
    "HIGH": 0
}

print("\nStarting FlowAI Smart Traffic Analysis...")

# ==========================================
# PROCESS VIDEO FRAME BY FRAME
# ==========================================

while True:

    ret, frame = cap.read()

    if not ret:
        break

    frame_number += 1

    # YOLO vehicle detection and tracking
    results = model.track(
        frame,
        persist=True,
        tracker="bytetrack.yaml",
        classes=list(VEHICLE_CLASSES.keys()),
        conf=0.30,
        verbose=False
    )

    frame_detections = []

    # Current frame counters
    current_counts = {
        name: 0
        for name in VEHICLE_CLASSES.values()
    }

    queue_count = 0

    # ======================================
    # PROCESS DETECTED VEHICLES
    # ======================================

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

            current_counts[vehicle_name] += 1

            # Find center of vehicle bounding box
            center_x = int((x1 + x2) / 2)
            center_y = int((y1 + y2) / 2)

            # ==================================
            # QUEUE ESTIMATION
            # ==================================

            inside_roi = (
                roi_x1 <= center_x <= roi_x2
                and roi_y1 <= center_y <= roi_y2
            )

            if inside_roi:
                queue_count += 1

            # Draw vehicle bounding box
            cv2.rectangle(
                frame,
                (x1, y1),
                (x2, y2),
                (0, 255, 0),
                2
            )

            # Draw vehicle label
            label = vehicle_name

            if track_id is not None:
                label += f" ID:{track_id}"

            label += f" {confidence:.2f}"

            cv2.putText(
                frame,
                label,
                (x1, max(y1 - 10, 20)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (0, 255, 0),
                2
            )

            # Store detection information
            frame_detections.append({

                "vehicle": vehicle_name,

                "confidence": round(
                    confidence, 3
                ),

                "track_id": track_id,

                "bounding_box": [
                    x1, y1, x2, y2
                ],

                "inside_queue_region": inside_roi

            })

    # ======================================
    # TRAFFIC DENSITY CALCULATION
    # ======================================

    total_current_vehicles = sum(
        current_counts.values()
    )

    density = calculate_density(
        total_current_vehicles
    )

    density_summary[density] += 1

    # ======================================
    # SIGNAL SUGGESTION
    # ======================================

    suggestion = signal_suggestion(
        density,
        queue_count
    )

    # ======================================
    # DRAW QUEUE REGION
    # ======================================

    cv2.rectangle(
        frame,
        (roi_x1, roi_y1),
        (roi_x2, roi_y2),
        (255, 0, 255),
        2
    )

    cv2.putText(
        frame,
        "QUEUE ESTIMATION REGION",
        (roi_x1, max(roi_y1 - 10, 20)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 0, 255),
        2
    )

    # ======================================
    # DISPLAY FLOWAI INFORMATION
    # ======================================

    y_position = 30

    information = [
        "FLOWAI SMART TRAFFIC ANALYSIS",

        f"Cars: {current_counts['Car']}",

        f"Motorcycles: {current_counts['Motorcycle']}",

        f"Bicycles: {current_counts['Bicycle']}",

        f"Buses: {current_counts['Bus']}",

        f"Trucks: {current_counts['Truck']}",

        f"Current Vehicles: {total_current_vehicles}",

        f"Traffic Density: {density}",

        f"Queue Count: {queue_count}",

        f"Signal: {suggestion}"
    ]

    for text in information:

        color = (255, 255, 255)

        if "HIGH" in text:
            color = (0, 0, 255)

        elif "MEDIUM" in text:
            color = (0, 255, 255)

        elif "LOW" in text:
            color = (0, 255, 0)

        cv2.putText(
            frame,
            text,
            (10, y_position),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            color,
            2
        )

        y_position += 27

    # ======================================
    # SAVE FRAME
    # ======================================

    writer.write(frame)

    # ======================================
    # STORE FRAME RESULTS
    # ======================================

    all_detections.append({

        "frame": frame_number,

        "timestamp_seconds": round(
            frame_number / fps, 2
        ),

        "vehicle_counts": current_counts,

        "total_vehicles": total_current_vehicles,

        "traffic_density": density,

        "queue_count": queue_count,

        "signal_suggestion": suggestion,

        "detections": frame_detections

    })

    if frame_number % 30 == 0:

        print(
            f"Processed {frame_number}/{total_frames} frames"
        )

# ==========================================
# RELEASE VIDEO RESOURCES
# ==========================================

cap.release()
writer.release()

# ==========================================
# FINAL VEHICLE COUNTS
# ==========================================

final_counts = {

    vehicle: len(ids)

    for vehicle, ids in vehicle_ids.items()

}

bike_count = (
    final_counts["Bicycle"]
    + final_counts["Motorcycle"]
)

total_vehicles = sum(final_counts.values())

# ==========================================
# FINAL TRAFFIC REPORT
# ==========================================

final_results = {

    "project": "FlowAI",

    "total_frames_processed": frame_number,

    "unique_vehicle_counts": final_counts,

    "total_bikes": bike_count,

    "total_unique_vehicles": total_vehicles,

    "density_frame_summary": density_summary,

    "detections": all_detections

}

# ==========================================
# SAVE JSON REPORT
# ==========================================

with open(OUTPUT_JSON, "w") as file:

    json.dump(
        final_results,
        file,
        indent=4
    )

# ==========================================
# DISPLAY FINAL RESULTS
# ==========================================

print("\n======================================")
print("       FLOWAI SMART TRAFFIC REPORT")
print("======================================")

print("Cars:", final_counts["Car"])

print("Motorcycles:", final_counts["Motorcycle"])

print("Bicycles:", final_counts["Bicycle"])

print("Buses:", final_counts["Bus"])

print("Trucks:", final_counts["Truck"])

print("--------------------------------------")

print("Total Unique Vehicles:", total_vehicles)

print("\nTraffic Density Frame Summary:")

print("LOW:", density_summary["LOW"])

print("MEDIUM:", density_summary["MEDIUM"])

print("HIGH:", density_summary["HIGH"])

print("--------------------------------------")

print("Detection completed successfully!")

print("Output Video:", OUTPUT_VIDEO)

print("JSON Results:", OUTPUT_JSON)

print("======================================")

