import json
from pathlib import Path

from config import *
from safety import get_transition_clearance

BASE_DIR = Path(__file__).resolve().parent

# Observations use a trailing arrival window (seconds). The value is
# owned by the CALLER's traffic-observation layer, but the controller
# documents and relies on this definition for demand scoring.
RECENT_WINDOW_SECONDS = 60


def calculate_demand(traffic_data):

    scores = {}

    for direction in DIRECTIONS:

        data = traffic_data[direction]

        score = (
            QUEUE_WEIGHT * data["queue_length"]
            + VEHICLE_WEIGHT * data["vehicle_count"]
            + WAITING_WEIGHT * data["waiting_time_seconds"]
        )

        scores[direction] = score

    north_south = scores["north"] + scores["south"]

    east_west = scores["east"] + scores["west"]

    return {
        "north_south": north_south,
        "east_west": east_west
    }


def choose_phase(traffic_data, current_phase=None):

    demand = calculate_demand(traffic_data)

    if demand["north_south"] > demand["east_west"]:
        return "north_south"

    if demand["east_west"] > demand["north_south"]:
        return "east_west"

    # Equal demand: keep serving the current phase to avoid
    # unnecessary clearance time (defaults to north_south).
    return current_phase or "north_south"


def calculate_green_duration(demand_score):

    duration = MIN_GREEN_SECONDS + demand_score * 0.2

    return min(int(duration), MAX_GREEN_SECONDS)


def get_signal_decision(traffic_data, current_state=None):

    current_state = current_state or {}

    current_phase = current_state.get("current_phase")

    consecutive_phases = current_state.get("consecutive_phases", 0)

    demand = calculate_demand(traffic_data)

    phase = choose_phase(traffic_data, current_phase)

    reason = "Selected based on traffic demand"

    # Maximum waiting-time protection: any direction that has
    # been waiting longer than MAX_WAIT_SECONDS gets priority,
    # even if its phase does not have the highest demand score.
    max_wait_directions = [
        direction
        for direction in DIRECTIONS
        if traffic_data[direction]["waiting_time_seconds"] >= MAX_WAIT_SECONDS
    ]

    if max_wait_directions:

        wanted_phase = (
            "north_south"
            if max_wait_directions[0] in PHASES["north_south"]
            else "east_west"
        )

        if wanted_phase != phase:
            phase = wanted_phase
            reason = (
                "Forced by max waiting-time protection for: "
                + ", ".join(max_wait_directions)
            )

    # Maximum consecutive phase protection: the same phase must
    # not be selected more than MAX_CONSECUTIVE_PHASES times in a
    # row, to guarantee fairness between North-South and East-West.
    phase_repeats = consecutive_phases

    if current_phase and phase == current_phase:

        phase_repeats = consecutive_phases + 1

        if phase_repeats > MAX_CONSECUTIVE_PHASES:
            phase = "east_west" if phase == "north_south" else "north_south"
            phase_repeats = 1
            reason = "Forced by fairness: consecutive phase limit reached"

    green_duration = max(
        calculate_green_duration(demand[phase]),
        MIN_GREEN_SECONDS
    )

    # Urgency-aware green capping: green cannot be preempted once it
    # starts, so before awarding it the controller projects whether
    # the OPPOSITE phase's longest-waiting vehicle would breach
    # MAX_WAIT_SECONDS during the new green (plus clearance). If so,
    # the green is capped so the opposing directions get their turn
    # before MAX_WAIT_SECONDS elapses. Never below MIN_GREEN_SECONDS.
    opposite_phase = (
        "east_west" if phase == "north_south" else "north_south"
    )

    opposite_worst_wait = max(
        traffic_data[direction]["waiting_time_seconds"]
        for direction in PHASES[opposite_phase]
    )

    if opposite_worst_wait > 0:

        switching = current_phase is not None and current_phase != phase

        clearance_estimate = (
            YELLOW_SECONDS + ALL_RED_SECONDS if switching else 0
        )

        projected_wait = (
            opposite_worst_wait + green_duration + clearance_estimate
        )

        if projected_wait > MAX_WAIT_SECONDS:
            capped = (
                MAX_WAIT_SECONDS
                - opposite_worst_wait
                - clearance_estimate
            )
            if capped < green_duration:
                green_duration = max(capped, MIN_GREEN_SECONDS)
                if reason == "Selected based on traffic demand":
                    reason = (
                        "Green capped: opposing wait "
                        f"{opposite_worst_wait:.0f}s projects past max wait"
                    )

    clearance = get_transition_clearance(
        current_phase,
        phase
    )

    return {
        "green_direction": phase,
        "green_directions": PHASES[phase],
        "green_duration": green_duration,
        "reason": reason,
        "demand_scores": demand,
        "phase_repeats": phase_repeats,
        "max_wait_directions": max_wait_directions,
        "yellow_duration": clearance["yellow_duration"],
        "all_red_duration": clearance["all_red_duration"],
        "mode": "adaptive"
    }


if __name__ == "__main__":

    with open(BASE_DIR / "sample_traffic.json", "r") as file:
        traffic = json.load(file)

    result = get_signal_decision(traffic)

    print(json.dumps(result, indent=4))