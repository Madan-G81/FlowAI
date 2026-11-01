import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import type {
  DashboardTelemetry,
  SimulationBenchmarkResponse,
  TelemetryHistoryPoint,
} from '../types/flowai';

interface InteractiveChartsPanelProps {
  telemetry: DashboardTelemetry;
  benchmark: SimulationBenchmarkResponse | null;
}

function LiveDirectionalChart({
  history,
}: {
  history: TelemetryHistoryPoint[];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (history.length < 2) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-400">
        Streaming live directional counts from Python backend...
      </div>
    );
  }

  const width = 620;
  const height = 215;
  const padL = 34;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxV = Math.max(
    20,
    ...history.flatMap((h) => [h.north, h.south, h.east, h.west])
  );

  const toX = (i: number) =>
    padL + (i / Math.max(1, history.length - 1)) * plotW;
  const toY = (v: number) => padT + plotH - (v / maxV) * plotH;

  const makePath = (sel: (p: TelemetryHistoryPoint) => number) =>
    history
      .map(
        (pt, idx) =>
          `${idx === 0 ? 'M' : 'L'} ${toX(idx).toFixed(1)} ${toY(sel(pt)).toFixed(1)}`
      )
      .join(' ');

  const lines = [
    { label: 'North', color: '#3b82f6', d: makePath((p) => p.north) },
    { label: 'South', color: '#10b981', d: makePath((p) => p.south) },
    { label: 'East', color: '#f59e0b', d: makePath((p) => p.east) },
    { label: 'West', color: '#a855f7', d: makePath((p) => p.west) },
  ];

  const hovered = hoverIdx !== null ? history[hoverIdx] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          {lines.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-0.5 inline-block"
                style={{ backgroundColor: l.color }}
              />
              <span>{l.label}</span>
            </span>
          ))}
        </div>
        {hovered && (
          <span className="font-mono tabular-nums text-slate-200">
            {hovered.timestamp} · N:{hovered.north} S:{hovered.south} E:
            {hovered.east} W:{hovered.west}
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-56 overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {[0, 0.5, 1].map((f) => {
          const y = padT + plotH * (1 - f);
          return (
            <g key={f}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke="#1e293b"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 text-[10px] font-mono"
              >
                {Math.round(maxV * f)}
              </text>
            </g>
          );
        })}

        {lines.map((l) => (
          <path
            key={l.label}
            d={l.d}
            fill="none"
            stroke={l.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {hoverIdx !== null && (
          <line
            x1={toX(hoverIdx)}
            x2={toX(hoverIdx)}
            y1={padT}
            y2={padT + plotH}
            stroke="#475569"
            strokeWidth={1}
          />
        )}

        {history.map((pt, idx) => {
          const x = toX(idx);
          const showTick =
            idx === 0 ||
            idx === history.length - 1 ||
            idx === Math.floor(history.length / 2);
          return (
            <g key={`${pt.timestamp}-${idx}`}>
              {showTick && (
                <text
                  x={x}
                  y={height - 5}
                  textAnchor={
                    idx === 0
                      ? 'start'
                      : idx === history.length - 1
                        ? 'end'
                        : 'middle'
                  }
                  className="fill-slate-500 text-[10px] font-mono"
                >
                  {pt.timestamp}
                </text>
              )}
              <rect
                x={x - plotW / history.length / 2}
                y={padT}
                width={plotW / history.length}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(idx)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SimulationBenchmarkChart({
  benchmark,
}: {
  benchmark: SimulationBenchmarkResponse | null;
}) {
  const [metricView, setMetricView] = useState<
    'completed' | 'queue' | 'wait'
  >('completed');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!benchmark || benchmark.timeline.length < 2) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-400">
        Loading 300s simulation/run_simulation.py benchmark...
      </div>
    );
  }

  const pts = benchmark.timeline;
  const width = 620;
  const height = 215;
  const padL = 40;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const getFixed = (p: (typeof pts)[number]) =>
    metricView === 'completed'
      ? p.fixed_completed
      : metricView === 'queue'
        ? p.fixed_queue
        : p.fixed_avg_wait;

  const getAdaptive = (p: (typeof pts)[number]) =>
    metricView === 'completed'
      ? p.adaptive_completed
      : metricView === 'queue'
        ? p.adaptive_queue
        : p.adaptive_avg_wait;

  const maxV = Math.max(
    10,
    ...pts.flatMap((p) => [getFixed(p), getAdaptive(p)])
  );

  const toX = (i: number) => padL + (i / Math.max(1, pts.length - 1)) * plotW;
  const toY = (v: number) => padT + plotH - (v / maxV) * plotH;

  const fixedPath = pts
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(getFixed(p)).toFixed(1)}`
    )
    .join(' ');
  const adaptivePath = pts
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(getAdaptive(p)).toFixed(1)}`
    )
    .join(' ');

  const hovered = hoverIdx !== null ? pts[hoverIdx] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" />
            <span>Adaptive Control</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-slate-400 inline-block" />
            <span>Fixed-Time (30s)</span>
          </span>
        </div>

        <div className="inline-flex p-0.5 rounded-lg bg-slate-950 border border-slate-800">
          {(
            [
              { id: 'completed', label: 'Throughput' },
              { id: 'queue', label: 'Active Queue' },
              { id: 'wait', label: 'Avg Wait (s)' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMetricView(tab.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                metricView === tab.id
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {hovered && (
        <div className="mb-2 text-xs font-mono tabular-nums text-slate-300">
          t={hovered.second}s · Adaptive: {getAdaptive(hovered)} · Fixed:{' '}
          {getFixed(hovered)}
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-52 overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {[0, 0.5, 1].map((f) => {
          const y = padT + plotH * (1 - f);
          return (
            <g key={f}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke="#1e293b"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 text-[10px] font-mono"
              >
                {Math.round(maxV * f)}
              </text>
            </g>
          );
        })}

        <path
          d={fixedPath}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={2}
          strokeDasharray="5 4"
        />
        <path
          d={adaptivePath}
          fill="none"
          stroke="#10b981"
          strokeWidth={2.3}
          strokeLinecap="round"
        />

        {hoverIdx !== null && (
          <line
            x1={toX(hoverIdx)}
            x2={toX(hoverIdx)}
            y1={padT}
            y2={padT + plotH}
            stroke="#475569"
            strokeWidth={1}
          />
        )}

        {pts.map((pt, idx) => {
          const x = toX(idx);
          const showTick =
            idx === 0 ||
            idx === pts.length - 1 ||
            idx === Math.floor(pts.length / 2);
          return (
            <g key={pt.second}>
              {showTick && (
                <text
                  x={x}
                  y={height - 5}
                  textAnchor={
                    idx === 0
                      ? 'start'
                      : idx === pts.length - 1
                        ? 'end'
                        : 'middle'
                  }
                  className="fill-slate-500 text-[10px] font-mono"
                >
                  {pt.second}s
                </text>
              )}
              <rect
                x={x - plotW / pts.length / 2}
                y={padT}
                width={plotW / pts.length}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(idx)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export const InteractiveChartsPanel: React.FC<InteractiveChartsPanelProps> = ({
  telemetry,
  benchmark,
}) => {
  const [logSearch, setLogSearch] = useState<string>('');
  const [phaseFilter, setPhaseFilter] = useState<string>('ALL');

  const classDistribution = useMemo(() => {
    const agg = telemetry.aggregate_vehicle_classes;
    const total = Math.max(
      1,
      agg.Car + agg.Motorcycle + agg.Bicycle + agg.Bus + agg.Truck
    );
    return [
      { name: 'Car', count: agg.Car, pct: Math.round((agg.Car / total) * 100), color: 'bg-blue-500' },
      { name: 'Motorcycle', count: agg.Motorcycle, pct: Math.round((agg.Motorcycle / total) * 100), color: 'bg-emerald-500' },
      { name: 'Bicycle', count: agg.Bicycle, pct: Math.round((agg.Bicycle / total) * 100), color: 'bg-teal-400' },
      { name: 'Bus', count: agg.Bus, pct: Math.round((agg.Bus / total) * 100), color: 'bg-amber-500' },
      { name: 'Truck', count: agg.Truck, pct: Math.round((agg.Truck / total) * 100), color: 'bg-sky-400' },
    ];
  }, [telemetry.aggregate_vehicle_classes]);

  const filteredLogs = useMemo(() => {
    return telemetry.phase_logs.filter((l) => {
      if (phaseFilter !== 'ALL' && l.phase !== phaseFilter) return false;
      if (logSearch.trim()) {
        const q = logSearch.toLowerCase();
        return (
          l.direction.toLowerCase().includes(q) ||
          l.reason.toLowerCase().includes(q) ||
          l.strategy.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [telemetry.phase_logs, phaseFilter, logSearch]);

  const handleExportLogs = () => {
    const header = 'Timestamp,Module,Phase,Direction,DurationSec,Reason\n';
    const rows = filteredLogs
      .map(
        (l) =>
          `"${l.timestamp}","${l.strategy}","${l.phase}","${l.direction}",${l.duration_seconds},"${l.reason.replace(/"/g, '""')}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flowai_signal_logs_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-50 text-balance">
          Traffic Statistics & Interactive Telemetry Charts
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Live directional vehicle trajectories, YOLOv8 five-class vehicle
          shares, eight-way movement vectors, and exact 300-second simulation
          module benchmarks.
        </p>
      </div>

      {/* Primary Interactive Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className="text-base font-semibold text-slate-100">
              Live Directional Vehicle Counts
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              Total: {telemetry.total_vehicles} veh
            </span>
          </div>
          <LiveDirectionalChart history={telemetry.history} />
        </div>

        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className="text-base font-semibold text-slate-100">
              300s Simulation Benchmark (simulation/run_simulation.py)
            </h3>
            {benchmark && (
              <span className="text-xs font-mono tabular-nums text-slate-400">
                Adaptive {benchmark.adaptive.completed_vehicles} · Fixed{' '}
                {benchmark.fixed.completed_vehicles} veh
              </span>
            )}
          </div>
          <SimulationBenchmarkChart benchmark={benchmark} />
        </div>
      </div>

      {/* Corridor Demand & 8-Way Movement Vectors */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* YOLOv8 5-Class Distribution */}
        <div className="lg:col-span-7 p-6 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h3 className="text-base font-semibold text-slate-100">
              YOLOv8 Vehicle Category Distribution
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              Classes 1, 2, 3, 5, 7
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-4">
            {classDistribution.map((c) => (
              <div key={c.name} className="space-y-2">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-slate-400">{c.name}</span>
                  <span className="font-mono tabular-nums text-slate-300">
                    {c.pct}%
                  </span>
                </div>
                <div className="text-xl font-semibold font-mono tabular-nums text-slate-100">
                  {c.count}
                </div>
                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-transform duration-200 origin-left ${c.color}`}
                    style={{
                      transform: `scaleX(${Math.max(0.04, c.pct / 100)})`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 8-Way Movement Compass (from flowai_multidirection_adaptive.py) */}
        <div className="lg:col-span-5 p-6 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h3 className="text-base font-semibold text-slate-100">
              Movement Vector Headings
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              flowai_multidirection_adaptive
            </span>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-3">
            {(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const).map(
              (dir) => (
                <div
                  key={dir}
                  className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-center"
                >
                  <div className="text-xs text-slate-400 font-medium">{dir}</div>
                  <div className="mt-1 text-base font-semibold font-mono tabular-nums text-slate-100">
                    {telemetry.movement_counts[dir] ?? 0}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Live Python Signal Phase Transition Audit Table */}
      <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Python Controller Phase Transition Log
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time state transitions emitted by{' '}
              <code>adaptive_signal_controller.py</code> and{' '}
              <code>controller/optimizer.py</code>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Filter direction or reason..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="inline-flex p-0.5 rounded-lg bg-slate-950 border border-slate-800">
              {(['ALL', 'GREEN', 'YELLOW', 'ALL_RED'] as const).map((ph) => (
                <button
                  key={ph}
                  type="button"
                  onClick={() => setPhaseFilter(ph)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    phaseFilter === ph
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {ph}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleExportLogs}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            Waiting for next Python signal phase transition (current phase has{' '}
            {telemetry.adaptive_controller.remaining_seconds}s remaining)...
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-4 font-medium">Timestamp</th>
                  <th className="py-2 px-4 font-medium">Python Module</th>
                  <th className="py-2 px-4 font-medium">Phase</th>
                  <th className="py-2 px-4 font-medium">Active Direction</th>
                  <th className="py-2 px-4 font-medium text-right">Duration</th>
                  <th className="py-2 pl-4 font-medium">Controller Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredLogs.map((row) => (
                  <tr
                    key={row.id}
                    className="h-10 hover:bg-slate-800/35 transition-colors"
                  >
                    <td className="py-2 pr-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {new Date(row.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2 px-4 font-mono text-slate-400 whitespace-nowrap">
                      {row.strategy}
                    </td>
                    <td
                      className={`py-2 px-4 font-semibold whitespace-nowrap ${
                        row.phase === 'GREEN'
                          ? 'text-emerald-400'
                          : row.phase === 'YELLOW'
                            ? 'text-amber-400'
                            : 'text-red-400'
                      }`}
                    >
                      {row.phase}
                    </td>
                    <td className="py-2 px-4 font-medium text-slate-100 whitespace-nowrap">
                      {row.direction}
                    </td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-200">
                      {row.duration_seconds}s
                    </td>
                    <td className="py-2 pl-4 text-slate-400">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
