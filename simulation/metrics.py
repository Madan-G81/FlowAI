
def calculate_metrics(results):
    total_wait = sum(results["waiting_times"])

    completed = results["completed_vehicles"]

    average_wait = (
        total_wait / completed if completed else 0
    )

    return {
        "completed_vehicles": completed,
        "average_wait_seconds": round(average_wait, 2),
        "total_wait_seconds": round(total_wait, 2),
        "remaining_vehicles": results["remaining_vehicles"]
    }
