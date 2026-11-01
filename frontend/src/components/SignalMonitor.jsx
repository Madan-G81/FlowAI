import React from "react";

/*
 * Displays the real controller decision payload:
 * green_direction / green_directions / green_duration /
 * yellow_duration / all_red_duration / reason / data_source.
 */

export default function SignalMonitor({ decision }) {
  if (!decision) {
    return (
      <div className="empty-box">
        No controller decision available yet (backend request failed or pending).
      </div>
    );
  }

  return (
    <div className="card">
      <h3>
        Controller decision status{" "}
        {decision.data_source === "sample"
          ? "(sample data - not a running signal)"
          : "(simulation / controller status)"}
      </h3>
      <div className="grid grid-2">
        <div>
          <div className="metric-value metric-blue">
            {decision.green_direction}
          </div>
          <div className="metric-label">
            Green phase — directions:{" "}
            {(decision.green_directions || []).join(" + ")}
          </div>
        </div>
        <div>
          <div className="metric-value metric-green">
            {decision.green_duration}s
          </div>
          <div className="metric-label">Green duration (from controller decision)</div>
        </div>
        <div>
          <div className="metric-value metric-amber">
            {decision.yellow_duration}s
          </div>
          <div className="metric-label">Yellow clearance</div>
        </div>
        <div>
          <div className="metric-value">
            {decision.all_red_duration}s
          </div>
          <div className="metric-label">All-red clearance</div>
        </div>
      </div>
      <p className="row-label margin-top">
        Reason: {decision.reason}
      </p>
      <p className="row-label">
        Max-wait protected directions:{" "}
        {decision.max_wait_directions && decision.max_wait_directions.length > 0
          ? decision.max_wait_directions.join(", ")
          : "none"}
      </p>
    </div>
  );
}
