"""FlowAI four-way intersection simulation.

Adaptive mode calls the REAL controller module (controller/optimizer.py)
for every signal decision - the simulation itself contains no decision
logic. Fixed-time mode uses a predetermined alternating schedule. Both
modes use identical, deterministic arrival schedules so results are
directly comparable.

Software simulation for the FlowAI hackathon project only.
This is NOT connected to any real, public-road traffic light.
"""

import sys
import random
from collections import deque
from pathlib import Path

# Import the actual controller once (single source of decision truth).
CONTROLLER_DIR = Path(__file__).resolve().parents[1] / "controller"

if str(CONTROLLER_DIR) not in sys.path:
    sys.path.insert(0, str(CONTROLLER_DIR))

from metrics import calculate_metrics
from optimizer import get_signal_decision, RECENT_WINDOW_SECONDS
from config import YELLOW_SECONDS, ALL_RED_SECONDS

DIRECTIONS = ["north", "south", "east", "west"]

PHASES = {
    "north_south": ["north", "south"],
    "east_west": ["east", "west"]
}

SIMULATION_TIME = 300
RANDOM_SEED = 42

# Fixed-time plan: the two phases strictly alternate.
FIXED_GREEN_SECONDS = 30

# Scenarios share one arrival stream (same seed, same draw count), so
# fixed-time and adaptive runs of the same scenario see EXACTLY the
# same vehicles in the same seconds. A "periods" entry is a
# (start_second, per_direction_arrival_probability) pair.
SCENARIOS = {
    "north_south_heavy": {
        "label": "North-South heavy traffic",
        "periods": [
            (0, {"north": 0.35, "south": 0.25, "east": 0.06, "west": 0.05})
        ]
    },
    "east_west_heavy": {
        "label": "East-West heavy traffic",
        "periods": [
            (0, {"north": 0.06, "south": 0.05, "east": 0.35, "west": 0.25})
        ]
    },
    "balanced": {
        "label": "Balanced traffic",
        "periods": [
            (0, {"north": 0.15, "south": 0.15, "east": 0.15, "west": 0.15})
        ]
    },
    "low_traffic": {
        "label": "Low traffic",
        "periods": [
            (0, {"north": 0.03, "south": 0.03, "east": 0.03, "west": 0.03})
        ]
    },
    "sudden_surge": {
        "label": "Sudden traffic surge after 2 minutes",
        "periods": [
            (0, {"north": 0.05, "south": 0.05, "east": 0.05, "west": 0.05}),
            (120, {"north": 0.40, "south": 0.40, "east": 0.40, "west": 0.40})
        ]
    },
    "one_sided_queue": {
        "label": "Long waiting queue from the West approach",
        "periods": [
            (0, {"north": 0.04, "south": 0.03, "east": 0.03, "west": 0.75})
        ]
    }
}

DEFAULT_SCENARIO = "north_south_heavy"


def generate_arrivals(scenario=DEFAULT_SCENARIO):
    """Deterministic arrival schedule: second at which each vehicle enters."""
    periods = SCENARIOS[scenario]["periods"]
    rates = periods[0][1]

    arrivals = {direction: [] for direction in DIRECTIONS}

    rng = random.Random(RANDOM_SEED)

    for second in range(SIMULATION_TIME):

        for start, candidate in periods:
            if second >= start:
                rates = candidate

        for direction in DIRECTIONS:
            if rng.random() < rates[direction]:
                arrivals[direction].append(second)

    return arrivals


def build_observations(queues, recent_arrivals, second):
    """Convert live simulation state into controller traffic_data format.

    Observation definitions (controller input contract):
    - vehicle_count: number of vehicles that ARRIVED within the
      trailing RECENT_WINDOW_SECONDS window (expired timestamps are
      purged from the passed deques here, safely via popleft).
    - queue_length: current FIFO queue length; waiting_time_seconds:
      the wait of the vehicle queued longest (0 if none).
    """
    observations = {}

    for direction in DIRECTIONS:

        queue = queues[direction]

        waiting = [second - arrival for arrival in queue]

        recent = recent_arrivals[direction]

        while recent and recent[0] <= second - RECENT_WINDOW_SECONDS:
            recent.popleft()

        observations[direction] = {
            "vehicle_count": len(recent),
            "queue_length": len(queue),
            "waiting_time_seconds": max(waiting) if waiting else 0
        }

    return observations


def run_simulation(mode="adaptive", scenario=DEFAULT_SCENARIO, trace=False):
    """Run one 300-second intersection simulation.

    mode:          "fixed" (predetermined alternating timings)
                   or "adaptive" (decisions from controller/optimizer.py)
    scenario:      key of SCENARIOS
    trace:         when True the returned dict also carries a
                   "timeline" list of every signal-state event
                   (used by the integration tests)
    """
    arrivals = generate_arrivals(scenario)

    queues = {direction: deque() for direction in DIRECTIONS}
    recent_arrivals = {direction: deque() for direction in DIRECTIONS}

    waiting_times = []
    completed_vehicles = 0

    timeline = [] if trace else None

    def log(event):
        if trace:
            timeline.append(event)

    # ---------------- Signal state machine ----------------
    # "booting" -> "green" -> ("yellow" -> "all_red")? -> "green" ...
    # Phase changes always run the FULL clearance:
    # yellow (3s) then all-red (1s). Only then the next green starts.
    signal_state = "booting"
    current_phase = None
    state_remaining = 0
    pending = None

    # The controller's own state - persisted across decisions,
    # owned by the simulation, never by the controller module.
    controller_state = {
        "current_phase": None,
        "consecutive_phases": 0
    }

    phase_index = 0

    for second in range(SIMULATION_TIME):

        # 1) Vehicles keep arriving during every signal state,
        #    including yellow and all-red transitions.
        for direction in DIRECTIONS:
            if second in arrivals[direction]:
                queues[direction].append(second)
                recent_arrivals[direction].append(second)

        # 2) Signal behaviour for this second.
        if signal_state == "green":

            # Only the two directions of the active phase may depart.
            for direction in PHASES[current_phase]:
                if queues[direction]:
                    arrival_second = queues[direction].popleft()
                    waiting_times.append(second - arrival_second)
                    completed_vehicles += 1

            state_remaining -= 1

            if state_remaining == 0:

                if mode == "fixed":
                    next_phase = list(PHASES.keys())[1 - phase_index]
                    phase_index = 1 - phase_index
                    next_green = FIXED_GREEN_SECONDS
                    reason = "Fixed-time schedule"
                    next_repeats = 0

                else:
                    decision = get_signal_decision(
                        build_observations(queues, recent_arrivals, second),
                        controller_state
                    )
                    next_phase = decision["green_direction"]
                    next_green = decision["green_duration"]
                    reason = decision["reason"]
                    next_repeats = decision["phase_repeats"]

                if next_phase == current_phase:
                    # Same phase continues - no clearance needed.
                    state_remaining = next_green
                    controller_state["consecutive_phases"] = next_repeats
                    log({
                        "event": "green_extend",
                        "second": second,
                        "phase": current_phase,
                        "duration": next_green,
                        "reason": reason
                    })

                else:
                    pending = {
                        "phase": next_phase,
                        "green": next_green,
                        "consecutive": next_repeats,
                        "reason": reason
                    }
                    signal_state = "yellow"
                    state_remaining = YELLOW_SECONDS
                    log({
                        "event": "yellow_start",
                        "second": second,
                        "from_phase": current_phase,
                        "to_phase": next_phase,
                        "reason": reason
                    })

        elif signal_state == "yellow":
            state_remaining -= 1

            if state_remaining == 0:
                signal_state = "all_red"
                state_remaining = ALL_RED_SECONDS
                log({
                    "event": "all_red_start",
                    "second": second
                })

        elif signal_state == "all_red":
            state_remaining -= 1

            if state_remaining == 0:
                current_phase = pending["phase"]
                signal_state = "green"
                state_remaining = pending["green"]
                controller_state["current_phase"] = current_phase
                controller_state["consecutive_phases"] = pending["consecutive"]
                log({
                    "event": "green_start",
                    "second": second,
                    "phase": current_phase,
                    "duration": pending["green"],
                    "reason": pending["reason"]
                })

        elif signal_state == "booting":
            if mode == "fixed":
                current_phase = list(PHASES.keys())[0]
                phase_index = 0
                state_remaining = FIXED_GREEN_SECONDS
                reason = "Fixed-time schedule (startup)"

            else:
                decision = get_signal_decision(
                    build_observations(queues, recent_arrivals, second),
                    controller_state
                )
                current_phase = decision["green_direction"]
                state_remaining = decision["green_duration"]
                reason = decision["reason"]

            signal_state = "green"
            controller_state["current_phase"] = current_phase
            controller_state["consecutive_phases"] = 1
            log({
                "event": "green_start",
                "second": second,
                "phase": current_phase,
                "duration": state_remaining,
                "reason": reason
            })

    results = {
        "waiting_times": waiting_times,
        "completed_vehicles": completed_vehicles,
        "remaining_vehicles": sum(
            len(queues[direction]) for direction in DIRECTIONS
        ),
        "total_arrivals": sum(len(v) for v in arrivals.values())
    }

    summary = {
        "mode": mode,
        "scenario": scenario,
        **calculate_metrics(results, SIMULATION_TIME)
    }

    if trace:
        summary["timeline"] = timeline

    return summary


if __name__ == "__main__":

    if len(sys.argv) >= 3:
        mode, scenario = sys.argv[1], sys.argv[2]
        print(run_simulation(mode, scenario))
    else:
        print("\nFLOWAI - FIXED-TIME vs ADAPTIVE (300s per run)")
        print("=" * 62)

        for name, definition in SCENARIOS.items():

            fixed = run_simulation("fixed", name)
            adaptive = run_simulation("adaptive", name)

            print(f"\n{definition['label']}  [{name}]")
            print("-" * 62)
            print(f"{'metric':<24}{'fixed':>12}{'adaptive':>12}")
            print("-" * 62)

            for key in (
                "completed_vehicles",
                "average_wait_seconds",
                "total_wait_seconds",
                "max_wait_seconds",
                "remaining_vehicles",
                "throughput_per_minute"
            ):
                print(f"{key:<24}{fixed[key]:>12}{adaptive[key]:>12}")
