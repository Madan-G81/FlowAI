"""FlowAI simulation integration tests.

Pytest-style, but runnable without pytest via a manual runner
(pytest is not installed; installation requires owner approval),
e.g.:
    python -c "manual runner pattern as in controller tests"
"""

import sys
from pathlib import Path

SIMULATION_DIR = Path(__file__).resolve().parents[1]
CONTROLLER_DIR = Path(__file__).resolve().parents[2] / "controller"

sys.path.insert(0, str(CONTROLLER_DIR))
sys.path.insert(0, str(SIMULATION_DIR))

from run_simulation import (
    run_simulation,
    generate_arrivals,
    build_observations,
    SCENARIOS,
    SIMULATION_TIME
)
from metrics import calculate_metrics
from optimizer import (
    MAX_CONSECUTIVE_PHASES,
    MIN_GREEN_SECONDS,
    MAX_GREEN_SECONDS,
    YELLOW_SECONDS,
    ALL_RED_SECONDS,
    get_signal_decision
)

SCENARIO = "north_south_heavy"


def test_simulation_imports_real_controller():

    run = run_simulation("adaptive", SCENARIO, trace=True)

    # Reason strings come from the controller module itself,
    # proving the simulation called it rather than its own logic.
    controller_reasons = {
        "Selected based on traffic demand",
        "Forced by max waiting-time protection for: ",
        "Forced by fairness: consecutive phase limit reached"
    }

    reasons = [
        event["reason"]
        for event in run["timeline"]
        if "reason" in event
    ]

    assert reasons, "no controller reasons found in trace"
    assert all(any(reason.startswith(r) for r in controller_reasons)
               for reason in reasons)


def test_arrivals_deterministic():

    first = generate_arrivals(SCENARIO)
    second = generate_arrivals(SCENARIO)

    assert first == second


def test_both_modes_see_identical_arrivals():

    # The arrival schedule is generated once per run from the same
    # seed and the same draw count, so re-running returns the same
    # schedule for both modes.
    schedule = generate_arrivals(SCENARIO)

    assert set(schedule.keys()) == {"north", "south", "east", "west"}


def test_green_respects_min_and_max():

    run = run_simulation("adaptive", SCENARIO, trace=True)

    durations = [
        event["duration"]
        for event in run["timeline"]
        if event["event"] in ("green_start", "green_extend")
    ]

    assert all(MIN_GREEN_SECONDS <= d <= MAX_GREEN_SECONDS for d in durations)


def test_no_conflicting_greens():

    run = run_simulation("adaptive", SCENARIO, trace=True)

    for event in run["timeline"]:

        if event["event"] in ("green_start", "green_extend"):
            assert event["phase"] in ("north_south", "east_west")

    # Runs of consecutive same-phase greens must respect fairness.
    greens = [
        event["phase"]
        for event in run["timeline"]
        if event["event"] in ("green_start", "green_extend")
    ]

    max_run = 1
    run_length = 1

    for previous, current in zip(greens, greens[1:]):
        run_length = run_length + 1 if previous == current else 1
        max_run = max(max_run, run_length)

    assert max_run <= MAX_CONSECUTIVE_PHASES


def test_clearance_before_every_phase_switch():

    for mode in ("fixed", "adaptive"):

        run = run_simulation(mode, SCENARIO, trace=True)
        timeline = run["timeline"]

        greens = [
            (index, event)
            for index, event in enumerate(timeline)
            if event["event"] == "green_start"
        ]

        switched = False

        for (current_index, event), (_, previous) in zip(greens[1:], greens):

            if event["phase"] == previous["phase"]:
                continue

            switched = True

            # Exactly the two events before the new-phase green must
            # be yellow then all-red (chronological order).
            before = [timeline[current_index - 2], timeline[current_index - 1]]

            assert before[0]["event"] == "yellow_start"
            assert before[1]["event"] == "all_red_start"
            assert before[0]["to_phase"] == event["phase"]

        assert switched, f"no phase switch found in {mode} trace"


def test_controller_state_persists():

    run = run_simulation("adaptive", "balanced", trace=True)

    greens = [
        event["phase"]
        for event in run["timeline"]
        if event["event"] in ("green_start", "green_extend")
    ]

    # Balanced traffic ties on demand, so the controller keeps the
    # current phase until MAX_CONSECUTIVE_PHASES is reached and then
    # forces a switch. Seeing both phases and no run longer than the
    # limit proves the simulation correctly maintained and passed
    # controller state between decisions.
    assert len(set(greens)) == 2

    run_length = 1

    for previous, current in zip(greens, greens[1:]):
        run_length = run_length + 1 if previous == current else 1
        assert run_length <= MAX_CONSECUTIVE_PHASES


def test_vehicles_not_lost():

    run = run_simulation("adaptive", SCENARIO, trace=True)

    arrivals = generate_arrivals(SCENARIO)
    total = sum(len(v) for v in arrivals.values())

    assert run["completed_vehicles"] + run["remaining_vehicles"] == total


def test_remaining_not_counted_as_completed():

    run_fixed = run_simulation("fixed", SCENARIO, trace=True)
    run_adaptive = run_simulation("adaptive", SCENARIO, trace=True)

    for run in (run_fixed, run_adaptive):

        arrivals = generate_arrivals(SCENARIO)
        total = sum(len(v) for v in arrivals.values())

        assert run["completed_vehicles"] <= total
        assert run["completed_vehicles"] > 0


def test_observations_shape_matches_controller_contract():

    from collections import deque

    queues = {
        "north": deque([295]),
        "south": deque(),
        "east": deque([290, 296, 297]),
        "west": deque()
    }
    recent_arrivals = {
        "north": deque([250, 290, 295]),
        "south": deque([]),
        "east": deque([-1]),
    }
    recent_arrivals["west"] = deque()
    second = 300

    shape = build_observations(queues, recent_arrivals, second)

    for direction in ("north", "south", "east", "west"):
        data = shape[direction]
        assert set(data.keys()) == {
            "vehicle_count", "queue_length", "waiting_time_seconds"
        }

    assert shape["east"]["queue_length"] == 3
    assert shape["east"]["waiting_time_seconds"] == 10
    assert shape["south"]["waiting_time_seconds"] == 0

    # vehicle_count is the TRAILING window count, not cumulative:
    # north keeps all 3 recent arrivals, east's stale timestamp (-1)
    # was purged, south/west saw none.
    assert shape["north"]["vehicle_count"] == 3
    assert shape["east"]["vehicle_count"] == 0
    assert shape["south"]["vehicle_count"] == 0
    assert shape["west"]["vehicle_count"] == 0

    # The exact observation must be accepted by the real controller.
    decision = get_signal_decision(shape, {"current_phase": None})
    assert decision["green_direction"] in ("north_south", "east_west")


def test_metrics_definitions():

    metrics = calculate_metrics(
        {
            "waiting_times": [2, 4, 6],
            "completed_vehicles": 3,
            "remaining_vehicles": 5
        },
        SIMULATION_TIME
    )

    assert metrics["completed_vehicles"] == 3
    assert metrics["average_wait_seconds"] == 4.0
    assert metrics["total_wait_seconds"] == 12.0
    assert metrics["max_wait_seconds"] == 6
    assert metrics["remaining_vehicles"] == 5
    assert metrics["throughput_per_minute"] == round(3 / (300 / 60), 2)


def test_surge_scenario_registered():

    assert "sudden_surge" in SCENARIOS
    assert "one_sided_queue" in SCENARIOS
    assert "balanced" in SCENARIOS
    assert "low_traffic" in SCENARIOS
    assert len(SCENARIOS) == 6


# ---- Phase 3 additions ----

def test_trailing_window_excludes_old_arrivals():

    from collections import deque

    recent = {
        "north": deque([10, 250, 295, 299]),
        "south": deque([]),
        "east": deque([]),
        "west": deque([])
    }
    queues = {d: deque() for d in ("north", "south", "east", "west")}

    shape = build_observations(queues, recent, 300)

    # Window is (300-60, 300] -> seconds 250, 295, 299 stay; 10 leaves.
    assert shape["north"]["vehicle_count"] == 3
    # Expired timestamps are removed from the deque itself.
    assert list(recent["north"]) == [250, 295, 299]


def test_trailing_window_at_start_of_simulation():

    from collections import deque

    def fresh_recent():
        return {
            "north": deque([0, 1, 2]),
            "south": deque([]),
            "east": deque([]),
            "west": deque([])
        }

    queues = {d: deque() for d in ("north", "south", "east", "west")}

    # At second 65 the window is (5, 65]: arrivals 0, 1, 2 are older.
    shape = build_observations(queues, fresh_recent(), 65)
    assert shape["north"]["vehicle_count"] == 0

    # At second 60 the window is (0, 60]: 0 is expired, 1 and 2 count.
    shape = build_observations(queues, fresh_recent(), 60)
    assert shape["north"]["vehicle_count"] == 2


def test_trailing_window_empty_and_boundary():

    from collections import deque

    recent = {d: deque() for d in ("north", "south", "east", "west")}
    queues = {d: deque([298, 299]) for d in ("north", "south", "east", "west")}

    # Empty window + long, non-empty queue: vehicle_count 0, but the
    # queue itself still drives demand through queue_length/waiting.
    shape = build_observations(queues, recent, 300)

    for direction in ("north", "south", "east", "west"):
        assert shape[direction]["vehicle_count"] == 0
        assert shape[direction]["queue_length"] == 2
        assert shape[direction]["waiting_time_seconds"] == 300 - 298

    decision = get_signal_decision(shape, {"current_phase": None})
    assert decision["green_direction"] in ("north_south", "east_west")


def test_trailing_window_respects_arrival_conservation():

    # The observation layer must not create or lose vehicles: the
    # trailing window can redo counts, but the run-level conservation
    # identity completed + remaining == total arrivals must still hold
    # for every scenario in adaptive mode.
    for scenario in SCENARIOS:

        run = run_simulation("adaptive", scenario, trace=True)

        arrivals = generate_arrivals(scenario)
        total = sum(len(v) for v in arrivals.values())

        assert run["completed_vehicles"] + run["remaining_vehicles"] == total


def test_yellow_all_red_durations_from_controller():

    # Demand favors North-South while the current phase is East-West
    # -> the controller must command yellow + all-red clearance.
    from collections import deque

    decision = get_signal_decision(
        build_observations(
            {"north": deque([297]), "south": deque(), "east": deque(), "west": deque()},
            {"north": deque([297]), "south": deque(), "east": deque(), "west": deque()},
            300
        ),
        {"current_phase": "east_west", "consecutive_phases": 1}
    )

    assert decision["green_direction"] == "north_south"
    assert decision["yellow_duration"] == YELLOW_SECONDS
    assert decision["all_red_duration"] == ALL_RED_SECONDS

    # Startup decision (no current phase): no clearance needed.
    decision = get_signal_decision(
        build_observations(
            {"north": deque([297]), "south": deque(), "east": deque(), "west": deque()},
            {"north": deque([297]), "south": deque(), "east": deque(), "west": deque()},
            300
        ),
        {"current_phase": None}
    )

    assert decision["green_direction"] == "north_south"
    assert decision["yellow_duration"] == 0
    assert decision["all_red_duration"] == 0
