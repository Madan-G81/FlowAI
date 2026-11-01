/*
 * Central FlowAI API service.
 * Base URL comes from the VITE_API_BASE_URL environment variable
 * (frontend/.env). Only endpoints documented in docs/API_CONTRACT.md
 * are called - nothing is invented here.
 */

const BASE_URL =
  (import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(kind, message, status = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind; // "network" | "http"
    this.status = status;
  }
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
  } catch (error) {
    throw new ApiError(
      "network",
      `Cannot reach the FlowAI backend at ${BASE_URL}. Is it running?`
    );
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    let errorKind = "http";

    try {
      const body = await response.json();
      if (body && body.detail) {
        detail = body.detail.error || body.detail.error_name || body.detail;
        // Pydantic 422 payloads carry a list of field errors.
        if (body.detail.error_name === undefined && Array.isArray(body.detail)) {
          detail = body.detail;
        }
      }
    } catch {
      /* not JSON */
    }

    if (typeof detail !== "string" && !Array.isArray(detail)) {
      detail = Array.isArray(detail.missing_fields)
        ? `${detail.message} Missing: ${detail.missing_fields.join(", ")}`
        : JSON.stringify(detail);
    }

    throw new ApiError(errorKind, detail, response.status);
  }

  return response.json();
}

export const api = {
  home: () => request("/"),
  health: () => request("/api/health"),
  trafficCurrent: () => request("/api/traffic/current"),
  scenarios: () => request("/api/simulation/scenarios"),
  compare: (scenario) =>
    request(`/api/simulation/compare${scenario ? `?scenario=${scenario}` : ""}`),
  runSimulation: (mode, scenario) =>
    request("/api/simulation/run", {
      method: "POST",
      body: JSON.stringify({ mode, scenario })
    }),
  decision: (params = "") => request(`/api/control/decision${params}`),
  postDecision: (body) =>
    request("/api/control/decision", {
      method: "POST",
      body: JSON.stringify(body)
    })
};
