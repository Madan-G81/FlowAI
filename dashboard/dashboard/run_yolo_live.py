#!/usr/bin/env python3
"""
FlowAI Live YOLOv8 Video Streamer for Dashboard
-----------------------------------------------
Runs YOLOv8 + ByteTrack on traffic2.mp4 (or webcam / custom video path) using
the exact approach classification and vehicle categories from
vehicle_detection/flowai_multidirection_adaptive.py without modifying any
existing files, and streams live detections to the FlowAI Dashboard API.

Usage:
    python dashboard/run_yolo_live.py
    python dashboard/run_yolo_live.py --video vehicle_detection/traffic2.mp4 --api http://127.0.0.1:8000
"""

import argparse
import json
import math
import time
import urllib.request
from collections import defaultdict, deque
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
VD_DIR = REPO_ROOT / "vehicle_detection"

VEHICLE_CLASSES = {
    1: "Bicycle",
    2: "Car",
    3: "Motorcycle",
    5: "Bus",
    7: "Truck",
}

MIN_MOVEMENT = 12
HISTORY_LENGTH = 12


def classify_stream(x: float, y: float, width: int, height: int) -> str:
    center_x = width / 2
    center_y = height / 2
    dx = x - center_x
    dy = y - center_y
    if abs(dx) > abs(dy):
        return "WEST" if dx < 0 else "EAST"
    return "NORTH" if dy < 0 else "SOUTH"


def classify_movement(points) -> str:
    if len(points) < 2:
        return "UNKNOWN"
    start_x, start_y = points[0]
    end_x, end_y = points[-1]
    dx = end_x - start_x
    dy = end_y - start_y
    if math.sqrt(dx * dx + dy * dy) < MIN_MOVEMENT:
        return "UNKNOWN"
    angle = (math.degrees(math.atan2(-dy, dx)) + 360) % 360
    directions = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"]
    return directions[int(((angle + 22.5) % 360) // 45)]


def post_json(url: str, payload: dict) -> None:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=2.5) as resp:
        resp.read()


def main() -> None:
    parser = argparse.ArgumentParser(description="Stream live YOLOv8 detections to FlowAI Dashboard")
    parser.add_argument(
        "--model",
        default=str(VD_DIR / "yolov8n.pt"),
        help="Path to YOLOv8 weights (default: vehicle_detection/yolov8n.pt)",
    )
    parser.add_argument(
        "--video",
        default=str(VD_DIR / "traffic2.mp4"),
        help="Path to traffic video or '0' for webcam",
    )
    parser.add_argument(
        "--api",
        default="http://127.0.0.1:8000",
        help="FlowAI backend base URL (default: http://127.0.0.1:8000 or http://localhost:3000)",
    )
    args = parser.parse_args()

    import cv2  # type: ignore
    from ultralytics import YOLO  # type: ignore

    model_path = Path(args.model)
    if not model_path.exists():
        raise SystemExit(f"Model weights not found at {model_path}")

    source = 0 if args.video == "0" else args.video
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise SystemExit(f"Cannot open video source: {args.video}")

    model = YOLO(str(model_path))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
    track_history = defaultdict(lambda: deque(maxlen=HISTORY_LENGTH))

    push_url = f"{args.api.rstrip('/')}/api/yolo/push"
    print(f"Streaming live YOLOv8 detections to {push_url} ...")

    last_push = 0.0
    while True:
        ok, frame = cap.read()
        if not ok:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        results = model.track(
            frame,
            persist=True,
            classes=list(VEHICLE_CLASSES.keys()),
            conf=0.35,
            verbose=False,
        )[0]

        now = time.monotonic()
        if now - last_push < 0.5:
            continue
        last_push = now

        stream_counts = {"NORTH": 0, "SOUTH": 0, "EAST": 0, "WEST": 0}
        stream_classes = {
            s: {v: 0 for v in VEHICLE_CLASSES.values()}
            for s in ("NORTH", "SOUTH", "EAST", "WEST")
        }
        movement_counts = {d: 0 for d in ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]}
        detections = []

        if results.boxes is not None:
            for box in results.boxes:
                cls_id = int(box.cls[0])
                if cls_id not in VEHICLE_CLASSES:
                    continue
                veh_name = VEHICLE_CLASSES[cls_id]
                conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cx = (x1 + x2) / 2.0
                cy = (y1 + y2) / 2.0
                stream = classify_stream(cx, cy, width, height)
                stream_counts[stream] += 1
                stream_classes[stream][veh_name] += 1

                movement = "UNKNOWN"
                track_id = int(box.id[0]) if box.id is not None else None
                if track_id is not None:
                    track_history[track_id].append((cx, cy))
                    movement = classify_movement(track_history[track_id])
                    if movement in movement_counts:
                        movement_counts[movement] += 1

                detections.append(
                    {
                        "vehicle": veh_name,
                        "confidence": round(conf, 3),
                        "track_id": track_id,
                        "approach_stream": stream,
                        "movement_direction": movement,
                        "bounding_box_pct": [
                            round((x1 / width) * 100, 1),
                            round((y1 / height) * 100, 1),
                            round(((x2 - x1) / width) * 100, 1),
                            round(((y2 - y1) / height) * 100, 1),
                        ],
                    }
                )

        payload = {
            "source": f"Live YOLOv8 ({Path(str(args.video)).name})",
            "streams": {
                s: {
                    "vehicle_count": stream_counts[s],
                    "queue_length": max(0, round(stream_counts[s] * 0.6)),
                    "vehicle_classes": stream_classes[s],
                }
                for s in ("NORTH", "SOUTH", "EAST", "WEST")
            },
            "movement_counts": movement_counts,
            "detections": detections[:30],
        }
        try:
            post_json(push_url, payload)
        except Exception as err:
            print(f"Warning: push failed ({err})")


if __name__ == "__main__":
    main()
