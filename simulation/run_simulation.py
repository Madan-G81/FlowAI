
import random
from collections import deque

from metrics import calculate_metrics

DIRECTIONS = ["north", "south", "east", "west"]

# Opposing directions receive green together.
PHASES = {
    "north_south": ["north", "south"],
    "east_west": ["east", "west"]
}

SIMULATION_TIME = 300
YELLOW_TIME = 3
ALL_RED_TIME = 1


def generate_arrivals():
    random.seed(42)

    arrivals = {direction: [] for direction in DIRECTIONS}

    # More traffic from north and south in this example.
    rates = {
        "north": 0.35,
        "south": 0.25,
        "east": 0.12,
        "west": 0.10
    }

    for second in range(SIMULATION_TIME):
        for direction in DIRECTIONS:
            if random.random() < rates[direction]:
                arrivals[direction].append(second)

    return arrivals


def run_simulation(mode):
    arrivals = generate_arrivals()

    queues = {
        direction: deque()
        for direction in DIRECTIONS
    }

    results = {
        "waiting_times": [],
        "completed_vehicles": 0,
        "remaining_vehicles": 0
    }

    phase_index = 0
    green_remaining = 0
    clearance_remaining = 0
    current_phase = "north_south"

    for second in range(SIMULATION_TIME):

        # Add newly arriving vehicles.
        for direction in DIRECTIONS:
            if second in arrivals[direction]:
                queues[direction].append(second)

        # Select the next green phase.
        if green_remaining == 0 and clearance_remaining == 0:

            if mode == "fixed":
                phase_index = 1 - phase_index
                current_phase = list(PHASES.keys())[phase_index]
                green_remaining = 30

            else:
                ns_queue = (
                    len(queues["north"]) +
                    len(queues["south"])
                )

                ew_queue = (
                    len(queues["east"]) +
                    len(queues["west"])
                )

                desired_phase = (
                    "north_south"
                    if ns_queue >= ew_queue
                    else "east_west"
                )

                if desired_phase != current_phase:
                    current_phase = desired_phase
                    clearance_remaining = (
                        YELLOW_TIME + ALL_RED_TIME
                    )
                else:
                    green_remaining = 20

        elif clearance_remaining > 0:
            clearance_remaining -= 1

            if clearance_remaining == 0:
                green_remaining = 20

        # Serve vehicles during green.
        if green_remaining > 0:
            active_directions = PHASES[current_phase]

            for direction in active_directions:
                if queues[direction]:
                    arrival_time = queues[direction].popleft()

                    wait = second - arrival_time

                    results["waiting_times"].append(wait)
                    results["completed_vehicles"] += 1

            green_remaining -= 1

    results["remaining_vehicles"] = sum(
        len(queues[direction])
        for direction in DIRECTIONS
    )

    return calculate_metrics(results)


if __name__ == "__main__":
    fixed = run_simulation("fixed")
    adaptive = run_simulation("adaptive")

    print("\nFLOWAI TRAFFIC SIMULATION")
    print("=========================")

    print("\nFIXED-TIME CONTROL")
    print(fixed)

    print("\nADAPTIVE CONTROL")
    print(adaptive)
