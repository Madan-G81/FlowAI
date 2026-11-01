from config import *
from safety import get_transition_clearance


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


def choose_phase(traffic_data):

    demand = calculate_demand(traffic_data)

    if demand["north_south"] > demand["east_west"]:
        return "north_south"

    return "east_west"


def calculate_green_duration(demand_score):

    duration = MIN_GREEN_SECONDS + demand_score * 0.2

    return min(int(duration), MAX_GREEN_SECONDS)


def get_signal_decision(traffic_data, current_state=None):

    demand = calculate_demand(traffic_data)

    phase = choose_phase(traffic_data)

    duration = calculate_green_duration(demand[phase])

    current_phase = None

    if current_state:
        current_phase = current_state.get("current_phase")

    clearance = get_transition_clearance(
        current_phase,
        phase
    )

    return {
        "green_direction": phase,
        "green_directions": PHASES[phase],
        "green_duration": duration,
        "reason": "Selected based on traffic demand",
        "demand_scores": demand,
        "yellow_duration": clearance["yellow_duration"],
        "all_red_duration": clearance["all_red_duration"],
        "mode": "adaptive"
    }


if __name__ == "__main__":

    import json

    with open("sample_traffic.json", "r") as file:
        traffic = json.load(file)

    result = get_signal_decision(traffic)

    print(json.dumps(result, indent=4))