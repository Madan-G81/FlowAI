"""FlowAI backend Pydantic schemas (request validation)."""

import sys
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

# The backend imports the existing simulation module, which in turn
# imports the existing controller module - no logic is duplicated.
PROJECT_ROOT = Path(__file__).resolve().parents[1]

for module_path in (
    PROJECT_ROOT / "simulation",
    PROJECT_ROOT / "controller",
):
    if str(module_path) not in sys.path:
        sys.path.insert(0, str(module_path))

from run_simulation import SCENARIOS  # noqa: E402

MODES = ("fixed", "adaptive")

# Built from the simulation module so the two can never drift apart.
ScenarioName = Literal[tuple(SCENARIOS.keys())]

SimulationMode = Literal["fixed", "adaptive"]


class SimulationRunRequest(BaseModel):

    mode: SimulationMode = "adaptive"
    scenario: ScenarioName = "north_south_heavy"


class DirectionObservation(BaseModel):

    vehicle_count: int = Field(ge=0)
    queue_length: int = Field(ge=0)
    waiting_time_seconds: int = Field(ge=0)


class TrafficObservations(BaseModel):

    north: DirectionObservation
    south: DirectionObservation
    east: DirectionObservation
    west: DirectionObservation


class ControllerStateModel(BaseModel):

    current_phase: Literal["north_south", "east_west"] | None = None
    consecutive_phases: int = Field(default=0, ge=0)


class DecisionRequest(BaseModel):

    observations: TrafficObservations
    state: ControllerStateModel = ControllerStateModel()
