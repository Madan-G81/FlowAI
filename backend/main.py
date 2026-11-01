
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="FlowAI",
    description="AI-Powered Adaptive Traffic Control System",
    version="1.0.0"
)

# Allow our frontend to communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Development only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Temporary sample traffic data
traffic_data = {
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


@app.get("/")
def home():
    return {
        "project": "FlowAI",
        "message": "Backend is running successfully"
    }


@app.get("/api/health")
def health():
    return {"status": "healthy"}


@app.get("/api/traffic/current")
def get_traffic():
    return traffic_data


@app.get("/api/control/decision")
def get_decision():

    # Find the direction with the longest queue
    highest_direction = max(
        traffic_data,
        key=lambda direction:
        traffic_data[direction]["queue_length"]
    )

    return {
        "green_direction": highest_direction,
        "green_duration": 40,
        "reason": "Highest queue length",
        "mode": "sample"
    }
