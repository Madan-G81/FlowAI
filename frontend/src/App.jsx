import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api.js";
import SourceBadge from "./components/SourceBadge.jsx";
import MetricCard from "./components/MetricCard.jsx";
import IntersectionMonitor from "./components/IntersectionMonitor.jsx";
import SignalMonitor from "./components/SignalMonitor.jsx";
import SimulationControl from "./components/SimulationControl.jsx";
import ComparePanel from "./components/ComparePanel.jsx";
import Analytics from "./components/Analytics.jsx";

const SECTIONS = [
  { id: "overview", label: "Dashboard" },
  { id: "simulate", label: "Simulation" },
  { id: "compare", label: "Comparison" },
  { id: "analytics", label: "Analytics" }
];

/* Presentation-level helpers using backend numbers only */
function totalRecentVehicles(observations) {
  if (!observations) return null;
  return ["north", "south", "east", "west"].reduce(
    (sum, d) => sum + (observations[d] ? observations[d].vehicle_count : 0),
    0
  );
}

function densityLabel(totalRecent) {
  if (totalRecent === null) return "—";
  if (totalRecent >= 40) return "heavy";
  if (totalRecent >= 15) return "moderate";
  return "light";
}

function longestQueueWait(observations) {
  if (!observations) return null;
  return Math.max(
    ...["north", "south", "east", "west"].map(
      (d) => (observations[d] ? observations[d].waiting_time_seconds : 0)
    )
  );
}

export default function App() {
  const [section, setSection] = useState("overview");
  const [backendOnline, setBackendOnline] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const [appInfo, setAppInfo] = useState(null);
  const [traffic, setTraffic] = useState(null);
  const [trafficError, setTrafficError] = useState(null);
  const [decision, setDecision] = useState(null);
  const [decisionError, setDecisionError] = useState(null);
  const [scenarios, setScenarios] = useState(null);
  const [scenariosError, setScenariosError] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  const pollTimer = useRef(null);

  const refreshHealth = useCallback(async () => {
    try {
      await api.health();
      setBackendOnline(true);
      setConnectionError(null);
    } catch (err) {
      setBackendOnline(false);
      setConnectionError(
        err instanceof ApiError ? err.message : String(err)
      );
    }
  }, []);

  useEffect(() => {
    refreshHealth();
    pollTimer.current = setInterval(refreshHealth, 30000);
    return () => clearInterval(pollTimer.current);
  }, [refreshHealth]);

  useEffect(() => {
    /* Loaded once on mount - not per render (avoids spamming API) */
    (async () => {
      try {
        setAppInfo(await api.home());
      } catch {
        /* connection indicator already covers this */
      }

      try {
        setTraffic(await api.trafficCurrent());
      } catch (err) {
        setTrafficError(err instanceof Error ? err.message : String(err));
      }

      try {
        setDecision(await api.decision());
      } catch (err) {
        setDecisionError(err instanceof Error ? err.message : String(err));
      }

      try {
        setScenarios(await api.scenarios());
      } catch (err) {
        setScenariosError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  const trafficOwned = traffic ? traffic.observations : null;
  const trafficSource = traffic ? traffic.data_source : "sample";
  const totalVehicles = totalRecentVehicles(trafficOwned);

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="brand">
          <div className="brand-dot" />
          <div>
            <div className="brand-title">FlowAI</div>
            <div className="brand-sub">Adaptive traffic control</div>
          </div>
        </div>

        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-button${section === item.id ? " active" : ""}`}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}

        <div className={`connection ${backendOnline ? "online" : "offline"}`}>
          <strong>Backend</strong>
          <br />
          {backendOnline === true && "Connected"}
          {backendOnline === false && "Unavailable"}
          {backendOnline === null && "Checking..."}
          <br />
          <span className="row-label">
            (health polled every 30s)
          </span>
        </div>
      </nav>

      <main className="main">
        {section === "overview" && (
          <>
            <h1 className="page-title">Traffic control dashboard</h1>
            <p className="page-subtitle">
              {appInfo ? "API status: operational" : "API status unknown"} -
              reporting all metrics returned by the FastAPI backend
            </p>

            {connectionError && (
              <div className="error-box">
                Backend connection problem: {connectionError}
              </div>
            )}

            <div className="grid grid-4 margin-bottom">
              <MetricCard
                value={totalVehicles}
                label="Total vehicles (recent 60s window)"
                tone=""
              />
              <MetricCard value={densityLabel(totalVehicles)} label="Traffic density" tone="" />
              <MetricCard
                value={trafficOwned ? longestQueueWait(trafficOwned) : "—"}
                label="Longest queue wait (s)"
                tone=""
              />
              <div className="card">
                <div className={`metric-value`} style={{ fontSize: 16 }}>
                  <SourceBadge dataSource={trafficSource} />
                </div>
                <div className="metric-label">Current data source</div>
              </div>
            </div>

            <div className="card margin-bottom">
              <h3>
                Intersection monitoring{" "}
                <SourceBadge dataSource={trafficSource} />
              </h3>
              <IntersectionMonitor
                observations={trafficOwned}
                dataSource={trafficSource}
              />
              {trafficError && (
                <div className="error-box">Observation request failed: {trafficError}</div>
              )}
            </div>

            <SignalMonitor decision={decision} />
            {decisionError && (
              <div className="error-box">
                Decision request failed: {decisionError}
              </div>
            )}
          </>
        )}

        {section === "simulate" && (
          <>
            <h1 className="page-title">Simulation</h1>
            <p className="page-subtitle">
              Run the real FlowAI simulation module through the backend
            </p>
            {scenariosError && (
              <div className="error-box">Scenarios request failed: {scenariosError}</div>
            )}
            <SimulationControl
              scenarios={scenarios ? scenarios.scenarios : []}
              onRunComplete={setLastRun}
            />
            <p className="row-label margin-top">
              Last successful run is shared with the Analytics section.
            </p>
          </>
        )}

        {section === "compare" && (
          <>
            <h1 className="page-title">Fixed-time vs Adaptive</h1>
            <p className="page-subtitle">
              Backend-driven comparison on identical deterministic arrivals
            </p>
            <ComparePanel
              scenarios={scenarios ? scenarios.scenarios : []}
            />
          </>
        )}

        {section === "analytics" && (
          <>
            <h1 className="page-title">Analytics</h1>
            <p className="page-subtitle">
              Charts of the metrics returned by your latest simulation run
            </p>
            <Analytics lastRun={lastRun} />
          </>
        )}
      </main>
    </div>
  );
}
