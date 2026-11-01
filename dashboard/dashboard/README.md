# FlowAI Web Dashboard (`flowai-dashboard` branch)

Modern smart-city traffic monitoring and control dashboard for **Madan-G81/FlowAI**.

All dashboard code lives inside this separate `dashboard/` folder so existing repository files (`vehicle_detection/adaptive_signal_controller.py`, `vehicle_detection/detect_vehicles.py`, `vehicle_detection/detect_vehicles_backup.py`, `vehicle_detection/flowai_multidirection_adaptive.py`, `preview_dataset.py`, `controller/*`, `simulation/*`, and `backend/main.py`) remain untouched.

---

## Architecture & Real Backend Integration

1. **Python Telemetry & Signal Engine (`dashboard/backend_server.py`)**
   - Imports and executes the repository's actual Python modules in real time on `http://127.0.0.1:8000`:
     - `vehicle_detection/adaptive_signal_controller.py` (`AdaptiveSignalController` — four-way single-approach `GREEN` / `YELLOW` / `ALL_RED` / `PEDESTRIAN_WALK` / `PEDESTRIAN_CLEARANCE` state machine).
     - `controller/optimizer.py`, `controller/config.py`, and `controller/safety.py` (`get_signal_decision()` and `calculate_demand()` for paired `north_south` / `east_west` corridors).
     - `controller/sample_traffic.json` (real initial vehicle counts, queue lengths, and waiting times).
     - `simulation/run_simulation.py` & `simulation/metrics.py` (`run_simulation("fixed")` vs `run_simulation("adaptive")` 300-second benchmark trajectories).
   - Automatically loads recorded YOLO frame outputs (`vehicle_detection/results/traffic2_detections.json` or `vehicle_detection/results/detections.json`) whenever present on disk.

2. **Non-Invasive Live YOLOv8 Video Streamer (`dashboard/run_yolo_live.py`)**
   - Streams live YOLOv8 + ByteTrack multi-directional vehicle detections (`Car`, `Motorcycle`, `Bicycle`, `Bus`, `Truck`) and 8-way movement headings (`N, NE, E, SE, S, SW, W, NW`) from `vehicle_detection/traffic2.mp4` or a webcam (`0`) directly to `POST /api/yolo/push` without altering `detect_vehicles.py` or `flowai_multidirection_adaptive.py`.

3. **Web Dashboard (`dashboard/src/` + `dashboard/server.ts`)**
   - React 19 + TypeScript + Tailwind CSS v4 + Express gateway on `http://localhost:3000`.
   - Automatically starts `backend_server.py` on port `8000` if it is not already running, and proxies `/api/*` directly to Python.

---

## Complete Setup Instructions

### 1. Clone & Switch to the `flowai-dashboard` Branch

```bash
git clone https://github.com/Madan-G81/FlowAI.git
cd FlowAI
git checkout flowai-dashboard
```

### 2. Start the Dashboard & Python Controller Backend

Node.js (v20+ / v22+) and Python 3.10+ are required. From the repository root:

```bash
cd dashboard
npm install
npm run dev
```

This single command:
1. Starts `python3 dashboard/backend_server.py` on `http://127.0.0.1:8000` (loading `adaptive_signal_controller.py`, `controller/optimizer.py`, and `simulation/run_simulation.py`).
2. Starts the interactive FlowAI Web Dashboard on **`http://localhost:3000`**.

*(Optional)* You can also start the Python backend independently in its own terminal:

```bash
python3 dashboard/backend_server.py
```

### 3. Stream Live YOLOv8 Video Detections (Optional)

Ensure `yolov8n.pt` and `traffic2.mp4` are placed in `vehicle_detection/` (just as used by `detect_vehicles.py` and `flowai_multidirection_adaptive.py`), install YOLO dependencies if not already installed, and run:

```bash
pip install -r vehicle_detection/requirements.txt
python3 dashboard/run_yolo_live.py --video vehicle_detection/traffic2.mp4 --api http://127.0.0.1:8000
```

Or run your existing batch analyzer as usual:

```bash
cd vehicle_detection
python3 flowai_multidirection_adaptive.py
```

When `vehicle_detection/results/traffic2_detections.json` is generated, `dashboard/backend_server.py` automatically detects and replays the real frame-by-frame stream counts into the dashboard.

---

## API Endpoints Verified

| Method | Endpoint | Source Module |
| :--- | :--- | :--- |
| `GET` | `/api/health` | `docs/API_CONTRACT.md` health check |
| `GET` | `/api/traffic/current` | Live North, South, East, West counts, queue lengths, and wait times |
| `GET` | `/api/control/decision` | `controller/optimizer.py` `get_signal_decision()` |
| `GET` | `/api/dashboard/telemetry` | Combined `AdaptiveSignalController` + `optimizer.py` + class & movement metrics |
| `GET` | `/api/simulation/benchmark` | `simulation/run_simulation.py` 300s Fixed vs Adaptive comparison |
| `POST` | `/api/traffic/update` | Update timings (`min_green`, `max_green`), strategy, or pedestrian requests |
| `POST` | `/api/yolo/push` | Ingest live YOLOv8 stream counts from `run_yolo_live.py` |
