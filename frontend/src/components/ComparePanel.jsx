import React, { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid
} from "recharts";

const CHART_BLUE = "#3b82f6";
const CHART_CYAN = "#22d3ee";

const METRIC_DEFINITIONS = [
  { key: "average_wait_seconds", label: "Average wait (s)", goodWhenLower: true },
  { key: "total_wait_seconds", label: "Total wait (s)", goodWhenLower: true },
  { key: "max_wait_seconds", label: "Max wait (s)", goodWhenLower: true },
  { key: "remaining_vehicles", label: "Remaining vehicles", goodWhenLower: true },
  { key: "completed_vehicles", label: "Completed vehicles", goodWhenLower: false },
  { key: "throughput_per_minute", label: "Throughput / min", goodWhenLower: false }
];

function betterForMetric(metric, fixedValue, adaptiveValue) {
  if (fixedValue === adaptiveValue) return "tie";
  return metric.goodWhenLower
    ? (adaptiveValue < fixedValue ? "adaptive" : "fixed")
    : (adaptiveValue > fixedValue ? "adaptive" : "fixed");
}

export default function ComparePanel({ scenarios }) {
  const [scenario, setScenario] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load(selected) {
    setLoading(true);
    setError(null);
    try {
      const response = await api.compare(selected || null);
      setResults(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const comparisons = results ? results.comparisons || [results] : [];
  const activeComparison = comparisons.find((c) => c.scenario === scenario) || comparisons[0];

  const chartData = activeComparison
    ? METRIC_DEFINITIONS.map((metric) => ({
        metric: metric.label,
        "Fixed-time": activeComparison.fixed.metrics[metric.key],
        Adaptive: activeComparison.adaptive.metrics[metric.key]
      }))
    : [];

  return (
    <div>
      <div className="card">
        <h3>Fixed-time vs Adaptive comparison</h3>

        <div className="inline margin-bottom">
          <select
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value);
              load(event.target.value);
            }}
          >
            <option value="">All scenarios</option>
            {(scenarios || []).map((item) => (
              <option key={item.name} value={item.name}>
                {item.label}
              </option>
            ))}
          </select>
          {loading && <span className="row-label">Loading comparison...</span>}
        </div>

        {error && <div className="error-box">Comparison request failed: {error}</div>}

        {!error && activeComparison && (
          <div>
            <div className="inline margin-bottom">
              <span className="badge simulation">{activeComparison.scenario}</span>
              <span className="row-label">{activeComparison.note}</span>
            </div>

            {comparisons.length > 1 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Fixed avg wait (s)</th>
                    <th>Adaptive avg wait (s)</th>
                    <th>Better (avg wait)</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((item) => {
                    const fixed = item.fixed.metrics.average_wait_seconds;
                    const adaptive = item.adaptive.metrics.average_wait_seconds;

                    return (
                      <tr key={item.scenario}>
                        <td>{item.scenario_label}</td>
                        <td className="numeric">{fixed}</td>
                        <td className="numeric">{adaptive}</td>
                        <td>
                          {(() => {
                            /* betterForMetric is presentation logic only */
                            const metric = METRIC_DEFINITIONS[0];
                            const winner =
                              adaptive === fixed
                                ? "tie"
                                : adaptive < fixed
                                  ? "adaptive"
                                  : "fixed";
                            return winner === "tie"
                              ? "tie"
                              : <span className={winner === "adaptive" ? "winner" : "loser"}>
                                  {winner === "adaptive" ? "Adaptive" : "Fixed-time"}
                                </span>;
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="grid grid-2">
                {["fixed", "adaptive"].map((mode) => {
                  const modeData = activeComparison[mode];
                  return (
                    <div className="direction-card" key={mode}>
                      <div className="direction-head">
                        <span className="direction-name">{modeData.mode_label}</span>
                      </div>
                      <table className="data-table">
                        <tbody>
                          {METRIC_DEFINITIONS.map((metric) => {
                            const winner = betterForMetric(
                              metric,
                              activeComparison.fixed.metrics[metric.key],
                              activeComparison.adaptive.metrics[metric.key]
                            );
                            return (
                              <tr key={metric.key}>
                                <td className="row-label">{metric.label}</td>
                                <td className="numeric">{modeData.metrics[metric.key]}</td>
                                <td>
                                  {winner === "tie"
                                    ? ""
                                    : winner === "adaptive"
                                      ? "adaptive"
                                      : "fixed"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {activeComparison && (
        <div className="chart-panel margin-top">
          <p className="chart-title">
            Metrics for {activeComparison.scenario} - constant values: completed,
            throughput lower is not better
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2d47" />
              <XAxis dataKey="metric" stroke="#8fa3bf" fontSize={11} />
              <YAxis stroke="#8fa3bf" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "#17233a", border: "1px solid #1f2d47" }}
              />
              <Legend />
              <Bar dataKey="Fixed-time" fill={CHART_BLUE} />
              <Bar dataKey="Adaptive" fill={CHART_CYAN} />
            </BarChart>
          </ResponsiveContainer>
          <p className="row-label">
            Charts display values returned by the backend only - no client-side
            estimation is performed beyond labeling which value is better.
          </p>
        </div>
      )}
    </div>
  );
}
