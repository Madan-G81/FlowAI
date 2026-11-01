import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import type {
  Direction,
  HistoricalPoint,
  SystemSnapshot,
} from '../types/traffic';

interface AnalyticsViewProps {
  snapshot: SystemSnapshot;
}

function DirectionalVolumeChart({ history }: { history: HistoricalPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (history.length < 2) {
    return (
      <div className="h-60 flex items-center justify-center text-sm text-slate-400">
        Collecting live directional volume telemetry...
      </div>
    );
  }

  const width = 640;
  const height = 220;
  const padL = 36;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxVal = Math.max(
    25,
    ...history.flatMap((p) => [
      p.northCount,
      p.southCount,
      p.eastCount,
      p.westCount,
    ])
  );

  const toX = (i: number) =>
    padL + (i / Math.max(1, history.length - 1)) * plotW;
  const toY = (v: number) => padT + plotH - (v / maxVal) * plotH;

  const buildPath = (selector: (p: HistoricalPoint) => number) =>
    history
      .map(
        (pt, idx) =>
          `${idx === 0 ? 'M' : 'L'} ${toX(idx).toFixed(1)} ${toY(selector(pt)).toFixed(1)}`
      )
      .join(' ');

  const series = [
    {
      name: 'North',
      color: '#3b82f6',
      path: buildPath((p) => p.northCount),
      getVal: (p: HistoricalPoint) => p.northCount,
    },
    {
      name: 'South',
      color: '#10b981',
      path: buildPath((p) => p.southCount),
      getVal: (p: HistoricalPoint) => p.southCount,
    },
    {
      name: 'East',
      color: '#f59e0b',
      path: buildPath((p) => p.eastCount),
      getVal: (p: HistoricalPoint) => p.eastCount,
    },
    {
      name: 'West',
      color: '#a855f7',
      path: buildPath((p) => p.westCount),
      getVal: (p: HistoricalPoint) => p.westCount,
    },
  ];

  const activePoint = hoverIdx !== null ? history[hoverIdx] : null;

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-0.5 inline-block"
                style={{ backgroundColor: s.color }}
              />
              <span>{s.name}</span>
            </span>
          ))}
        </div>
        {activePoint && (
          <span className="font-mono tabular-nums text-slate-300">
            {activePoint.timestamp} · N:{activePoint.northCount} S:
            {activePoint.southCount} E:{activePoint.eastCount} W:
            {activePoint.westCount}
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-56 overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {[0, 0.5, 1].map((frac) => {
          const y = padT + plotH * (1 - frac);
          const labelVal = Math.round(maxVal * frac);
          return (
            <g key={frac}>
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
                {labelVal}
              </text>
            </g>
          );
        })}

        {series.map((s) => (
          <path
            key={s.name}
            d={s.path}
            fill="none"
            stroke={s.color}
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
            <g key={pt.timestamp + idx}>
              {showTick && (
                <text
                  x={x}
                  y={height - 6}
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

function WaitComparisonChart({ history }: { history: HistoricalPoint[] }) {
  if (history.length < 2) {
    return (
      <div className="h-60 flex items-center justify-center text-sm text-slate-400">
        Collecting wait-time comparison metrics...
      </div>
    );
  }

  const width = 640;
  const height = 220;
  const padL = 38;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxWait = Math.max(
    45,
    ...history.flatMap((p) => [p.adaptiveAvgWaitSec, p.fixedBaselineWaitSec])
  );

  const toX = (i: number) =>
    padL + (i / Math.max(1, history.length - 1)) * plotW;
  const toY = (v: number) => padT + plotH - (v / maxWait) * plotH;

  const adaptivePath = history
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(pt.adaptiveAvgWaitSec).toFixed(1)}`
    )
    .join(' ');

  const fixedPath = history
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(pt.fixedBaselineWaitSec).toFixed(1)}`
    )
    .join(' ');

  return (
    <div>
      <div className="flex items-center gap-5 mb-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" />
          <span>FlowAI Adaptive Wait (s)</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-slate-500 inline-block" />
          <span>Fixed-Time Baseline Wait (s)</span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-56 overflow-visible"
      >
        {[0, 0.5, 1].map((frac) => {
          const y = padT + plotH * (1 - frac);
          const labelVal = Math.round(maxWait * frac);
          return (
            <g key={frac}>
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
                {labelVal}s
              </text>
            </g>
          );
        })}

        <path
          d={fixedPath}
          fill="none"
          stroke="#64748b"
          strokeWidth={2}
          strokeDasharray="5 4"
        />
        <path
          d={adaptivePath}
          fill="none"
          stroke="#10b981"
          strokeWidth={2.4}
          strokeLinecap="round"
        />

        {history.map((pt, idx) => {
          const showTick =
            idx === 0 ||
            idx === history.length - 1 ||
            idx === Math.floor(history.length / 2);
          if (!showTick) return null;
          return (
            <text
              key={pt.timestamp + idx}
              x={toX(idx)}
              y={height - 6}
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
          );
        })}
      </svg>
    </div>
  );
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ snapshot }) => {
  const [directionFilter, setDirectionFilter] = useState<'ALL' | Direction>(
    'ALL'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Aggregate fleet breakdown across all 4 approaches
  const classSummary = useMemo(() => {
    const dirs: Direction[] = ['north', 'south', 'east', 'west'];
    const totals = {
      cars: 0,
      bikes: 0,
      buses: 0,
      trucks: 0,
      emergency: 0,
    };
    for (const d of dirs) {
      const v = snapshot.approaches[d].vehicles;
      totals.cars += v.cars;
      totals.bikes += v.bikes;
      totals.buses += v.buses;
      totals.trucks += v.trucks;
      totals.emergency += v.emergency;
    }
    const grand =
      Math.max(
        1,
        totals.cars +
          totals.bikes +
          totals.buses +
          totals.trucks +
          totals.emergency
      );
    return [
      {
        label: 'Passenger Cars',
        count: totals.cars,
        pct: Math.round((totals.cars / grand) * 100),
        bar: 'bg-blue-500',
      },
      {
        label: 'Two-Wheelers & Bikes',
        count: totals.bikes,
        pct: Math.round((totals.bikes / grand) * 100),
        bar: 'bg-emerald-500',
      },
      {
        label: 'Transit Buses',
        count: totals.buses,
        pct: Math.round((totals.buses / grand) * 100),
        bar: 'bg-amber-500',
      },
      {
        label: 'Heavy Trucks',
        count: totals.trucks,
        pct: Math.round((totals.trucks / grand) * 100),
        bar: 'bg-sky-400',
      },
      {
        label: 'Emergency Vehicles',
        count: totals.emergency,
        pct: Math.round((totals.emergency / grand) * 100),
        bar: 'bg-red-500',
      },
    ];
  }, [snapshot.approaches]);

  const filteredLogs = useMemo(() => {
    return snapshot.recentLogs.filter((entry) => {
      if (directionFilter !== 'ALL' && entry.direction !== directionFilter) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchDir = entry.direction.toLowerCase().includes(q);
        const matchReason = entry.reason.toLowerCase().includes(q);
        const matchMode = entry.mode.toLowerCase().includes(q);
        return matchDir || matchReason || matchMode;
      }
      return true;
    });
  }, [snapshot.recentLogs, directionFilter, searchQuery]);

  const handleDownloadCsv = () => {
    const header =
      'Timestamp,Direction,Mode,DensityAtStart,StartPCU,AllocatedGreenSec,VehiclesCleared,Reason\n';
    const rows = filteredLogs
      .map(
        (l) =>
          `"${l.timestampIso}","${l.direction.toUpperCase()}","${l.mode}","${l.densityAtStart}",${l.pcuAtStart},${l.allocatedGreenSec},${l.vehiclesCleared},"${l.reason.replace(/"/g, '""')}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flowai_phase_audit_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-50 text-balance">
          Traffic Telemetry & Signal Efficiency Analytics
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Quantitative comparison of adaptive green-time scheduling against
          fixed-cycle timers, directional queue dynamics, and phase execution
          logs.
        </p>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800">
          <h3 className="text-base font-semibold text-slate-100 mb-4">
            Directional Queue Volume (North · South · East · West)
          </h3>
          <DirectionalVolumeChart history={snapshot.history} />
        </div>

        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className="text-base font-semibold text-slate-100">
              Average Queue Delay: Adaptive vs. Fixed-Time
            </h3>
            <span className="text-xs font-mono tabular-nums text-emerald-400">
              -{snapshot.waitReductionPct}% Avg Wait
            </span>
          </div>
          <WaitComparisonChart history={snapshot.history} />
        </div>
      </div>

      {/* Live YOLO Vehicle Class Composition */}
      <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800">
          <h3 className="text-base font-semibold text-slate-100">
            Active Intersection Vehicle Classification Share
          </h3>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            Total Active Queue: {snapshot.totalVehiclesActive} vehicles
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {classSummary.map((item) => (
            <div key={item.label} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-slate-400">{item.label}</span>
                <span className="text-xs font-mono tabular-nums text-slate-300">
                  {item.pct}%
                </span>
              </div>
              <div className="text-xl font-semibold font-mono tabular-nums text-slate-100">
                {item.count}
              </div>
              <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-transform duration-200 origin-left ${item.bar}`}
                  style={{
                    transform: `scaleX(${Math.max(0.03, item.pct / 100)})`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Phase Execution Audit Table */}
      <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Signal Phase Execution Log
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Completed green-phase allocations, cleared queue counts, and
              controller decision rationale.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rationale or mode..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Segmented Direction Filter */}
            <div className="inline-flex p-0.5 rounded-lg bg-slate-950 border border-slate-800">
              {(['ALL', 'north', 'south', 'east', 'west'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirectionFilter(d)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    directionFilter === d
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {d === 'ALL'
                    ? 'All'
                    : d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm text-slate-400">
              No phase execution entries match the active filter criteria.
            </p>
            <button
              type="button"
              onClick={() => {
                setDirectionFilter('ALL');
                setSearchQuery('');
              }}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-400">
                  <th className="py-2.5 pr-4 font-medium">Completed Time</th>
                  <th className="py-2.5 px-4 font-medium">Approach</th>
                  <th className="py-2.5 px-4 font-medium">Mode</th>
                  <th className="py-2.5 px-4 font-medium">Initial Density</th>
                  <th className="py-2.5 px-4 font-medium text-right">
                    Start PCU
                  </th>
                  <th className="py-2.5 px-4 font-medium text-right">
                    Green Duration
                  </th>
                  <th className="py-2.5 px-4 font-medium text-right">
                    Cleared
                  </th>
                  <th className="py-2.5 pl-4 font-medium">Decision Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {filteredLogs.map((entry) => {
                  const timeLabel = new Date(
                    entry.timestampIso
                  ).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                  return (
                    <tr
                      key={entry.id}
                      className="h-10 hover:bg-slate-800/35 transition-colors"
                    >
                      <td className="py-2 pr-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {timeLabel}
                      </td>
                      <td className="py-2 px-4 font-medium text-slate-100 capitalize whitespace-nowrap">
                        {entry.direction}
                      </td>
                      <td className="py-2 px-4 text-slate-300 whitespace-nowrap">
                        {entry.mode.replace(/_/g, ' ')}
                      </td>
                      <td
                        className={`py-2 px-4 font-medium whitespace-nowrap ${
                          entry.densityAtStart === 'High'
                            ? 'text-red-400'
                            : entry.densityAtStart === 'Medium'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                        }`}
                      >
                        {entry.densityAtStart}
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-300">
                        {entry.pcuAtStart.toFixed(1)}
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-200">
                        {entry.allocatedGreenSec}s
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums text-emerald-400">
                        {entry.vehiclesCleared} veh
                      </td>
                      <td className="py-2 pl-4 text-slate-400">
                        {entry.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
