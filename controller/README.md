# FlowAI Traffic Controller

## Purpose

Decides which axis (North-South or East-West) gets green, for how long, and
what clearance (yellow / all-red) is needed to switch phases safely.

## Public API

```python
from optimizer import get_signal_decision

decision = get_signal_decision(traffic_data, current_state)
```

### Input 1: `traffic_data` (dict)

Same shape as `sample_traffic.json` — one entry per direction.
`vehicle_count` is the number of vehicles that ARRIVED within the most
recent `RECENT_WINDOW_SECONDS` (60s) window, not a cumulative total
(since Phase 3). Expired timestamps are purged by the CALLER's
observation layer (`simulation/run_simulation.py: build_observations`).

```json
{
    "north": {"vehicle_count": 24, "queue_length": 12, "waiting_time_seconds": 35},
    "south": {"vehicle_count": 18, "queue_length": 8,  "waiting_time_seconds": 22},
    "east":  {"vehicle_count": 8,  "queue_length": 3,  "waiting_time_seconds": 10},
    "west":  {"vehicle_count": 4,  "queue_length": 2,  "waiting_time_seconds": 7}
}
```

### Input 2: `current_state` (dict, optional)

Controller state kept by the CALLER (simulation or backend), never stored by
the controller itself:

| Key | Type | Meaning |
|---|---|---|
| `current_phase` | `"north_south"` \| `"east_west"` \| `None` | Phase that is currently green. `None` on startup. |
| `consecutive_phases` | int | How many times in a row `current_phase` was selected. Defaults to 0. |

### Output: `decision` (dict)

| Key | Meaning |
|---|---|
| `green_direction` | `north_south` or `east_west` |
| `green_directions` | List of directions served, e.g. `["north", "south"]` |
| `green_duration` | Seconds of green, clamped to `[MIN_GREEN_SECONDS, MAX_GREEN_SECONDS]` (10\u201345s) |
| `reason` | `"Selected based on traffic demand"` or forced reason (max wait / fairness) |
| `phase_repeats` | Consecutive selection count the caller should store for the phase AFTER this green ends (1 when switching) |
| `max_wait_directions` | Directions currently protected by max waiting time |
| `yellow_duration` | 3s when switching phases, else 0 |
| `all_red_duration` | 1s when switching phases, else 0 |
| `demand_scores` | Weighted demand per phase (weights: queue 5, count 2, wait 1) |
| `mode` | Always `"adaptive"` |

### Rules implemented

1. Demand scoring: `QUEUE_WEIGHT*queue_length + VEHICLE_WEIGHT*vehicle_count + WAITING_WEIGHT*waiting_time_seconds`
   where `vehicle_count` counts arrivals in the trailing 60s window.
2. Max waiting-time protection: any direction waiting >= `MAX_WAIT_SECONDS` (60s) forces its phase.
3. Fairness: any phase cannot be repeated more than `MAX_CONSECUTIVE_PHASES` (2) times in a row.
4. Equal demand keeps the current phase (no needless clearance).
5. Safe transitions: yellow 3s + all-red 1s only when the phase changes.
6. Urgency-aware green capping (Phase 3): since an in-progress green
   cannot be preempted, before awarding a green the controller
   projects the OPPOSITE phase's longest wait at the end of that
   green (opposite wait + green + clearance). If it would breach
   `MAX_WAIT_SECONDS`, the green is capped (never below
   `MIN_GREEN_SECONDS`) so the opposing axis gets its turn sooner.
   This does NOT guarantee every vehicle waits < 60s - clearance
   time and vehicles still queued can push an individual wait
   slightly above it (e.g. 65s observed in simulation).

## Interface the simulation must use to call the controller

(For Phase 4 integration \u2014 the simulation currently duplicates this logic.)

```python
# One-time setup in the simulation module
import sys
from pathlib import Path
CONTROLLER_DIR = Path(__file__).resolve().parents[1] / "controller"
sys.path.insert(0, str(CONTROLLER_DIR))

from optimizer import get_signal_decision
from safety import get_transition_clearance
```

Per signal-state change in the simulation loop (when green and clearance
are both exhausted):

```python
# Build traffic_data from live simulation queues:
# vehicle_count = arrivals in the trailing 60s window
# (RECENT_WINDOW_SECONDS); build_observations purges expired
# timestamps from these deques.
traffic_data = {
    d: {
        "vehicle_count": n_arrivals_last_60s[d],
        "queue_length": len(queues[d]),
        "waiting_time_seconds": max((now - t) for t in queues[d], default=0)
    }
    for d in ("north", "south", "east", "west")
}

decision = get_signal_decision(traffic_data, controller_state)

# Apply the decision:
new_phase = decision["green_direction"]
green_duration = decision["green_duration"]
# If decision["yellow_duration"] > 0: run yellow then all-red first.

# Persist state for the next call - keep controller_state OUT of the loop:
if new_phase == controller_state.get("current_phase"):
    controller_state["consecutive_phases"] += 1
else:
    controller_state["current_phase"] = new_phase
    controller_state["consecutive_phases"] = 1
```

Error handling: `safety.get_transition_clearance` raises `ValueError` for
invalid phase names \u2014 callers may catch it or let it crash loudly.

Run standalone (works from repo root or controller folder):
`python controller/optimizer.py`

## Tests

```bash
pytest controller/tests/            # once pytest is installed
python controller/tests/test_optimizer.py   # or run manually without pytest
```
