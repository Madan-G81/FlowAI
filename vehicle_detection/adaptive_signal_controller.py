"""
FlowAI - Adaptive Traffic Signal Controller (simulation only)

This module accepts per-approach vehicle counts and pedestrian waiting counts.
It chooses one vehicle approach at a time, provides yellow/all-red clearance,
and serves pedestrian crossings safely in the simulation.

IMPORTANT:
- This is a software demonstration, not certified traffic-control equipment.
- Do not connect it to real traffic lights or use it on public roads.
- The current detector scripts do not yet provide pedestrian counts, so pass
  zeros until a pedestrian detector/crossing-zone input is integrated.
"""

from dataclasses import dataclass, asdict
from typing import Dict, Optional
import time


DIRECTIONS = ("NORTH", "SOUTH", "EAST", "WEST")


@dataclass
class SignalState:
    phase: str
    active_direction: Optional[str]
    green_direction: Optional[str]
    pedestrian_walk: bool
    remaining_seconds: int
    reason: str


class AdaptiveSignalController:
    def __init__(
        self,
        min_green: int = 10,
        max_green: int = 35,
        yellow_seconds: int = 3,
        all_red_seconds: int = 2,
        pedestrian_walk_seconds: int = 10,
        pedestrian_clearance_seconds: int = 3,
        max_wait_before_priority: int = 45,
    ):
        if min_green < 1 or max_green < min_green:
            raise ValueError("Green timings must satisfy 1 <= min_green <= max_green.")

        self.min_green = min_green
        self.max_green = max_green
        self.yellow_seconds = yellow_seconds
        self.all_red_seconds = all_red_seconds
        self.pedestrian_walk_seconds = pedestrian_walk_seconds
        self.pedestrian_clearance_seconds = pedestrian_clearance_seconds
        self.max_wait_before_priority = max_wait_before_priority

        self.phase = "ALL_RED"
        self.active_direction = None
        self.phase_started = time.monotonic()
        self.phase_duration = all_red_seconds
        self.last_served = None
        self.waiting_since = {d: None for d in DIRECTIONS}
        self.last_vehicle_counts = {d: 0 for d in DIRECTIONS}
        self.last_pedestrian_counts = {d: 0 for d in DIRECTIONS}
        self.pending_pedestrian_direction = None
        self.last_reason = "Startup safety clearance"

    @staticmethod
    def _clean_counts(values: Optional[Dict[str, int]]) -> Dict[str, int]:
        values = values or {}
        cleaned = {}
        for direction in DIRECTIONS:
            value = int(values.get(direction, 0) or 0)
            cleaned[direction] = max(0, value)
        return cleaned

    def _update_waiting_times(self, now: float, vehicle_counts: Dict[str, int]):
        for direction, count in vehicle_counts.items():
            if count > 0 and self.waiting_since[direction] is None:
                self.waiting_since[direction] = now
            elif count == 0:
                self.waiting_since[direction] = None

    def _wait_seconds(self, direction: str, now: float) -> float:
        started = self.waiting_since[direction]
        return 0.0 if started is None else max(0.0, now - started)

    def _choose_vehicle_direction(self, now: float) -> str:
        # Waiting-time bonus prevents a busy approach from starving another.
        scores = {}
        for direction in DIRECTIONS:
            count = self.last_vehicle_counts[direction]
            wait = self._wait_seconds(direction, now)
            scores[direction] = count * 2.0 + min(wait, self.max_wait_before_priority) * 0.8

        # Stable tie-break: prefer the direction after the last served one.
        ranked = sorted(DIRECTIONS, key=lambda d: (scores[d], d == self.last_served), reverse=True)
        return ranked[0]

    def _green_duration(self, direction: str) -> int:
        count = self.last_vehicle_counts[direction]
        # Simple demonstration mapping; calibrate thresholds using real video.
        duration = self.min_green + count
        return max(self.min_green, min(self.max_green, duration))

    def _start_phase(self, phase: str, duration: int, direction=None, reason=""):
        self.phase = phase
        self.active_direction = direction
        self.phase_started = time.monotonic()
        self.phase_duration = max(0, int(duration))
        self.last_reason = reason

    def _next_vehicle_phase(self, now: float):
        direction = self._choose_vehicle_direction(now)
        duration = self._green_duration(direction)
        self._start_phase(
            "GREEN", duration, direction,
            f"{direction} selected using vehicle demand and waiting time"
        )

    def update(
        self,
        vehicle_counts: Dict[str, int],
        pedestrian_counts: Optional[Dict[str, int]] = None,
        now: Optional[float] = None,
    ) -> SignalState:
        """
        Update the controller and return the current simulated signal state.

        vehicle_counts and pedestrian_counts use keys NORTH, SOUTH, EAST, WEST.
        A pedestrian count greater than zero requests a crossing at that approach.
        """
        now = time.monotonic() if now is None else float(now)
        self.last_vehicle_counts = self._clean_counts(vehicle_counts)
        self.last_pedestrian_counts = self._clean_counts(pedestrian_counts)
        self._update_waiting_times(now, self.last_vehicle_counts)

        elapsed = max(0.0, now - self.phase_started)

        if elapsed >= self.phase_duration:
            if self.phase == "GREEN":
                served = self.active_direction
                self.last_served = served
                self._start_phase(
                    "YELLOW", self.yellow_seconds, served,
                    f"{served} green completed; changing to yellow"
                )

            elif self.phase == "YELLOW":
                self._start_phase(
                    "ALL_RED", self.all_red_seconds, None,
                    "All vehicle approaches red for clearance"
                )

            elif self.phase == "ALL_RED":
                pedestrian_demand = [
                    d for d in DIRECTIONS if self.last_pedestrian_counts[d] > 0
                ]
                if pedestrian_demand:
                    # Serve the approach with the largest waiting pedestrian count.
                    chosen = max(pedestrian_demand, key=lambda d: self.last_pedestrian_counts[d])
                    self.pending_pedestrian_direction = chosen
                    self._start_phase(
                        "PEDESTRIAN_WALK",
                        self.pedestrian_walk_seconds,
                        chosen,
                        f"Pedestrian crossing request at {chosen}"
                    )
                else:
                    self._next_vehicle_phase(now)

            elif self.phase == "PEDESTRIAN_WALK":
                self._start_phase(
                    "PEDESTRIAN_CLEARANCE",
                    self.pedestrian_clearance_seconds,
                    self.pending_pedestrian_direction,
                    "Pedestrian WALK finished; allowing crossing clearance"
                )

            elif self.phase == "PEDESTRIAN_CLEARANCE":
                self.pending_pedestrian_direction = None
                self._next_vehicle_phase(now)

        remaining = max(0, int(round(self.phase_duration - (time.monotonic() - self.phase_started))))
        green_direction = self.active_direction if self.phase == "GREEN" else None
        return SignalState(
            phase=self.phase,
            active_direction=self.active_direction,
            green_direction=green_direction,
            pedestrian_walk=(self.phase == "PEDESTRIAN_WALK"),
            remaining_seconds=remaining,
            reason=self.last_reason,
        )


def demo():
    """Run a finite 45-second console demonstration and print a summary."""
    controller = AdaptiveSignalController(
        min_green=5,
        max_green=10,
        yellow_seconds=2,
        all_red_seconds=1,
        pedestrian_walk_seconds=3,
        pedestrian_clearance_seconds=1,
    )

    sample_vehicles = {"NORTH": 8, "SOUTH": 14, "EAST": 5, "WEST": 11}
    sample_pedestrians = {"NORTH": 0, "SOUTH": 0, "EAST": 0, "WEST": 0}

    demo_seconds = 45
    phase_counts = {}
    last_phase_key = None

    print("\\nFLOWAI ADAPTIVE SIGNAL CONTROLLER - FINITE SIMULATION")
    print(f"Running for {demo_seconds} seconds, then printing the final report.")
    print("Press Ctrl+C at any time to stop early.\\n")

    started = time.monotonic()

    try:
        while time.monotonic() - started < demo_seconds:
            state = controller.update(sample_vehicles, sample_pedestrians)
            phase_key = (state.phase, state.active_direction)

            if phase_key != last_phase_key:
                phase_counts[str(phase_key)] = phase_counts.get(str(phase_key), 0) + 1
                last_phase_key = phase_key

            print(asdict(state), flush=True)
            time.sleep(1)

    except KeyboardInterrupt:
        print("\\nSimulation stopped manually.")

    print("\\n========== FLOWAI SIMULATION REPORT ==========")
    print("Simulation duration (seconds):", round(time.monotonic() - started, 1))
    print("Last signal phase:", controller.phase)
    print("Last active direction:", controller.active_direction or "None")
    print("Signal phase changes observed:")
    for phase, count in phase_counts.items():
        print(f"  {phase}: {count}")
    print("Simulation completed. This is a software demonstration only.")
    print("==============================================\\n")


if __name__ == "__main__":
    demo()
