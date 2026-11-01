import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell
} from "recharts";

/*
 * Analytics: charts of the metrics the backend ACTUALLY returned for
 * the most recent simulation run. No historical data is invented;
 * if a run has not finished, there is nothing to display.
 */

const WAIT_METRICS = [
  { key: "average_wait_seconds", label: "Avg (s)", color: "#22d3ee" },
  { key: "total_wait_seconds", label: "Total (s)", color: "#3b82f6" },
  { key: "max_wait_seconds", label: "Max (s)", color: "#fbbf24" }
];

const COUNT_METRICS = [
  { key: "completed_vehicles", label: "Completed", color: "#34d399" },
  { key: "remaining_vehicles", label: "Remaining", color: "#f87171" }
];

export default function Analytics({ lastRun }) {
  if (!lastRun || !lastRun.metrics) {
    return (
      <div className="empty-box">
        No simulation results yet. Run a simulation (Simulate section) to
        generate analytics charts - no fake historical data is shown.
      </div>
    );
  }

  const waitData = WAIT_METRICS.map((metric) => ({
    name: metric.label,
    value: lastRun.metrics[metric.key],
    fill: metric.color
  }));

  const countData = COUNT_METRICS.map((metric) => ({
    name: metric.label,
    value: lastRun.metrics[metric.key],
    fill: metric.color
  }));

  return (
    <div>
      <div className="inline margin-bottom">
        <span className="badge simulation">{lastRun.mode_label}</span>
        <span className="row-label">
          Scenario: {lastRun.scenario} - window: {lastRun.simulation_time_seconds}s
        </span>
      </div>

      <div className="chart-panel margin-bottom">
        <p className="chart-title">Waiting-time metrics (seconds)</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={waitData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2d47" />
            <XAxis type="number" stroke="#8fa3bf" fontSize={11} />
            <YAxis type="category" dataKey="name" stroke="#8fa3bf" fontSize={12} />
            <Tooltip
              contentStyle={{ background: "#17233a", border: "1px solid #1f2d47" }}
            />
            <Bar dataKey="value" name="seconds">
              {waitData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-panel">
        <p className="chart-title">Vehicle counts</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={countData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2d47" />
            <XAxis dataKey="name" stroke="#8fa3bf" fontSize={11} />
            <YAxis stroke="#8fa3bf" fontSize={11} />
            <Tooltip
              contentStyle={{ background: "#17233a", border: "1px solid #1f2d47" }}
            />
            <Bar dataKey="value" name="vehicles">
              {countData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="row-label" style={{ padding: "0 12px 6px" }}>
          Note: completed + remaining together equal total arrivals (verified
          identity from the simulation module).
        </p>
      </div>
    </div>
  );
}
