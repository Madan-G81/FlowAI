"""FlowAI simulation metrics.

Metric definitions (identical for fixed-time and adaptive modes):

- completed_vehicles: vehicles that exited the intersection during
  the simulation window. Queued/never-served vehicles are NOT counted.
- average_wait_seconds: completed vehicles' mean waiting time
  (waiting time = departure_second - arrival_second).
- total_wait_seconds: sum of all completed vehicles' waiting times.
- max_wait_seconds: single worst waiting time experienced by any
  completed vehicle (0 when no vehicle completed).
- remaining_vehicles: vehicles still queued when the window ends.
- throughput_per_minute: completed vehicles per simulation minute.
"""

def calculate_metrics(results, simulation_time):

    waits = results["waiting_times"]

    total_wait = sum(waits)

    completed = results["completed_vehicles"]

    minutes = simulation_time / 60 if simulation_time > 0 else 1

    average_wait = (
        total_wait / completed if completed else 0
    )

    return {
        "completed_vehicles": completed,
        "average_wait_seconds": round(average_wait, 2),
        "total_wait_seconds": round(total_wait, 2),
        "max_wait_seconds": max(waits) if waits else 0,
        "remaining_vehicles": results["remaining_vehicles"],
        "throughput_per_minute": round(completed / minutes, 2)
    }
