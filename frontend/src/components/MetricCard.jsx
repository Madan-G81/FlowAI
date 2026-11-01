import React from "react";

export default function MetricCard({ value, label, tone }) {
  const toneClass = tone ? ` metric-${tone}` : "";

  return (
    <div className="card">
      <div className={`metric-value${toneClass}`}>
        {value === null || value === undefined || value === "" ? "—" : value}
      </div>
      <div className="metric-label">{label}</div>
    </div>
  );
}
