# FlowAI API Contract

Backend URL:
http://127.0.0.1:8000

## Traffic Input

Each direction must contain:

- vehicle_count
- queue_length
- waiting_time_seconds

Directions:
north, south, east, west

## Backend Endpoints

GET /api/health
GET /api/traffic/current
GET /api/control/decision

## Signal Decision Output

{
  "green_direction": "north",
  "green_duration": 40,
  "reason": "Highest queue length"
}

## Simulation Module

simulation/run_simulation.py:
Runs the traffic simulation.

simulation/metrics.py:
Calculates waiting time, queue length and throughput.

The current backend uses sample traffic data.
