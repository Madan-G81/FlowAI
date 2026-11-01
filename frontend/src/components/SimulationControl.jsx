import React, { useEffect, useState } from "react";
import { api, ApiError } from "../api.js";
import MetricCard from "./MetricCard.jsx";

const METRIC_ROWS = [
  ["completed_vehicles", "Completed vehicles", "vehicles exited in 300s"],
  ["average_wait_seconds", "Average wait", "seconds per completed vehicle"],
  ["total_wait_seconds", "Total wait", "sum of all completed waits (s)"],
  ["max_wait_seconds", "Max wait", "single worst wait (s)"],
  ["remaining_vehicles", "Remaining vehicles", "still queued at window end"],
  ["throughput_per_minute", "Throughput", "vehicles per minute"]
];

export default function SimulationControl({ scenarios, onRunComplete }) {
  const [mode, setMode] = useState("adaptive");
  const [scenario, setScenario] = useState("north_south_heavy");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function run() {
    setStatus("loading");
    setError(null);
    setResult(null);
    try {
      const response = await api.runSimulation(mode, scenario);
      setResult(response);
      setStatus("success");
      if (onRunComplete) {
        onRunComplete(response);
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <div className="card">
      <h3>Simulation control</h3>

      <div className="inline margin-bottom">
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="adaptive">Adaptive (real controller)</option>
          <option value="fixed">Fixed-time schedule</option>
        </select>

        <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
          {(scenarios || []).map((item) => (
            <option key={item.name} value={item.name}>
              {item.label}
            </option>
          ))}
        </select>

        <button className="run-button" onClick={run} disabled={status === "loading"}>
          {status === "loading" ? "Running simulation..." : "Run simulation"}
        </button>
      </div>

      <p className="row-label">
        Runs the real FlowAI simulation module on deterministic arrivals (seed 42).
      </p>

      {status === "idle" && (
        <div className="empty-box">Choose a mode and scenario, then run.</div>
      )}

      {status === "error" && (
        <div className="error-box">Simulation request failed: {error}</div>
      )}

      {result && status === "success" && (
        <div className="margin-top">
          <div className="inline margin-bottom">
            <span className="badge simulation">{result.mode_label}</span>
            <span className="row-label">{result.scenario} - {result.simulation_time_seconds}s</span>
          </div>
          <div className="grid grid-3">
            {METRIC_ROWS.map(([key, label, sub]) => (
              <MetricCard
                key={key}
                value={result.metrics[key]}
                label={`${label} - ${sub}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
