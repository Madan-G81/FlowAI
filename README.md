# FlowAI

AI-powered adaptive traffic control system (hackathon prototype).

Pipeline: traffic observations -> adaptive controller
(controller/optimizer.py) -> traffic simulation
(simulation/run_simulation.py) -> FastAPI backend (backend/) ->
React dashboard (frontend/, code complete, build pending npm install).

## Modules

| Folder | Status |
|---|---|
| controller/ | Adaptive signal decision brain (unit-tested) |
| simulation/ | Custom 4-way Python simulation (17 integration tests) |
| backend/ | FastAPI, serves real controller + simulation |
| vehicle_detection/ | YOLOv8 + ByteTrack detection (script; not yet runnable in this env) |
| docs/ | API contract + module docs |
| frontend/ | React (Vite + recharts) dashboard; source complete, npm install pending approval |

## Quick start

Backend (from repo root):

```bash
    venv\Scripts\python.exe -m uvicorn backend.main:app --port 8000
```

Frontend (from frontend/, needs `npm install` first):

```bash
    npm run dev
```

Then open http://localhost:5173 (see frontend/README.md).

Run the simulation comparison (fixed vs adaptive, 6 scenarios):

```bash
    python simulation/run_simulation.py
```

More details: controller/README.md, simulation/README.md,
backend/README.md, docs/API_CONTRACT.md.
