import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from optimizer import (
    calculate_demand,
    choose_phase,
    calculate_green_duration,
    get_signal_decision
)


def sample_data():

    return {
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


def test_demand():

    demand = calculate_demand(sample_data())

    assert demand["north_south"] > demand["east_west"]


def test_phase():

    assert choose_phase(sample_data()) == "north_south"


def test_green_duration():

    assert calculate_green_duration(100) == 30


def test_signal_decision():

    result = get_signal_decision(sample_data())

    assert result["green_direction"] == "north_south"


def test_clearance():

    result = get_signal_decision(
        sample_data(),
        {"current_phase": "east_west"}
    )

    assert result["yellow_duration"] == 3
    assert result["all_red_duration"] == 1