# FlowAI Traffic Simulation

## What this is

A custom Python, one-vehicle-per-second, four-way intersection
simulation (30x300 discrete seconds). It is NOT a SUMO simulation.
Software only - not connected to any real, public-road traffic light.

## How it works

1. **Arrivals** - synthetic vehicles are generated second by second
   from a deterministic schedule (`generate_arrivals`, seeded
   `random.Random(42)`), so that fixed-time and adaptive runs of the
   same scenario see EXACTLY the same vehicles.
2. **Queues** - arrivals are appended to per-direction FIFO queues
   (`north`, `south`, `east`, `west`).
3. **Signal state machine** - `green -> yellow (3s) -> all-red (1s)
   -> green ...`
   - Only the two directions of the active phase depart during green
     (at most one vehicle per second per direction).
   - Phase switches ALWAYS run the full yellow + all-red clearance
     - both in fixed-time and adaptive mode.
   - Arrivals keep happening during yellow and all-red.
4. **Decisions**
   - Fixed mode: the phases strictly alternate, 30s green each.
   - Adaptive mode: the simulation asks the REAL controller
     (`controller/optimizer.py`, function `get_signal_decision`)
     every time a green expires. The simulation contains NO
     decision-making logic.

## How the simulation calls the controller

```python
# run_simulation.py imports the actual module (once):
CONTROLLER_DIR = Path(__file__).resolve().parents[1] / "controller"
sys.path.insert(0, str(CONTROLLER_DIR))
from optimizer import get_signal_decision
from config import YELLOW_SECONDS, ALL_RED_SECONDS

# Every time a green ends:
decision = get_signal_decision(
    build_observations(queues, total_arrivals, second),
    controller_state          # {"current_phase", "consecutive_phases"}
)

# Applied decision:
#  decision["green_direction"]        -> next phase
#  decision["green_duration"]         -> green length (10-45s)
#  decision["yellow_duration"]        -> 3s clearance before switch
#  decision["all_red_duration"]       -> 1s clearance before switch
# The state dict is updated by the simulation and passed back on
# every subsequent call (see controller/README.md).
```

### Traffic observations given to the controller

Per direction:

- `vehicle_count` — vehicles that arrived within the trailing
  `RECENT_WINDOW_SECONDS = 60` seconds window (`build_observations`
  purges expired timestamps from per-direction deques via
  `popleft()`; the deques are the single source being sampled).
  NOT a cumulative total.
- `queue_length` — current FIFO queue length.
- `waiting_time_seconds` — the wait (in seconds) of the vehicle
  that has been queued longest, 0 if none.

## Scenarios

`SCENARIOS` in `run_simulation.py` defines six rates-based scenarios:
`north_south_heavy`, `east_west_heavy`, `balanced`, `low_traffic`,
`sudden_surge` (rate jump at t=120s), `one_sided_queue` (long queue
from the West). Each scenario is just per-direction arrival
probabilities over time periods.

## How to run

```bash
# Compare fixed-time vs adaptive for ALL scenarios:
python simulation/run_simulation.py

# Single run:
python simulation/run_simulation.py adaptive north_south_heavy
# (args: mode scenario)
```

## Input / output formats

`run_simulation(mode="adaptive", scenario="north_south_heavy",
trace=False)` returns a dict:

```json
{
    "mode": "adaptive",
    "scenario": "north_south_heavy",
    "completed_vehicles": 197,
    "average_wait_seconds": 10.59,
    "total_wait_seconds": 2087,
    "max_wait_seconds": 81,
    "remaining_vehicles": 4,
    "throughput_per_minute": 39.4,
    "timeline": []   // only when trace=true
}
```

`timeline` (with `trace=True`) is a list of signal events:
`green_start` / `green_extend` / `yellow_start` / `all_red_start`.

## Metric definitions

- **completed_vehicles** - vehicles that actually exited during the
  300s window (queued leftovers are NOT counted).
- **average_wait_seconds** - mean (departure_second - arrival_second)
  over completed vehicles only.
- **total_wait_seconds** - the sum of those waits.
- **max_wait_seconds** - single worst wait among completed vehicles.
- **remaining_vehicles** - still queued when the window ends.
- **throughput_per_minute** - completed vehicles / 5 minutes.

## Current limitations (known and documented, not hidden)

1. Departure capacity is fixed at 1 vehicle/second/direction (no
   saturation-flow modelling, no car-following physics).
2. Balance, measured after the Phase-3 fixes (2026-11-01 runs):
   adaptive wins on `north_south_heavy`, `east_west_heavy`,
   `low_traffic` and `one_sided_queue` (average wait), and roughly
   matches fixed time on `balanced` (better completed/remaining,
   slightly worse average wait). It still LOSES on `sudden_surge` -
   both modes saturate and adaptive pays more clearance overhead
   plus fairness/max-wait-forced switches. Honest, not tuned.
3. The controller is only consulted BETWEEN greens - it cannot
   preempt an in-progress green. The Phase-3 urgency-aware green
   capping projects opposite-axis waits before awarding green, which
   narrows the breach a lot, but a strict sub-60s per-vehicle
   maximum is NOT guaranteed (65s observed in one_sided_queue).
4. The 300s window end can strand queued vehicles (e.g. 29 remaining
   in north_south_heavy adaptive vs 2 fixed) - a window-truncation
   artifact: fixed-time's last green may be lucky. Compare average
   waits, not only completed counts.
5. Multiple intersections/turning movements are out of scope.

## Tests

```bash
# Integration tests (pytest-style; run manually without pytest):
python -c "..."   # manual discovery runner, see PHASE_2_REPORT.txt
```

17 integration tests cover: real-controller usage, deterministic and
identical arrivals across modes, green duration bounds, no
conflicting greens, fairness limits, full clearance before every
phase switch, controller-state persistence, vehicle conservation
(completed + remaining == total arrivals), trailing-window counting,
expired-timestamp purging, empty-window/queue boundaries,
observation format compatibility with the controller contract, and
metric definitions.
