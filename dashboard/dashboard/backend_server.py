#!/usr/bin/env python3
"""
FlowAI Dashboard Backend Server
-------------------------------
Integrates directly with the existing Madan-G81/FlowAI Python modules without
modifying any existing repository files:
  - vehicle_detection/adaptive_signal_controller.py (AdaptiveSignalController)
  - controller/optimizer.py & controller/config.py & controller/safety.py
  - controller/sample_traffic.json
  - simulation/run_simulation.py & simulation/metrics.py
  - vehicle_detection/results/traffic2_detections.json & detections.json (YOLO outputs)

Serves the API contract on http://127.0.0.1:8000 (configurable via FLOWAI_BACKEND_PORT):
  - GET  /api/health
  - GET  /api/traffic/current
  - GET  /api/control/decision
  - GET  /api/dashboard/telemetry
  - GET  /api/simulation/benchmark
  - POST /api/traffic/update
  - POST /api/yolo/push
"""

from __future__ import annotations

import json
import os
import random
import sys
import threading
import time
from collections import deque
from dataclasses import asdict
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

DASHBOARD_DIR = Path(__file__).resolve().parent
REPO_ROOT = DASHBOARD_DIR.parent

# Add existing FlowAI module directories to sys.path (read-only import)
for sub in [
    REPO_ROOT,
    REPO_ROOT / "controller",
    REPO_ROOT / "simulation",
    REPO_ROOT / "vehicle_detection",
]:
    sub_str = str(sub)
    if sub_str not in sys.path:
        sys.path.insert(0, sub_str)

from adaptive_signal_controller import AdaptiveSignalController  # type: ignore
import config as controller_config  # type: ignore
from optimizer import calculate_demand, get_signal_decision  # type: ignore
from metrics import calculate_metrics  # type: ignore
from run_simulation import (  # type: ignore
    ALL_RED_TIME as SIM_ALL_RED_TIME,
    DIRECTIONS as SIM_DIRECTIONS,
    PHASES as SIM_PHASES,
    SIMULATION_TIME,
    YELLOW_TIME as SIM_YELLOW_TIME,
    generate_arrivals,
    run_simulation,
)

# Exact constants from vehicle_detection/flowai_multidirection_adaptive.py
LOW_LIMIT = 10
MEDIUM_LIMIT = 25
VEHICLE_CATEGORIES = ["Car", "Motorcycle", "Bicycle", "Bus", "Truck"]
MOVEMENT_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def calculate_density(count: int) -> str:
    """Matches calculate_density() in flowai_multidirection_adaptive.py."""
    if count <= LOW_LIMIT:
        return "LOW"
    if count <= MEDIUM_LIMIT:
        return "MEDIUM"
    return "HIGH"


def signal_suggestion(density: str, queue_count: int) -> str:
    """Matches signal_suggestion() in flowai_multidirection_adaptive.py."""
    if density == "HIGH" or queue_count >= 15:
        return "HIGH PRIORITY - More green time"
    if density == "MEDIUM" or queue_count >= 7:
        return "MEDIUM PRIORITY - Moderate green time"
    return "LOW PRIORITY - Normal green time"


def distribute_vehicle_classes(total: int) -> Dict[str, int]:
    """Distributes approach count across the 5 YOLOv8 classes used in detect_vehicles.py."""
    if total <= 0:
        return {k: 0 for k in VEHICLE_CATEGORIES}
    cars = int(round(total * 0.58))
    motorcycles = int(round(total * 0.20))
    buses = int(round(total * 0.08))
    trucks = int(round(total * 0.09))
    assigned = cars + motorcycles + buses + trucks
    bicycles = max(0, total - assigned)
    # Adjust cars if rounding exceeded total
    overflow = (cars + motorcycles + buses + trucks + bicycles) - total
    if overflow > 0:
        cars = max(0, cars - overflow)
    return {
        "Car": cars,
        "Motorcycle": motorcycles,
        "Bicycle": bicycles,
        "Bus": buses,
        "Truck": trucks,
    }


def compute_simulation_series() -> Dict[str, Any]:
    """
    Runs the actual simulation/run_simulation.py Fixed vs Adaptive functions AND
    records 10-second interval snapshots from generate_arrivals() for charting.
    """
    fixed_summary = run_simulation("fixed")
    adaptive_summary = run_simulation("adaptive")

    def trace_mode(mode: str) -> List[Dict[str, Any]]:
        arrivals = generate_arrivals()
        queues = {d: deque() for d in SIM_DIRECTIONS}
        waiting_times: List[int] = []
        completed = 0
        phase_index = 0
        green_remaining = 0
        clearance_remaining = 0
        current_phase = "north_south"
        timeline: List[Dict[str, Any]] = []

        for second in range(SIMULATION_TIME):
            for d in SIM_DIRECTIONS:
                if second in arrivals[d]:
                    queues[d].append(second)

            if green_remaining == 0 and clearance_remaining == 0:
                if mode == "fixed":
                    phase_index = 1 - phase_index
                    current_phase = list(SIM_PHASES.keys())[phase_index]
                    green_remaining = 30
                else:
                    ns_q = len(queues["north"]) + len(queues["south"])
                    ew_q = len(queues["east"]) + len(queues["west"])
                    desired = "north_south" if ns_q >= ew_q else "east_west"
                    if desired != current_phase:
                        current_phase = desired
                        clearance_remaining = SIM_YELLOW_TIME + SIM_ALL_RED_TIME
                    else:
                        green_remaining = 20
            elif clearance_remaining > 0:
                clearance_remaining -= 1
                if clearance_remaining == 0:
                    green_remaining = 20

            if green_remaining > 0:
                for d in SIM_PHASES[current_phase]:
                    if queues[d]:
                        arr_t = queues[d].popleft()
                        waiting_times.append(second - arr_t)
                        completed += 1
                green_remaining -= 1

            if second % 10 == 0 or second == SIMULATION_TIME - 1:
                avg_w = (
                    round(sum(waiting_times) / len(waiting_times), 2)
                    if waiting_times
                    else 0.0
                )
                timeline.append(
                    {
                        "second": second,
                        "total_queue": sum(len(queues[d]) for d in SIM_DIRECTIONS),
                        "completed_vehicles": completed,
                        "avg_wait_seconds": avg_w,
                    }
                )
        return timeline

    fixed_trace = trace_mode("fixed")
    adaptive_trace = trace_mode("adaptive")

    merged_timeline = []
    for f_pt, a_pt in zip(fixed_trace, adaptive_trace):
        merged_timeline.append(
            {
                "second": f_pt["second"],
                "fixed_queue": f_pt["total_queue"],
                "adaptive_queue": a_pt["total_queue"],
                "fixed_avg_wait": f_pt["avg_wait_seconds"],
                "adaptive_avg_wait": a_pt["avg_wait_seconds"],
                "fixed_completed": f_pt["completed_vehicles"],
                "adaptive_completed": a_pt["completed_vehicles"],
            }
        )

    return {
        "simulation_duration_seconds": SIMULATION_TIME,
        "fixed": fixed_summary,
        "adaptive": adaptive_summary,
        "timeline": merged_timeline,
    }


class FlowAIEngine:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.started_monotonic = time.monotonic()

        # Load initial traffic data from controller/sample_traffic.json
        sample_path = REPO_ROOT / "controller" / "sample_traffic.json"
        if sample_path.exists():
            with open(sample_path, "r", encoding="utf-8") as f:
                raw_sample = json.load(f)
        else:
            raw_sample = {
                "north": {"vehicle_count": 24, "queue_length": 12, "waiting_time_seconds": 35},
                "south": {"vehicle_count": 18, "queue_length": 8, "waiting_time_seconds": 22},
                "east": {"vehicle_count": 8, "queue_length": 3, "waiting_time_seconds": 10},
                "west": {"vehicle_count": 4, "queue_length": 2, "waiting_time_seconds": 7},
            }

        self.initial_sample = json.loads(json.dumps(raw_sample))
        self.traffic_data: Dict[str, Dict[str, float]] = {
            d: {
                "vehicle_count": int(raw_sample[d]["vehicle_count"]),
                "queue_length": int(raw_sample[d]["queue_length"]),
                "waiting_time_seconds": float(raw_sample[d]["waiting_time_seconds"]),
            }
            for d in ["north", "south", "east", "west"]
        }

        self.vehicle_classes_by_dir: Dict[str, Dict[str, int]] = {
            d: distribute_vehicle_classes(int(self.traffic_data[d]["vehicle_count"]))
            for d in ["north", "south", "east", "west"]
        }

        self.pedestrian_counts: Dict[str, int] = {
            "NORTH": 0,
            "SOUTH": 0,
            "EAST": 0,
            "WEST": 0,
        }

        # Arrival probabilities directly from simulation/run_simulation.py
        self.arrival_rates: Dict[str, float] = {
            "north": 0.35,
            "south": 0.25,
            "east": 0.12,
            "west": 0.10,
        }

        # Instantiate the actual AdaptiveSignalController from vehicle_detection/adaptive_signal_controller.py
        self.asc = AdaptiveSignalController(
            min_green=10,
            max_green=35,
            yellow_seconds=3,
            all_red_seconds=2,
            pedestrian_walk_seconds=10,
            pedestrian_clearance_seconds=3,
        )

        # Control mode:
        # "single_approach" -> vehicle_detection/adaptive_signal_controller.py (NORTH / SOUTH / EAST / WEST)
        # "corridor_pair"   -> controller/optimizer.py (north_south / east_west opposing green)
        self.signal_strategy: str = "single_approach"
        self.dynamic_flow_enabled: bool = True
        self.data_source: str = "controller/sample_traffic.json + AdaptiveSignalController"
        self.last_yolo_push_ts: float = 0.0
        self.yolo_frame_detections: List[Dict[str, Any]] = []
        self.movement_counts: Dict[str, int] = {
            "N": 9,
            "NE": 2,
            "E": 4,
            "SE": 1,
            "S": 11,
            "SW": 2,
            "W": 3,
            "NW": 1,
        }

        # Corridor-pair runtime phase tracking when strategy == "corridor_pair"
        self.corridor_phase: str = "north_south"
        self.corridor_stage: str = "GREEN"  # GREEN | YELLOW | ALL_RED
        self.corridor_remaining: int = 25
        self.corridor_allocated: int = 25

        # Rolling history & phase transition logs
        self.history: deque[Dict[str, Any]] = deque(maxlen=40)
        self.phase_logs: deque[Dict[str, Any]] = deque(maxlen=35)
        self.total_discharged: int = 0
        self.tick_counter: int = 0

        # Check if YOLO JSON results exist on disk from flowai_multidirection_adaptive.py
        self.recorded_yolo_frames: List[Dict[str, Any]] = []
        self.recorded_yolo_index: int = 0
        self._load_existing_yolo_json_if_present()

        self.last_signal_state = self.asc.update(self._upper_counts(), self.pedestrian_counts)
        self._last_logged_key = (
            self.last_signal_state.phase,
            self.last_signal_state.active_direction,
        )
        self.simulation_benchmark = compute_simulation_series()
        self._record_history_point()

    def _load_existing_yolo_json_if_present(self) -> None:
        candidates = [
            REPO_ROOT / "vehicle_detection" / "results" / "traffic2_detections.json",
            REPO_ROOT / "vehicle_detection" / "results" / "detections.json",
        ]
        for path in candidates:
            if path.exists():
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        payload = json.load(f)
                    frames = payload.get("detections", [])
                    if isinstance(frames, list) and len(frames) > 0 and "stream_analysis" in frames[0]:
                        self.recorded_yolo_frames = frames
                        self.data_source = f"YOLO JSON ({path.relative_to(REPO_ROOT)})"
                        break
                except Exception:
                    pass

    def _upper_counts(self) -> Dict[str, int]:
        return {
            "NORTH": int(self.traffic_data["north"]["vehicle_count"]),
            "SOUTH": int(self.traffic_data["south"]["vehicle_count"]),
            "EAST": int(self.traffic_data["east"]["vehicle_count"]),
            "WEST": int(self.traffic_data["west"]["vehicle_count"]),
        }

    def _record_history_point(self) -> None:
        now_label = datetime.now().strftime("%H:%M:%S")
        avg_wait = round(
            sum(self.traffic_data[d]["waiting_time_seconds"] for d in SIM_DIRECTIONS) / 4.0,
            1,
        )
        total_veh = sum(int(self.traffic_data[d]["vehicle_count"]) for d in SIM_DIRECTIONS)
        total_queue = sum(int(self.traffic_data[d]["queue_length"]) for d in SIM_DIRECTIONS)
        demand = calculate_demand(self._int_traffic_data())
        self.history.append(
            {
                "timestamp": now_label,
                "north": int(self.traffic_data["north"]["vehicle_count"]),
                "south": int(self.traffic_data["south"]["vehicle_count"]),
                "east": int(self.traffic_data["east"]["vehicle_count"]),
                "west": int(self.traffic_data["west"]["vehicle_count"]),
                "total_vehicles": total_veh,
                "total_queue": total_queue,
                "avg_wait_seconds": avg_wait,
                "ns_demand": round(demand["north_south"], 1),
                "ew_demand": round(demand["east_west"], 1),
            }
        )

    def _int_traffic_data(self) -> Dict[str, Dict[str, int]]:
        return {
            d: {
                "vehicle_count": int(self.traffic_data[d]["vehicle_count"]),
                "queue_length": int(self.traffic_data[d]["queue_length"]),
                "waiting_time_seconds": int(round(self.traffic_data[d]["waiting_time_seconds"])),
            }
            for d in SIM_DIRECTIONS
        }

    def step(self) -> None:
        with self.lock:
            self.tick_counter += 1
            live_yolo_recent = (time.monotonic() - self.last_yolo_push_ts) < 8.0

            # 1. Update traffic counts from recorded YOLO JSON if available & no live push
            if self.recorded_yolo_frames and not live_yolo_recent:
                frame_obj = self.recorded_yolo_frames[self.recorded_yolo_index]
                self.recorded_yolo_index = (self.recorded_yolo_index + 1) % len(
                    self.recorded_yolo_frames
                )
                stream_info = frame_obj.get("stream_analysis", {})
                for d_low, d_up in [
                    ("north", "NORTH"),
                    ("south", "SOUTH"),
                    ("east", "EAST"),
                    ("west", "WEST"),
                ]:
                    cnt = int(stream_info.get(d_up, {}).get("vehicle_count", 0))
                    self.traffic_data[d_low]["vehicle_count"] = cnt
                    self.traffic_data[d_low]["queue_length"] = max(0, int(round(cnt * 0.55)))
                    self.vehicle_classes_by_dir[d_low] = distribute_vehicle_classes(cnt)
                if "movement_counts" in frame_obj:
                    for m_k in MOVEMENT_DIRS:
                        self.movement_counts[m_k] = int(
                            frame_obj["movement_counts"].get(m_k, 0)
                        )
                self.yolo_frame_detections = frame_obj.get("detections", [])[:30]

            # 2. Step AdaptiveSignalController (single-approach)
            prev_phase = self.last_signal_state.phase
            prev_dir = self.last_signal_state.active_direction
            self.last_signal_state = self.asc.update(
                self._upper_counts(), self.pedestrian_counts
            )

            # Clear served pedestrian request once PEDESTRIAN_WALK starts
            if (
                self.last_signal_state.phase == "PEDESTRIAN_WALK"
                and self.last_signal_state.active_direction in self.pedestrian_counts
            ):
                self.pedestrian_counts[self.last_signal_state.active_direction] = 0

            # Step Corridor Optimizer state machine (paired north_south / east_west)
            opt_decision = get_signal_decision(
                self._int_traffic_data(), {"current_phase": self.corridor_phase}
            )
            if self.signal_strategy == "corridor_pair" and self.dynamic_flow_enabled:
                self.corridor_remaining -= 1
                if self.corridor_remaining <= 0:
                    if self.corridor_stage == "GREEN":
                        self.corridor_stage = "YELLOW"
                        self.corridor_remaining = int(controller_config.YELLOW_SECONDS)
                    elif self.corridor_stage == "YELLOW":
                        self.corridor_stage = "ALL_RED"
                        self.corridor_remaining = int(controller_config.ALL_RED_SECONDS)
                    else:
                        next_corr = opt_decision["green_direction"]
                        if next_corr == self.corridor_phase:
                            # Alternate if opposing side has waiting vehicles > 40s
                            opp = (
                                "east_west"
                                if self.corridor_phase == "north_south"
                                else "north_south"
                            )
                            opp_max_wait = max(
                                self.traffic_data[d]["waiting_time_seconds"]
                                for d in controller_config.PHASES[opp]
                            )
                            if opp_max_wait >= controller_config.MAX_WAIT_SECONDS:
                                next_corr = opp
                        self.corridor_phase = next_corr
                        self.corridor_stage = "GREEN"
                        self.corridor_allocated = int(opt_decision["green_duration"])
                        self.corridor_remaining = self.corridor_allocated
                        self.phase_logs.appendleft(
                            {
                                "id": f"corr-{int(time.time() * 1000)}",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "strategy": "controller/optimizer.py",
                                "phase": "GREEN",
                                "direction": self.corridor_phase.upper(),
                                "duration_seconds": self.corridor_allocated,
                                "reason": opt_decision["reason"],
                            }
                        )

            # Log single-approach phase changes
            new_key = (
                self.last_signal_state.phase,
                self.last_signal_state.active_direction,
            )
            if new_key != self._last_logged_key and (
                prev_phase != self.last_signal_state.phase
                or prev_dir != self.last_signal_state.active_direction
            ):
                self._last_logged_key = new_key
                self.phase_logs.appendleft(
                    {
                        "id": f"asc-{int(time.time() * 1000)}",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "strategy": "adaptive_signal_controller.py",
                        "phase": self.last_signal_state.phase,
                        "direction": self.last_signal_state.active_direction or "ALL",
                        "duration_seconds": int(self.asc.phase_duration),
                        "reason": self.last_signal_state.reason,
                    }
                )

            # Determine which directions currently have GREEN
            active_green_dirs: List[str] = []
            if self.signal_strategy == "single_approach":
                if (
                    self.last_signal_state.phase == "GREEN"
                    and self.last_signal_state.green_direction
                ):
                    active_green_dirs = [self.last_signal_state.green_direction.lower()]
            else:
                if self.corridor_stage == "GREEN":
                    active_green_dirs = list(
                        controller_config.PHASES[self.corridor_phase]
                    )

            # 3. Dynamic arrival & queue discharge physics (when enabled and not overridden by external YOLO push)
            if self.dynamic_flow_enabled and not live_yolo_recent and not self.recorded_yolo_frames:
                for d in SIM_DIRECTIONS:
                    # Stochastic arrivals from simulation/run_simulation.py rates
                    if random.random() < self.arrival_rates[d]:
                        self.traffic_data[d]["vehicle_count"] += 1
                        if d not in active_green_dirs:
                            self.traffic_data[d]["queue_length"] += 1

                    # Discharge during GREEN
                    if d in active_green_dirs:
                        discharge = 1 if random.random() < 0.85 else 2
                        actual_cleared = min(
                            int(self.traffic_data[d]["vehicle_count"]), discharge
                        )
                        self.traffic_data[d]["vehicle_count"] = max(
                            0, self.traffic_data[d]["vehicle_count"] - actual_cleared
                        )
                        self.traffic_data[d]["queue_length"] = max(
                            0, self.traffic_data[d]["queue_length"] - actual_cleared
                        )
                        self.total_discharged += actual_cleared
                        self.traffic_data[d]["waiting_time_seconds"] = max(
                            0.0, self.traffic_data[d]["waiting_time_seconds"] * 0.82
                        )
                    else:
                        if self.traffic_data[d]["vehicle_count"] > 0:
                            self.traffic_data[d]["waiting_time_seconds"] = round(
                                self.traffic_data[d]["waiting_time_seconds"] + 1.0, 1
                            )
                            self.traffic_data[d]["queue_length"] = min(
                                int(self.traffic_data[d]["vehicle_count"]),
                                int(self.traffic_data[d]["queue_length"]),
                            )
                        else:
                            self.traffic_data[d]["waiting_time_seconds"] = 0.0

                    self.vehicle_classes_by_dir[d] = distribute_vehicle_classes(
                        int(self.traffic_data[d]["vehicle_count"])
                    )

                # Update movement compass counts proportional to active directional counts
                self.movement_counts = {
                    "N": max(1, int(round(self.traffic_data["south"]["vehicle_count"] * 0.6))),
                    "S": max(1, int(round(self.traffic_data["north"]["vehicle_count"] * 0.6))),
                    "E": max(1, int(round(self.traffic_data["west"]["vehicle_count"] * 0.6))),
                    "W": max(1, int(round(self.traffic_data["east"]["vehicle_count"] * 0.6))),
                    "NE": max(0, int(round(self.traffic_data["south"]["vehicle_count"] * 0.2))),
                    "NW": max(0, int(round(self.traffic_data["east"]["vehicle_count"] * 0.2))),
                    "SE": max(0, int(round(self.traffic_data["west"]["vehicle_count"] * 0.2))),
                    "SW": max(0, int(round(self.traffic_data["north"]["vehicle_count"] * 0.2))),
                }

            if self.tick_counter % 2 == 0:
                self._record_history_point()

    def get_current_traffic(self) -> Dict[str, Dict[str, int]]:
        with self.lock:
            return self._int_traffic_data()

    def get_optimizer_decision(self) -> Dict[str, Any]:
        with self.lock:
            return get_signal_decision(
                self._int_traffic_data(), {"current_phase": self.corridor_phase}
            )

    def build_telemetry(self) -> Dict[str, Any]:
        with self.lock:
            int_traffic = self._int_traffic_data()
            opt_decision = get_signal_decision(
                int_traffic, {"current_phase": self.corridor_phase}
            )
            sig = self.last_signal_state

            approaches_out: Dict[str, Any] = {}
            for d_low, d_up in [
                ("north", "NORTH"),
                ("south", "SOUTH"),
                ("east", "EAST"),
                ("west", "WEST"),
            ]:
                v_cnt = int_traffic[d_low]["vehicle_count"]
                q_len = int_traffic[d_low]["queue_length"]
                wait_s = int_traffic[d_low]["waiting_time_seconds"]
                dens = calculate_density(v_cnt)

                # Signal color per direction according to active strategy
                if self.signal_strategy == "single_approach":
                    if sig.phase == "GREEN" and sig.active_direction == d_up:
                        lamp = "GREEN"
                        rem = sig.remaining_seconds
                    elif sig.phase == "YELLOW" and sig.active_direction == d_up:
                        lamp = "YELLOW"
                        rem = sig.remaining_seconds
                    else:
                        lamp = "RED"
                        rem = sig.remaining_seconds
                    alloc = max(
                        self.asc.min_green,
                        min(self.asc.max_green, self.asc.min_green + v_cnt),
                    )
                else:
                    in_active_pair = d_low in controller_config.PHASES[self.corridor_phase]
                    if in_active_pair and self.corridor_stage == "GREEN":
                        lamp = "GREEN"
                    elif in_active_pair and self.corridor_stage == "YELLOW":
                        lamp = "YELLOW"
                    else:
                        lamp = "RED"
                    rem = self.corridor_remaining
                    alloc = self.corridor_allocated if in_active_pair else opt_decision["green_duration"]

                indiv_demand_score = round(
                    controller_config.QUEUE_WEIGHT * q_len
                    + controller_config.VEHICLE_WEIGHT * v_cnt
                    + controller_config.WAITING_WEIGHT * wait_s,
                    1,
                )

                approaches_out[d_low] = {
                    "direction": d_low,
                    "label": d_up.title(),
                    "vehicle_count": v_cnt,
                    "queue_length": q_len,
                    "waiting_time_seconds": wait_s,
                    "density": dens,
                    "signal_suggestion": signal_suggestion(dens, q_len),
                    "signal": lamp,
                    "remaining_seconds": rem,
                    "allocated_green_seconds": int(alloc),
                    "demand_score": indiv_demand_score,
                    "arrival_rate_per_sec": round(self.arrival_rates[d_low], 2),
                    "pedestrian_waiting": int(self.pedestrian_counts[d_up]),
                    "vehicle_classes": dict(self.vehicle_classes_by_dir[d_low]),
                }

            # Aggregate vehicle classes across all 4 approaches
            aggregate_classes = {k: 0 for k in VEHICLE_CATEGORIES}
            for d_low in SIM_DIRECTIONS:
                for cls_name, cnt in self.vehicle_classes_by_dir[d_low].items():
                    aggregate_classes[cls_name] += cnt

            total_vehicles = sum(int_traffic[d]["vehicle_count"] for d in SIM_DIRECTIONS)
            total_queue = sum(int_traffic[d]["queue_length"] for d in SIM_DIRECTIONS)
            avg_wait = round(
                sum(int_traffic[d]["waiting_time_seconds"] for d in SIM_DIRECTIONS) / 4.0,
                1,
            )

            # Inspect actual repository Python files on disk
            tracked_files = [
                "vehicle_detection/adaptive_signal_controller.py",
                "vehicle_detection/detect_vehicles.py",
                "vehicle_detection/detect_vehicles_backup.py",
                "vehicle_detection/flowai_multidirection_adaptive.py",
                "vehicle_detection/test_yolo.py",
                "preview_dataset.py",
                "controller/optimizer.py",
                "controller/safety.py",
                "simulation/run_simulation.py",
                "backend/main.py",
            ]
            repo_files = []
            for rel_p in tracked_files:
                full_p = REPO_ROOT / rel_p
                exists = full_p.exists()
                lines = 0
                if exists:
                    try:
                        lines = len(full_p.read_text(encoding="utf-8", errors="ignore").splitlines())
                    except Exception:
                        lines = 0
                repo_files.append(
                    {
                        "path": rel_p,
                        "exists": exists,
                        "lines": lines,
                    }
                )

            return {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "uptime_seconds": int(round(time.monotonic() - self.started_monotonic)),
                "data_source": self.data_source,
                "signal_strategy": self.signal_strategy,
                "dynamic_flow_enabled": self.dynamic_flow_enabled,
                "total_vehicles": total_vehicles,
                "total_queue_length": total_queue,
                "avg_waiting_seconds": avg_wait,
                "overall_density": calculate_density(total_vehicles),
                "total_discharged": self.total_discharged,
                "approaches": approaches_out,
                "adaptive_controller": {
                    **asdict(sig),
                    "min_green": self.asc.min_green,
                    "max_green": self.asc.max_green,
                    "yellow_seconds": self.asc.yellow_seconds,
                    "all_red_seconds": self.asc.all_red_seconds,
                },
                "corridor_optimizer": {
                    **opt_decision,
                    "active_corridor_phase": self.corridor_phase,
                    "active_corridor_stage": self.corridor_stage,
                    "corridor_remaining_seconds": self.corridor_remaining,
                    "weights": {
                        "queue_weight": controller_config.QUEUE_WEIGHT,
                        "vehicle_weight": controller_config.VEHICLE_WEIGHT,
                        "waiting_weight": controller_config.WAITING_WEIGHT,
                    },
                },
                "aggregate_vehicle_classes": aggregate_classes,
                "movement_counts": dict(self.movement_counts),
                "yolo_detections": list(self.yolo_frame_detections),
                "history": list(self.history),
                "phase_logs": list(self.phase_logs),
                "repo_files": repo_files,
                "yolo_assets": {
                    "yolov8n_weights_present": (
                        REPO_ROOT / "vehicle_detection" / "yolov8n.pt"
                    ).exists(),
                    "traffic2_video_present": (
                        REPO_ROOT / "vehicle_detection" / "traffic2.mp4"
                    ).exists(),
                    "detections_json_present": len(self.recorded_yolo_frames) > 0,
                },
            }

    def apply_update(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self.lock:
            action = payload.get("action")

            if action == "reset_sample":
                for d in SIM_DIRECTIONS:
                    self.traffic_data[d] = {
                        "vehicle_count": int(self.initial_sample[d]["vehicle_count"]),
                        "queue_length": int(self.initial_sample[d]["queue_length"]),
                        "waiting_time_seconds": float(
                            self.initial_sample[d]["waiting_time_seconds"]
                        ),
                    }
                    self.vehicle_classes_by_dir[d] = distribute_vehicle_classes(
                        int(self.traffic_data[d]["vehicle_count"])
                    )
                self.data_source = "controller/sample_traffic.json + AdaptiveSignalController"

            elif action == "toggle_dynamic_flow":
                self.dynamic_flow_enabled = not self.dynamic_flow_enabled

            elif action == "set_strategy":
                strat = payload.get("strategy")
                if strat in ("single_approach", "corridor_pair"):
                    self.signal_strategy = strat

            elif action == "request_pedestrian":
                direction = str(payload.get("direction", "NORTH")).upper()
                if direction in self.pedestrian_counts:
                    self.pedestrian_counts[direction] += int(payload.get("count", 3))

            elif action == "force_direction":
                direction = str(payload.get("direction", "NORTH")).upper()
                if direction in ("NORTH", "SOUTH", "EAST", "WEST"):
                    self.signal_strategy = "single_approach"
                    dur = self.asc._green_duration(direction)
                    self.asc._start_phase(
                        "GREEN",
                        dur,
                        direction,
                        f"Operator priority green granted to {direction}",
                    )
                    self.last_signal_state = self.asc.update(
                        self._upper_counts(), self.pedestrian_counts
                    )

            elif action == "update_timings":
                min_g = int(payload.get("min_green", self.asc.min_green))
                max_g = int(payload.get("max_green", self.asc.max_green))
                yel = int(payload.get("yellow_seconds", self.asc.yellow_seconds))
                ared = int(payload.get("all_red_seconds", self.asc.all_red_seconds))
                if 3 <= min_g <= max_g <= 90:
                    self.asc.min_green = min_g
                    self.asc.max_green = max_g
                self.asc.yellow_seconds = max(1, min(8, yel))
                self.asc.all_red_seconds = max(1, min(6, ared))

            elif action == "set_counts":
                counts = payload.get("traffic_data", {})
                for d in SIM_DIRECTIONS:
                    if d in counts:
                        item = counts[d]
                        if "vehicle_count" in item:
                            self.traffic_data[d]["vehicle_count"] = max(
                                0, int(item["vehicle_count"])
                            )
                        if "queue_length" in item:
                            self.traffic_data[d]["queue_length"] = max(
                                0, int(item["queue_length"])
                            )
                        if "waiting_time_seconds" in item:
                            self.traffic_data[d]["waiting_time_seconds"] = max(
                                0.0, float(item["waiting_time_seconds"])
                            )
                        if "arrival_rate" in item:
                            self.arrival_rates[d] = max(
                                0.0, min(0.95, float(item["arrival_rate"]))
                            )
                        self.vehicle_classes_by_dir[d] = distribute_vehicle_classes(
                            int(self.traffic_data[d]["vehicle_count"])
                        )
                self.last_signal_state = self.asc.update(
                    self._upper_counts(), self.pedestrian_counts
                )
                self._record_history_point()

        return self.build_telemetry()

    def ingest_yolo_push(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self.lock:
            self.last_yolo_push_ts = time.monotonic()
            self.data_source = str(
                payload.get("source", "Live YOLOv8 Stream (flowai_multidirection_adaptive)")
            )
            streams = payload.get("streams", {})
            for d_low, d_up in [
                ("north", "NORTH"),
                ("south", "SOUTH"),
                ("east", "EAST"),
                ("west", "WEST"),
            ]:
                s_val = streams.get(d_up) or streams.get(d_low)
                if s_val is not None:
                    if isinstance(s_val, dict):
                        cnt = int(s_val.get("vehicle_count", 0))
                        q_len = int(s_val.get("queue_length", max(0, round(cnt * 0.55))))
                        classes = s_val.get("vehicle_classes")
                    else:
                        cnt = int(s_val)
                        q_len = max(0, round(cnt * 0.55))
                        classes = None
                    self.traffic_data[d_low]["vehicle_count"] = max(0, cnt)
                    self.traffic_data[d_low]["queue_length"] = max(0, q_len)
                    self.vehicle_classes_by_dir[d_low] = (
                        classes if isinstance(classes, dict) else distribute_vehicle_classes(cnt)
                    )

            if isinstance(payload.get("movement_counts"), dict):
                for m_k in MOVEMENT_DIRS:
                    if m_k in payload["movement_counts"]:
                        self.movement_counts[m_k] = int(payload["movement_counts"][m_k])

            if isinstance(payload.get("detections"), list):
                self.yolo_frame_detections = payload["detections"][:35]

            self.last_signal_state = self.asc.update(
                self._upper_counts(), self.pedestrian_counts
            )
            self._record_history_point()

        return self.build_telemetry()


ENGINE = FlowAIEngine()


def _background_loop() -> None:
    while True:
        time.sleep(1.0)
        try:
            ENGINE.step()
        except Exception as exc:
            sys.stderr.write(f"[FlowAI Engine Error] {exc}\n")


class FlowAIRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        # Keep console clean during 1Hz polling
        return

    def _send_json(self, status: int, body: Any) -> None:
        raw = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:
        self._send_json(200, {"ok": True})

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        route = parsed.path

        if route in ("/", "/api/health"):
            self._send_json(
                200,
                {
                    "status": "healthy",
                    "project": "FlowAI",
                    "engine": "Python AdaptiveSignalController + Corridor Optimizer",
                },
            )
        elif route == "/api/traffic/current":
            self._send_json(200, ENGINE.get_current_traffic())
        elif route == "/api/control/decision":
            self._send_json(200, ENGINE.get_optimizer_decision())
        elif route == "/api/dashboard/telemetry":
            self._send_json(200, ENGINE.build_telemetry())
        elif route == "/api/simulation/benchmark":
            self._send_json(200, ENGINE.simulation_benchmark)
        else:
            self._send_json(404, {"error": f"Unknown endpoint: {route}"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        route = parsed.path
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception:
            self._send_json(400, {"error": "Invalid JSON body"})
            return

        if route == "/api/traffic/update":
            self._send_json(200, ENGINE.apply_update(payload))
        elif route == "/api/yolo/push":
            self._send_json(200, ENGINE.ingest_yolo_push(payload))
        else:
            self._send_json(404, {"error": f"Unknown POST endpoint: {route}"})


def main() -> None:
    port = int(os.environ.get("FLOWAI_BACKEND_PORT", "8000"))
    worker = threading.Thread(target=_background_loop, daemon=True)
    worker.start()

    server = ThreadingHTTPServer(("127.0.0.1", port), FlowAIRequestHandler)
    print(f"FlowAI Python backend listening on http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
