import cv2
import json
import math
import time
from collections import defaultdict, deque
from pathlib import Path
from ultralytics import YOLO
from adaptive_signal_controller import AdaptiveSignalController

# ==========================================
# FLOWAI - MULTI-DIRECTION TRAFFIC ANALYSIS
# ==========================================

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = BASE_DIR / "yolov8n.pt"
VIDEO_PATH = BASE_DIR / "traffic2.mp4"

OUTPUT_DIR = BASE_DIR / "output"
RESULT_DIR = BASE_DIR / "results"

OUTPUT_DIR.mkdir(exist_ok=True)
RESULT_DIR.mkdir(exist_ok=True)

OUTPUT_VIDEO = OUTPUT_DIR / "traffic2_detected.mp4"
OUTPUT_JSON = RESULT_DIR / "traffic2_detections.json"


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


# ==========================================
# TRAFFIC SETTINGS
# ==========================================

LOW_LIMIT = 10
MEDIUM_LIMIT = 25

MIN_MOVEMENT = 12
HISTORY_LENGTH = 12


# ==========================================
# FOUR APPROACH STREAMS
# ==========================================

STREAMS = [
    "NORTH",
    "SOUTH",
    "EAST",
    "WEST"
]

stream_vehicle_ids = {
    stream: set()
    for stream in STREAMS
}

DIRECTIONS = [
    "N", "NE", "E", "SE",
    "S", "SW", "W", "NW",
    "UNKNOWN"
]

movement_vehicle_ids = {
    direction: set()
    for direction in DIRECTIONS
}


# ==========================================
# TRACKING MEMORY
# ==========================================

track_history = defaultdict(
    lambda: deque(maxlen=HISTORY_LENGTH)
)

track_stream = {}
track_movement = {}

vehicle_ids = {
    name: set()
    for name in VEHICLE_CLASSES.values()
}


# ==========================================
# DENSITY CALCULATION
# ==========================================

def calculate_density(count):

    if count <= LOW_LIMIT:
        return "LOW"

    elif count <= MEDIUM_LIMIT:
        return "MEDIUM"

    return "HIGH"


# ==========================================
# SIGNAL RECOMMENDATION
# ==========================================

def signal_suggestion(density, queue_count):

    if density == "HIGH" or queue_count >= 15:
        return "HIGH PRIORITY - More green time"

    elif density == "MEDIUM" or queue_count >= 7:
        return "MEDIUM PRIORITY - Moderate green time"

    return "LOW PRIORITY - Normal green time"


# ==========================================
# APPROACH STREAM CLASSIFICATION
# ==========================================

def classify_stream(x, y, width, height):

    center_x = width / 2
    center_y = height / 2

    dx = x - center_x
    dy = y - center_y

    if abs(dx) > abs(dy):

        return "WEST" if dx < 0 else "EAST"

    return "NORTH" if dy < 0 else "SOUTH"
# ==========================================
# MOVEMENT DIRECTION CLASSIFICATION
# ==========================================

def classify_movement(points):

    if len(points) < 2:
        return "UNKNOWN"

    start_x, start_y = points[0]
    end_x, end_y = points[-1]

    dx = end_x - start_x
    dy = end_y - start_y

    distance = math.sqrt(dx * dx + dy * dy)

    if distance < MIN_MOVEMENT:
        return "UNKNOWN"

    angle = math.degrees(
        math.atan2(-dy, dx)
    )

    angle = (angle + 360) % 360

    directions = [
        "E", "NE", "N", "NW",
        "W", "SW", "S", "SE"
    ]

    index = int(
        ((angle + 22.5) % 360) // 45
    )

    return directions[index]


# ==========================================
# LOAD YOLO MODEL
# ==========================================

print("\nLoading YOLO model...")

if not MODEL_PATH.exists():

    print("ERROR: yolov8n.pt not found!")
    raise SystemExit

if not VIDEO_PATH.exists():

    print("ERROR: traffic2.mp4 not found!")
    raise SystemExit

model = YOLO(str(MODEL_PATH))

print("YOLO model loaded successfully!")


# ==========================================
# OPEN VIDEO
# ==========================================

cap = cv2.VideoCapture(str(VIDEO_PATH))

if not cap.isOpened():

    print("ERROR: Cannot open traffic2.mp4")
    raise SystemExit

fps = cap.get(cv2.CAP_PROP_FPS)

width = int(
    cap.get(cv2.CAP_PROP_FRAME_WIDTH)
)

height = int(
    cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
)

total_frames = int(
    cap.get(cv2.CAP_PROP_FRAME_COUNT)
)

if fps <= 0:
    fps = 25


# ==========================================
# VIDEO WRITER
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
# ANALYSIS VARIABLES
# ==========================================

all_detections = []

frame_number = 0

density_summary = {
    "LOW": 0,
    "MEDIUM": 0,
    "HIGH": 0
}

stream_density_summary = {
    stream: {
        "LOW": 0,
        "MEDIUM": 0,
        "HIGH": 0
    }
    for stream in STREAMS
}


# ==========================================
# ADAPTIVE SIGNAL CONTROLLER (SIMULATION)
# ==========================================

# Vehicle counts detected in each frame are used as demand estimates.
# This controller is synchronized to video time, not processing speed.
signal_controller = AdaptiveSignalController(
    min_green=10,
    max_green=35,
    yellow_seconds=3,
    all_red_seconds=2
)
controller_clock_start = time.monotonic()


# ==========================================
# START ANALYSIS
# ==========================================

print("\nStarting FlowAI Multi-Directional Analysis...")


# ==========================================
# MAIN VIDEO PROCESSING LOOP
# ==========================================

try:

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
    conf=0.20,
    imgsz=960,
    iou=0.50,
    max_det=300,
    verbose=False
)

        frame_detections = []

        # Vehicle class counts
        current_counts = {
            name: 0
            for name in VEHICLE_CLASSES.values()
        }

        # FIX: Include UNKNOWN to prevent KeyError
        current_stream_counts = {
            stream: 0
            for stream in STREAMS
        }

        current_stream_counts["UNKNOWN"] = 0

        # Movement counts
        current_movement_counts = {
            direction: 0
            for direction in DIRECTIONS
        }


        # ==================================
        # PROCESS DETECTED VEHICLES
        # ==================================

        for result in results:

            if result.boxes is None:
                continue

            for box in result.boxes:

                class_id = int(box.cls[0])

                if class_id not in VEHICLE_CLASSES:
                    continue

                confidence = float(box.conf[0])

                x1, y1, x2, y2 = map(
                    int,
                    box.xyxy[0].tolist()
                )

                track_id = None

                if box.id is not None:
                    track_id = int(box.id[0])

                vehicle_name = VEHICLE_CLASSES[class_id]

                current_counts[vehicle_name] += 1

                center_x = int((x1 + x2) / 2)
                center_y = int((y1 + y2) / 2)

                stream = "UNKNOWN"
                movement = "UNKNOWN"


                # ==================================
                # TRACK VEHICLE POSITIONS
                # ==================================

                if track_id is not None:

                    vehicle_ids[vehicle_name].add(track_id)

                    track_history[track_id].append(
                        (center_x, center_y)
                    )

                    points = list(
                        track_history[track_id]
                    )


                    # ==================================
                    # IDENTIFY APPROACH STREAM
                    # ==================================

                    if track_id not in track_stream:

                        track_stream[track_id] = (
                            classify_stream(
                                center_x,
                                center_y,
                                width,
                                height
                            )
                        )

                    stream = track_stream[track_id]

                    # Safety check
                    if stream in stream_vehicle_ids:

                        stream_vehicle_ids[stream].add(
                            track_id
                        )


                    # ==================================
                    # IDENTIFY MOVEMENT DIRECTION
                    # ==================================

                    movement = classify_movement(points)

                    if movement != "UNKNOWN":

                        track_movement[track_id] = movement

                    else:

                        movement = track_movement.get(
                            track_id,
                            "UNKNOWN"
                        )

                    movement_vehicle_ids[movement].add(
                        track_id
                    )


                # ==================================
                # UPDATE STREAM AND MOVEMENT COUNTS
                # ==================================

                if stream not in current_stream_counts:

                    current_stream_counts[stream] = 0

                current_stream_counts[stream] += 1

                current_movement_counts[movement] += 1


                # ==================================
                # DRAW VEHICLE BOUNDING BOX
                # ==================================

                cv2.rectangle(
                    frame,
                    (x1, y1),
                    (x2, y2),
                    (0, 255, 0),
                    2
                )

                label = (
    f"{vehicle_name} "
    f"Conf:{confidence:.2f} "
    f"ID:{track_id} "
    f"{stream} "
    f"{movement}"
)

                cv2.putText(
                    frame,
                    label,
                    (x1, max(y1 - 10, 20)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (0, 255, 0),
                    2
                )


                # ==================================
                # DRAW VEHICLE TRACK TRAIL
                # ==================================

                if track_id is not None:

                    points = list(
                        track_history[track_id]
                    )

                    for i in range(1, len(points)):

                        cv2.line(
                            frame,
                            points[i - 1],
                            points[i],
                            (255, 255, 0),
                            2
                        )


                # ==================================
                # SAVE DETECTION INFORMATION
                # ==================================

                frame_detections.append({

                    "vehicle": vehicle_name,

                    "confidence": round(
                        confidence, 3
                    ),

                    "track_id": track_id,

                    "approach_stream": stream,

                    "movement_direction": movement,

                    "center": [
                        center_x,
                        center_y
                    ],

                    "bounding_box": [
                        x1, y1, x2, y2
                    ]

                })


        # ==========================================
        # OVERALL TRAFFIC DENSITY
        # ==========================================

        total_vehicles = sum(
            current_counts.values()
        )

        density = calculate_density(
            total_vehicles
        )

        density_summary[density] += 1


        # ==========================================
        # STREAM-WISE ANALYSIS
        # ==========================================

        stream_analysis = {}

        for stream in STREAMS:

            count = current_stream_counts[stream]

            stream_density = calculate_density(
                count
            )

            stream_density_summary[stream][
                stream_density
            ] += 1

            suggestion = signal_suggestion(
                stream_density,
                0
            )

            stream_analysis[stream] = {

                "vehicle_count": count,

                "density": stream_density,

                "signal_suggestion": suggestion

            }


        # ==========================================
        # UPDATE ADAPTIVE SIGNAL CONTROLLER
        # ==========================================

        # Current detected vehicle counts are passed to the controller.
        # Pedestrian detection is not yet implemented, so counts remain zero.
        simulated_video_time = controller_clock_start + (frame_number / fps)
        signal_state = signal_controller.update(
            vehicle_counts={
                "NORTH": current_stream_counts["NORTH"],
                "SOUTH": current_stream_counts["SOUTH"],
                "EAST": current_stream_counts["EAST"],
                "WEST": current_stream_counts["WEST"]
            },
            pedestrian_counts={
                "NORTH": 0, "SOUTH": 0, "EAST": 0, "WEST": 0
            },
            now=simulated_video_time
        )

        signal_display = (
            f"SIGNAL: {signal_state.phase} | "
            f"ACTIVE: {signal_state.active_direction or 'NONE'} | "
            f"TIME: {signal_state.remaining_seconds}s"
        )

# ==========================================
        # DRAW INFORMATION PANEL
        # ==========================================

        information = [

            "FLOWAI MULTI-DIRECTION TRAFFIC SYSTEM",

            signal_display,

            f"Total Vehicles: {total_vehicles}",

            f"Overall Density: {density}",

            f"North Stream: {current_stream_counts['NORTH']}",

            f"South Stream: {current_stream_counts['SOUTH']}",

            f"East Stream: {current_stream_counts['EAST']}",

            f"West Stream: {current_stream_counts['WEST']}",

            f"Unknown Stream: {current_stream_counts['UNKNOWN']}",

            f"Movement NE: {current_movement_counts['NE']}",

            f"Movement NW: {current_movement_counts['NW']}",

            f"Movement SE: {current_movement_counts['SE']}",

            f"Movement SW: {current_movement_counts['SW']}",

            f"Movement N: {current_movement_counts['N']}",

            f"Movement S: {current_movement_counts['S']}",

            f"Movement E: {current_movement_counts['E']}",

            f"Movement W: {current_movement_counts['W']}"

        ]

        y_position = 25

        for info_text in information:

            cv2.putText(
                frame,
                info_text,
                (10, y_position),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.48,
                (255, 255, 255),
                1
            )

            y_position += 22


        # ==========================================
        # SAVE VIDEO FRAME
        # ==========================================

        writer.write(frame)


        # ==========================================
        # SAVE JSON FRAME RESULTS
        # ==========================================

        all_detections.append({

            "frame": frame_number,

            "timestamp_seconds": round(
                frame_number / fps, 2
            ),

            "total_vehicles": total_vehicles,

            "vehicle_counts": current_counts,

            "traffic_density": density,

            "adaptive_signal": {
                "phase": signal_state.phase,
                "active_direction": signal_state.active_direction,
                "green_direction": signal_state.green_direction,
                "pedestrian_walk": signal_state.pedestrian_walk,
                "remaining_seconds": signal_state.remaining_seconds,
                "reason": signal_state.reason
            },

            "stream_analysis": stream_analysis,

            "movement_counts": current_movement_counts,

            "detections": frame_detections

        })


        # ==========================================
        # PROCESSING PROGRESS
        # ==========================================

        if frame_number % 30 == 0:

            print(
                f"Processed {frame_number}/{total_frames} frames"
            )


finally:

    cap.release()
    writer.release()


# ==========================================
# FINAL UNIQUE VEHICLE COUNTS
# ==========================================

final_counts = {

    vehicle: len(ids)

    for vehicle, ids in vehicle_ids.items()

}

final_stream_counts = {

    stream: len(ids)

    for stream, ids in stream_vehicle_ids.items()

}

final_movement_counts = {

    direction: len(ids)

    for direction, ids in movement_vehicle_ids.items()

}


# ==========================================
# FINAL REPORT
# ==========================================

final_results = {

    "project": "FlowAI",

    "module": "Multi-Directional Vehicle Detection with Adaptive Signal Simulation",

    "video": VIDEO_PATH.name,

    "total_frames_processed": frame_number,

    "unique_vehicle_counts": final_counts,

    "total_unique_vehicles": sum(
        final_counts.values()
    ),

    "stream_vehicle_counts": final_stream_counts,

    "movement_vehicle_counts": final_movement_counts,

    "density_frame_summary": density_summary,

    "stream_density_summary": stream_density_summary,

    "detections": all_detections

}


# ==========================================
# SAVE JSON RESULTS
# ==========================================

with open(
    OUTPUT_JSON,
    "w",
    encoding="utf-8"
) as file:

    json.dump(
        final_results,
        file,
        indent=4
    )


# ==========================================
# FINAL OUTPUT REPORT
# ==========================================

print("\n======================================")

print(" FLOWAI MULTI-DIRECTION TRAFFIC REPORT")

print("======================================")

print("\nTOTAL UNIQUE VEHICLE COUNTS")

for vehicle, count in final_counts.items():

    print(f"{vehicle}: {count}")


print("\nFOUR APPROACH STREAM COUNTS")

for stream, count in final_stream_counts.items():

    print(f"{stream}: {count}")


print("\nMOVEMENT DIRECTION COUNTS")

for direction, count in final_movement_counts.items():

    print(f"{direction}: {count}")


print("\nTRAFFIC DENSITY SUMMARY")

for density_name, count in density_summary.items():

    print(f"{density_name}: {count}")


print("\nDetection completed successfully!")

print("Total Frames Processed:", frame_number)

print("Output Video:", OUTPUT_VIDEO)

print("JSON Results:", OUTPUT_JSON)

print("======================================")