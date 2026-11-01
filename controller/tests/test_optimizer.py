import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from optimizer import (
    calculate_demand,
    choose_phase,
    calculate_green_duration,
    get_signal_decision,
    MIN_GREEN_SECONDS,
    MAX_GREEN_SECONDS,
    YELLOW_SECONDS,
    ALL_RED_SECONDS
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


# ---- Phase 1 additions ----

def empty_data():

    return {
        direction: {
            "vehicle_count": 0,
            "queue_length": 0,
            "waiting_time_seconds": 0
        }
        for direction in ("north", "south", "east", "west")
    }


def east_west_data():

    data = empty_data()

    data["east"] = {
        "vehicle_count": 30,
        "queue_length": 15,
        "waiting_time_seconds": 25
    }
    data["west"] = {
        "vehicle_count": 24,
        "queue_length": 10,
        "waiting_time_seconds": 20
    }

    return data


def test_high_north_south_demand():

    assert get_signal_decision(sample_data())["green_direction"] == "north_south"


def test_high_east_west_demand():

    assert get_signal_decision(east_west_data())["green_direction"] == "east_west"


def test_max_waiting_time_protection():

    data = east_west_data()

    # North has hit the maximum wait, but demand still favors East-West.
    data["north"]["waiting_time_seconds"] = 61

    result = get_signal_decision(data)

    assert result["green_direction"] == "north_south"
    assert "north" in result["max_wait_directions"]
    assert "max waiting-time" in result["reason"]


def test_consecutive_phase_limit():

    # East-West demand is higher, but North-South was already
    # selected MAX_CONSECUTIVE_PHASES times in a row.
    result = get_signal_decision(
        sample_data(),
        {
            "current_phase": "north_south",
            "consecutive_phases": 2
        }
    )

    assert result["green_direction"] == "east_west"


def test_equal_demand_keeps_current_phase():

    result = get_signal_decision(
        empty_data(),
        {"current_phase": "east_west"}
    )

    assert result["green_direction"] == "east_west"


def test_equal_demand_without_state():

    result = get_signal_decision(empty_data())

    assert result["green_direction"] == "north_south"


def test_empty_queues():

    result = get_signal_decision(empty_data())

    assert result["green_duration"] == MIN_GREEN_SECONDS
    assert result["yellow_duration"] == 0
    assert result["all_red_duration"] == 0


def test_green_duration_bounds():

    # Very large demand must still respect the maximum green length.
    data = sample_data()
    data["north"]["vehicle_count"] = 1000
    data["north"]["queue_length"] = 1000
    data["north"]["waiting_time_seconds"] = 1000

    result = get_signal_decision(data)

    assert MIN_GREEN_SECONDS <= result["green_duration"] <= MAX_GREEN_SECONDS
    assert result["green_duration"] == MAX_GREEN_SECONDS


def test_safe_transition_when_forced():

    # Forced switching from East-West to North-South must include clearance.
    data = east_west_data()
    data["north"]["waiting_time_seconds"] = 70

    result = get_signal_decision(
        data,
        {"current_phase": "east_west"}
    )

    assert result["green_direction"] == "north_south"
    assert result["yellow_duration"] == YELLOW_SECONDS
    assert result["all_red_duration"] == ALL_RED_SECONDS


def test_no_clearance_when_phase_continues():

    result = get_signal_decision(
        sample_data(),
        {"current_phase": "north_south", "consecutive_phases": 1}
    )

    assert result["green_direction"] == "north_south"
    assert result["yellow_duration"] == 0
    assert result["all_red_duration"] == 0
    assert result["phase_repeats"] == 2


# ---- Phase 3 additions: urgency-aware green capping ----

def capped_scenario(opposite_wait, opposite_arrivals=0):

    data = empty_data()

    # Heavy demand on North-South, urgent queue on the East approach.
    data["north"] = {
        "vehicle_count": 30,
        "queue_length": 15,
        "waiting_time_seconds": 10
    }
    data["east"] = {
        "vehicle_count": opposite_arrivals,
        "queue_length": 5,
        "waiting_time_seconds": opposite_wait
    }

    return data


def test_urgency_capping_limits_green():

    data = capped_scenario(opposite_wait=50)

    result = get_signal_decision(
        data,
        {"current_phase": "east_west", "consecutive_phases": 1}
    )

    # Uncapped demand-based green would be 45s. Switch to north_south
    # pays 3+1 clearance: projected east wait = 50 + 45 + 4 = 99 > 60.
    # Cap = 60 - 50 - 4 = 6 -> raised to MIN_GREEN_SECONDS (10).
    assert result["green_direction"] == "north_south"
    assert result["green_duration"] == MIN_GREEN_SECONDS


def test_urgency_capping_respects_min_green():

    data = capped_scenario(opposite_wait=59)

    result = get_signal_decision(
        data,
        {"current_phase": None}
    )

    # Cap would be 60 - 59 - 0 = 1s, but never below the minimum.
    assert result["green_duration"] == MIN_GREEN_SECONDS


def test_urgency_capping_partial_reduction():

    data = capped_scenario(opposite_wait=20)

    result = get_signal_decision(
        data,
        {"current_phase": None}
    )

    # Demand score = 15*5 + 30*2 + 10 = 145 -> uncapped green 39s.
    # Switch clearance = 0 at startup; projected = 20 + 39 = 59 <= 60.
    assert result["green_duration"] == calculate_green_duration(145)


def test_no_urgency_capping_when_opposite_idle():

    data = capped_scenario(opposite_wait=0)

    result = get_signal_decision(
        data,
        {"current_phase": None}
    )

    # Opposite approach has no waiting vehicles -> full demand green.
    assert result["green_duration"] == calculate_green_duration(145)


def test_capping_reason_reported_when_no_forced_reason():

    data = capped_scenario(opposite_wait=45)

    result = get_signal_decision(
        data,
        {"current_phase": "east_west", "consecutive_phases": 1}
    )

    # Uncapped: 45 + 4 clearance + 45 = 94 > 60 -> cap = 11 -> green 11.
    assert result["green_duration"] == MIN_GREEN_SECONDS + 1
    assert "capped" in result["reason"]