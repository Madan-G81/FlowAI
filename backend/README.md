# FlowAI Backend

FastAPI backend for FlowAI. It serves the REAL controller
(`controller/optimizer.py`) and the REAL traffic simulation
(`simulation/run_simulation.py`) - it never duplicates their logic.

## How to start

From the repository root:

```bash
    venv\Scripts\python.exe -m uvicorn backend.main:app --port 8000
```

Interactive API docs: http://127.0.0.1:8000/docs

Note: if you Recently ran a server on the same port and Windows
refuses to bind (error 10048), use another port (e.g. 8010) and
update the base URL accordingly.

## How to test the endpoints (no extra dependencies)

Start the server in one terminal, then from another terminal:

```bash
    curl http://127.0.0.1:8000/
    curl http://127.0.0.1:8000/api/health
    curl http://127.0.0.1:8000/api/traffic/current
    curl http://127.0.0.1:8000/api/simulation/scenarios
    curl "http://127.0.0.1:8000/api/simulation/compare?scenario=balanced"

    curl -X POST http://127.0.0.1:8000/api/simulation/run ^
      -H "Content-Type: application/json" ^
      -d "{\"mode\":\"adaptive\",\"scenario\":\"north_south_heavy\"}"

    curl -X POST http://127.0.0.1:8000/api/control/decision ^
      -H "Content-Type: application/json" ^
      -d "{\"observations\":{\"north\":{\"vehicle_count\":30,\
\"queue_length\":15,\"waiting_time_seconds\":70},\
\"south\":{\"vehicle_count\":0,\"queue_length\":0,\
\"waiting_time_seconds\":0},\"east\":{\"vehicle_count\":5,\
\"queue_length\":2,\"waiting_time_seconds\":10},\
\"west\":{\"vehicle_count\":0,\"queue_length\":0,\
\"waiting_time_seconds\":0}},\"state\":{\"current_phase\":\
\"east_west\",\"consecutive_phases\":1}}"
```

Invalid inputs return HTTP 422 with a clear error payload (see
docs/API_CONTRACT.md for examples). The backend does NOT accept
uninstallable-optional dependencies: tests run against a live
server with curl; pytest/httpx were not installed (owner approval
pending).

## Endpoint summary

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | App info + endpoint list + status |
| GET | `/api/health` | Liveness check |
| GET | `/api/traffic/current` | Latest observations (labeled `sample` - video pipeline not connected yet) |
| GET | `/api/control/decision` | Real controller decision; WITH all 12 numeric query params -> real decision; WITHOUT -> labeled sample fallback |
| POST | `/api/control/decision` | Real controller decision from a full JSON observation + state |
| POST | `/api/simulation/run` | Runs the REAL simulation (`{mode, scenario}`) |
| GET | `/api/simulation/scenarios` | Supported modes/scenarios + labels |
| GET | `/api/simulation/compare` | Fixed vs adaptive metrics on identical deterministic arrivals (one or all scenarios) |

Sample data usage policy: the hardcoded observations are used ONLY
by `/api/traffic/current` and the fallback path of
`/api/control/decision`, and every such response contains
`data_source: "sample"` (plus a `warning` on the decision) so a
frontend can distinguish demo data from real output.
