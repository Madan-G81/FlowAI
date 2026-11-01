# FlowAI API Contract

Base URL: http://127.0.0.1:8000 (or 8010/any free port)
Interactive docs: GET /docs

## Data-source contract

Responses that can mix demo and real data always carry a
`data_source` field:

- `"sample"` - hardcoded demo observations (NOT live traffic)
- `"caller_observations"` - decision computed from full supplied
  observations
- `"simulation"` - results from the real simulation module

## Traffic observations (input format)

Each direction must contain (all >= 0):

- `vehicle_count` — vehicles that ARRIVED in the trailing 60-second
  window (RECENT_WINDOW_SECONDS), NOT cumulative
- `queue_length`
- `waiting_time_seconds`

Directions: north, south, east, west

- Modes: `fixed`, `adaptive`
- Scenarios: `north_south_heavy`, `east_west_heavy`, `balanced`,
  `low_traffic`, `sudden_surge`, `one_sided_queue`

## Endpoints

### GET /
App + endpoint information and API status.
```json
{"project": "FlowAI", "api_status": "operational", "endpoints": ["..."]}
```

### GET /api/health
```json
{"status": "healthy"}
```

### GET /api/traffic/current
```json
{
  "data_source": "sample",
  "source_label": "Hardcoded sample observations (NOT live traffic)",
  "observations": {
    "north": {"vehicle_count": 24, "queue_length": 12,
              "waiting_time_seconds": 35},
    "south": {"vehicle_count": 18, "queue_length": 8,
              "waiting_time_seconds": 22},
    "east":  {"vehicle_count": 8, "queue_length": 3,
              "waiting_time_seconds": 10},
    "west":  {"vehicle_count": 4, "queue_length": 2,
              "waiting_time_seconds": 7}
  }
}
```

### GET /api/control/decision
Query parameters: all 12 numeric observation fields
(`<direction>_vehicle_count`, `<direction>_queue_length`,
`<direction>_waiting_time`) + optional `current_phase`
(`north_south|east_west`) + optional `consecutive_phases` (>= 0).

- With NO observation params -> the well-known SAMPLE decision is
  returned, labeled:
```json
{
  "green_direction": "north_south",
  "green_directions": ["north", "south"],
  "green_duration": 45,
  "reason": "Selected based on traffic demand",
  "demand_scores": {"north_south": 241.0, "east_west": 66.0},
  "phase_repeats": 0, "max_wait_directions": [],
  "yellow_duration": 0, "all_red_duration": 0,
  "mode": "adaptive",
  "data_source": "sample",
  "warning": "No live observations were supplied; ..."
}
```
- With ALL 12 provided -> real decision, `"data_source":
  "caller_observations"` (same fields; `reason` may be a forced
  rule like `Forced by max waiting-time protection for: north`).
- Partial observation -> 422:
```json
{"detail": {
  "error": "incomplete_observations",
  "message": "When live observations are supplied, ALL of the 12
              numeric fields must be provided.",
  "missing_fields": ["north.waiting_time", "..."]}}
```
- Negative `consecutive_phases` -> 422
  `{"error": "invalid_state"}`.

### POST /api/control/decision
Body:
```json
{
  "observations": {
    "north":   {"vehicle_count": 30, "queue_length": 15, "waiting_time_seconds": 70},
    "south":   {"vehicle_count": 0,  "queue_length": 0,  "waiting_time_seconds": 0},
    "east":    {"vehicle_count": 5,  "queue_length": 2,  "waiting_time_seconds": 10},
    "west":    {"vehicle_count": 0,  "queue_length": 0,  "waiting_time_seconds": 0}
  },
  "state": {"current_phase": "east_west", "consecutive_phases": 1}
}
```
Response: the real controller decision plus
`"data_source": "caller_observations"` (with
`max_wait_directions` set when ≥60s waits are observed).
Invalid JSON/negative numbers/unknown fields -> 422 (Pydantic).

### POST /api/simulation/run
Body: `{"mode": "adaptive", "scenario": "north_south_heavy"}`
Response (metrics are REAL simulation output):
```json
{
  "mode": "adaptive",
  "mode_label": "Adaptive (real controller)",
  "scenario": "north_south_heavy",
  "simulation_time_seconds": 300,
  "metrics": {
    "completed_vehicles": 172,
    "average_wait_seconds": 8.49,
    "total_wait_seconds": 1460,
    "max_wait_seconds": 52,
    "remaining_vehicles": 29,
    "throughput_per_minute": 34.4
  }
}
```
Unknown mode/scenario -> 422 with Pydantic literal_error detail.

### GET /api/simulation/scenarios
```json
{
  "modes": ["fixed", "adaptive"],
  "scenarios": [{"name": "north_south_heavy", "label": "..."}],
  "simulation_time_seconds": 300
}
```

### GET /api/simulation/compare
Query: optional `scenario` (omit for ALL scenarios).
Per scenario, fixed and adaptive run on IDENTICAL deterministic
arrivals (simulation seed 42); each result is labeled by mode.
```json
{
  "data_source": "simulation",
  "scenario": "one_sided_queue",
  "scenario_label": "Long waiting queue from the West approach",
  "fixed": {
    "mode": "fixed", "mode_label": "Fixed-time schedule",
    "metrics": {"completed_vehicles": 156, "average_wait_seconds": 57.77,
                "total_wait_seconds": 9012, "max_wait_seconds": 116,
                "remaining_vehicles": 106, "throughput_per_minute": 31.2}
  },
  "adaptive": {
    "mode": "adaptive", "mode_label": "Adaptive (real controller)",
    "metrics": {"completed_vehicles": 226, "average_wait_seconds": 32.5,
                "total_wait_seconds": 7344, "max_wait_seconds": 65,
                "remaining_vehicles": 36, "throughput_per_minute": 45.2}
  },
  "note": "Both modes consumed IDENTICAL deterministic arrivals."
}
```
For all scenarios: `{"data_source": "simulation",
"comparisons": [ ...same objects... ]}`.
Unknown scenario -> 422 literal_error.

## Errors

- 422: validation errors (mode, scenario, missing/negative fields)
- 500: unexpected controller/simulation failure
  (`Simulation failed: <ExceptionType>: <message>`)
- Backend never crashes on simulation errors; FastAPI continues
  serving.

## Simulation Module

simulation/run_simulation.py: adaptive mode obtains ALL signal
decisions from controller/optimizer.py (get_signal_decision);
owns controller state {"current_phase", "consecutive_phases"};
applies returned green / yellow / all-red durations itself.
simulation/metrics.py: exact metric definitions in
simulation/README.md.
vehicle_count in observations = trailing-60s window count.
