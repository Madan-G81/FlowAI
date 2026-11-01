# FlowAI Traffic Controller Configuration

# Demand calculation weights
QUEUE_WEIGHT = 5.0
VEHICLE_WEIGHT = 2.0
WAITING_WEIGHT = 1.0

# Traffic signal timing
MIN_GREEN_SECONDS = 10
MAX_GREEN_SECONDS = 45

YELLOW_SECONDS = 3
ALL_RED_SECONDS = 1

# Maximum waiting time
MAX_WAIT_SECONDS = 60

# Fairness control
MAX_CONSECUTIVE_PHASES = 2

# Traffic directions
DIRECTIONS = ["north", "south", "east", "west"]

# Traffic signal phases
PHASES = {
    "north_south": ["north", "south"],
    "east_west": ["east", "west"]
}