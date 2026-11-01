import React from "react";

const LABELS = {
  sample: { text: "Demo sample", className: "sample" },
  simulation: { text: "Simulation", className: "simulation" },
  caller_observations: { text: "Live observations", className: "caller-observations" }
};

export default function SourceBadge({ dataSource }) {
  if (!dataSource) {
    return null;
  }

  const meta = LABELS[dataSource] || { text: dataSource, className: "" };

  return (
    <span className={`badge ${meta.className}`}>
      {dataSource === "sample" ? "DEMO - " : ""}
      {meta.text}
    </span>
  );
}
