"""FlowAI FastAPI backend.

Connects the REAL controller (controller/optimizer.py) and the REAL
simulation (simulation/run_simulation.py) to HTTP clients. Sample
data is used ONLY where live data does not exist yet, and every such
response is explicitly labeled "sample".
"""

import copy
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

PROJECT_ROOT = Path(__file__).resolve().parents[1]

for module_path in (
    PROJECT_ROOT / "simulation",
    PROJECT_ROOT / "controller",
):
    if str(module_path) not in sys.path:
        sys.path.insert(0, str(module_path))

from backend.schemas import (
    DecisionRequest,
    ScenarioName,
    SimulationMode,
    SimulationRunRequest,
    TrafficObservations,
    SCENARIOS,
    MODES
)

from run_simulation import run_simulation

from optimizer import get_signal_decision

from config import MAX_WAIT_SECONDS
from typing import Literal

app = FastAPI(
    title="FlowAI",
    description="AI-Powered Adaptive Traffic Control System",
    version="1.0.0"
)

# Allow our frontend to communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Development only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SIMULATION_TIME_SECONDS = 300

# Disk-free demo/sample observations. NOT live traffic - every
# endpoint serving or using it labels the payload "sample".
SAMPLE_OBSERVATIONS = {
    "north": {
        "vehicle_count": 24,
        "queue_length": 12,
        "waiting_time_seconds": 35
    },
    "south": {
        "vehicle_count": 18,
        "queue_length": 8,
        "waiting_time_seconds": 22
    },
    "east": {
        "vehicle_count": 8,
        "queue_length": 3,
        "waiting_time_seconds": 10
    },
    "west": {
        "vehicle_count": 4,
        "queue_length": 2,
        "waiting_time_seconds": 7
    }
}

SAMPLE_STATE_MARKER = "sample"

# Deterministic compare results are seed-fixed, so caching them per
# scenario is safe and avoids re-running 300-second simulations on
# repeated requests. Deep-copied on return so a caller can never
# mutate another request's view; no per-request state is shared.
_compare_cache: dict = {}


def safe_run(run):
    try:
        return run()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Simulation failed: {type(exc).__name__}: {exc}"
        )


def metric_block(result):
    """The metrics produced by the real simulation for one mode."""
    return {
        "completed_vehicles": result["completed_vehicles"],
        "average_wait_seconds": result["average_wait_seconds"],
        "total_wait_seconds": result["total_wait_seconds"],
        "max_wait_seconds": result["max_wait_seconds"],
        "remaining_vehicles": result["remaining_vehicles"],
        "throughput_per_minute": result["throughput_per_minute"]
    }


@app.get("/")
def home():
    return {
        "project": "FlowAI",
        "message": "Backend is running successfully",
        "api_status": "operational",
        "endpoints": [
            "GET /api/health",
            "GET /api/traffic/current",
            "GET /api/control/decision (sample fallback) | POST /api/control/decision",
            "POST /api/simulation/run",
            "GET /api/simulation/scenarios",
            "GET /api/simulation/compare"
        ]
    }


@app.get("/api/health")
def health():
    return {"status": "healthy"}


@app.get("/api/traffic/current")
def get_traffic():
    """Latest traffic observation. Sample/demo for now - the video
    detection pipeline is not connected to the backend yet."""
    return {
        "data_source": SAMPLE_STATE_MARKER,
        "source_label": "Hardcoded sample observations (NOT live traffic)",
        "observations": SAMPLE_OBSERVATIONS
    }


@app.get("/api/control/decision")
def get_decision(
    north_vehicle_count: int | None = None,
    north_queue_length: int | None = None,
    north_waiting_time: int | None = None,
    south_vehicle_count: int | None = None,
    south_queue_length: int | None = None,
    south_waiting_time: int | None = None,
    east_vehicle_count: int | None = None,
    east_queue_length: int | None = None,
    east_waiting_time: int | None = None,
    west_vehicle_count: int | None = None,
    west_queue_length: int | None = None,
    west_waiting_time: int | None = None,
    current_phase: Literal["north_south", "east_west"] | None = None,
    consecutive_phases: int = 0
):
    """Real controller decision.

    Either supply ALL 12 per-direction query parameters (a full valid
    observation set), or no parameters at all - then the well-known
    SAMPLE observations are used, and the response clearly says so.
    """

    provided_values = [
        north_vehicle_count, north_queue_length, north_waiting_time,
        south_vehicle_count, south_queue_length, south_waiting_time,
        east_vehicle_count, east_queue_length, east_waiting_time,
        west_vehicle_count, west_queue_length, west_waiting_time
    ]

    any_provided = any(value is not None for value in provided_values)

    if any_provided and not all(value is not None for value in provided_values):

        missing = [
            name
            for name, value in (
                ("north.vehicle_count", north_vehicle_count),
                ("north.queue_length", north_queue_length),
                ("north.waiting_time", north_waiting_time),
                ("south.vehicle_count", south_vehicle_count),
                ("south.queue_length", south_queue_length),
                ("south.waiting_time", south_waiting_time),
                ("east.vehicle_count", east_vehicle_count),
                ("east.queue_length", east_queue_length),
                ("east.waiting_time", east_waiting_time),
                ("west.vehicle_count", west_vehicle_count),
                ("west.queue_length", west_queue_length),
                ("west.waiting_time", west_waiting_time)
            )
            if value is None
        ]

        raise HTTPException(
            status_code=422,
            detail={
                "error": "incomplete_observations",
                "message": "When live observations are supplied, ALL of the 12 numeric fields must be provided.",
                "missing_fields": missing
            }
        )

    if any_provided and (consecutive_phases < 0):

        raise HTTPException(
            status_code=422,
            detail={
                "error": "invalid_state",
                "message": "consecutive_phases must be >= 0."
            }
        )

    if any_provided:

        observations = {
            "north": {
                "vehicle_count": north_vehicle_count,
                "queue_length": north_queue_length,
                "waiting_time_seconds": north_waiting_time
            },
            "south": {
                "vehicle_count": south_vehicle_count,
                "queue_length": south_queue_length,
                "waiting_time_seconds": south_waiting_time
            },
            "east": {
                "vehicle_count": east_vehicle_count,
                "queue_length": east_queue_length,
                "waiting_time_seconds": east_waiting_time
            },
            "west": {
                "vehicle_count": west_vehicle_count,
                "queue_length": west_queue_length,
                "waiting_time_seconds": west_waiting_time
            }
        }

        data_source = "caller_observations"

    else:
        observations = copy.deepcopy(SAMPLE_OBSERVATIONS)
        data_source = SAMPLE_STATE_MARKER

    try:
        decision = get_signal_decision(
            observations,
            {
                "current_phase": current_phase,
                "consecutive_phases": consecutive_phases
            }
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Controller failed: {type(exc).__name__}: {exc}"
        )

    decision["data_source"] = data_source

    if data_source == SAMPLE_STATE_MARKER:
        decision["warning"] = (
            "No live observations were supplied; "
            "decision uses the well-known sample data."
        )

    return decision


@app.post("/api/control/decision")
def post_decision(request: DecisionRequest):

    try:
        decision = get_signal_decision(
            request.observations.model_dump(),
            request.state.model_dump()
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Controller failed: {type(exc).__name__}: {exc}"
        )

    decision["data_source"] = "caller_observations"

    return decision


@app.get("/api/simulation/scenarios")
def get_scenarios():
    return {
        "modes": list(MODES),
        "scenarios": [
            {"name": name, "label": definition["label"]}
            for name, definition in SCENARIOS.items()
        ],
        "simulation_time_seconds": SIMULATION_TIME_SECONDS
    }


@app.post("/api/simulation/run")
def run(request: SimulationRunRequest):
    """Runs the REAL simulation module in the requested mode and
    scenario. Response metrics are actual simulation outputs."""
    result = safe_run(
        lambda: run_simulation(request.mode, request.scenario)
    )

    return {
        "mode": result["mode"],
        "mode_label": (
            "Adaptive (real controller)"
            if result["mode"] == "adaptive"
            else "Fixed-time schedule"
        ),
        "scenario": result["scenario"],
        "simulation_time_seconds": SIMULATION_TIME_SECONDS,
        "metrics": metric_block(result)
    }


@app.get("/api/simulation/compare")
def compare(scenario: ScenarioName | None = None):
    """Fixed-time versus adaptive on IDENTICAL deterministic
    arrivals. Omit the scenario parameter to compare ALL scenarios."""

    target_scenarios = [scenario] if scenario is not None else list(SCENARIOS)

    def build(mode, name):
        result = safe_run(lambda: run_simulation(mode, name))
        return {
            "mode": mode,
            "mode_label": (
                "Adaptive (real controller)"
                if mode == "adaptive"
                else "Fixed-time schedule"
            ),
            "metrics": metric_block(result)
        }

    comparisons = []

    for name in target_scenarios:

        cached = _compare_cache.get(name)

        if cached is None:
            fixed = build("fixed", name)
            adaptive = build("adaptive", name)
            cached = {
                "scenario": name,
                "scenario_label": SCENARIOS[name]["label"],
                "fixed": fixed,
                "adaptive": adaptive,
                "note": (
                    "Both modes consumed IDENTICAL deterministic "
                    "arrivals (simulation seed 42)."
                )
            }
            _compare_cache[name] = cached

        comparisons.append(copy.deepcopy(cached))

    if scenario is None:
        return {
            "data_source": "simulation",
            "comparisons": comparisons
        }

    return {
        "data_source": "simulation",
        **comparisons[0]
    }
