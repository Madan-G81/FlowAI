from config import PHASES, YELLOW_SECONDS, ALL_RED_SECONDS


def validate_phase(phase):

    if phase not in PHASES:
        raise ValueError("Invalid traffic phase")

    return phase


def get_transition_clearance(current_phase, next_phase):

    validate_phase(next_phase)

    if current_phase is None:
        return {
            "yellow_duration": 0,
            "all_red_duration": 0
        }

    validate_phase(current_phase)

    if current_phase == next_phase:
        return {
            "yellow_duration": 0,
            "all_red_duration": 0
        }

    return {
        "yellow_duration": YELLOW_SECONDS,
        "all_red_duration": ALL_RED_SECONDS
    }