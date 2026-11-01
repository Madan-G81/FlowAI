# FlowAI Frontend

React dashboard (Vite) for the FlowAI adaptive traffic control system.
It talks to the FastAPI backend from Phase 4 only - every metric shown
comes from a real backend response (labeled `sample` data is always
marked DEMO, nothing is invented client-side).

## Prerequisites

- Node.js and npm (verified available: Node v24.19.0, npm 11.x)
- The FlowAI backend running (see root README)

## Setup

1. **Install dependencies** (requires approval per project rules):

   ```
   cd frontend
   npm install
   ```

2. **Configure the backend URL** (optional):

   ```
   copy .env.example .env
   ```

   Default is `VITE_API_BASE_URL=http://127.0.0.1:8000`.

3. **Start the dev server** (from `frontend/`):

   ```
   npm run dev
   ```

   Then open http://localhost:5173

## What is in the dashboard

| Section     | Backend endpoints used                                    |
| ----------- | --------------------------------------------------------- |
| Dashboard   | `/`, `/api/health`, `/api/traffic/current`, `GET /api/control/decision` |
| Simulation  | `/api/simulation/scenarios`, `POST /api/simulation/run`    |
| Comparison  | `GET /api/simulation/compare`                              |
| Analytics   | charts of the latest `POST /api/simulation/run` result      |

Connection status (backend online/offline) is polled from `/api/health`
every 30 seconds.

## Notes

- All requests go through `src/api.js`, the single place that knows the
  base URL and error handling. Network failures, HTTP errors and
  FastAPI `detail` payloads are surfaced as readable error boxes.
- Data-source labels: `sample` -> DEMO badge (amber),
  `simulation` -> Simulation badge (cyan),
  `caller_observations` -> Live observations badge (green).
- Production build: `npm run build` (output in `dist/`), preview with
  `npm run preview`. Both require dependencies installed first.
