import React, { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Camera,
  Code2,
  Menu,
  Pause,
  Play,
  Sliders,
  X,
} from 'lucide-react';
import { ApproachCardsGrid } from './components/ApproachCardsGrid';
import { ControllerAndYoloPanel } from './components/ControllerAndYoloPanel';
import { FourWayIntersection } from './components/FourWayIntersection';
import { InteractiveChartsPanel } from './components/InteractiveChartsPanel';
import type {
  DashboardTelemetry,
  DirectionKey,
  SimulationBenchmarkResponse,
} from './types/flowai';

type TabId = 'overview' | 'cameras' | 'controller' | 'analytics' | 'integration';

const NAV_TABS: Array<{
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Intersection Monitor', icon: Activity },
  { id: 'cameras', label: 'YOLO Camera Streams', icon: Camera },
  { id: 'controller', label: 'Adaptive Controller', icon: Sliders },
  { id: 'analytics', label: 'Statistics & Charts', icon: BarChart3 },
  { id: 'integration', label: 'Repo & API Status', icon: Code2 },
];

function FlowAiMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="w-7 h-7 shrink-0"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="7"
        fill="#0f172a"
        stroke="#1e293b"
        strokeWidth="1.5"
      />
      <path
        d="M13 3V29M19 3V29M3 13H29M3 19H29"
        stroke="#334155"
        strokeWidth="1.5"
      />
      <path
        d="M16 5V27"
        stroke="#22c55e"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="3.5" fill="#3b82f6" />
    </svg>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<DashboardTelemetry | null>(null);
  const [benchmark, setBenchmark] =
    useState<SimulationBenchmarkResponse | null>(null);
  const [backendHealthy, setBackendHealthy] = useState<boolean>(false);
  const [selectedDirection, setSelectedDirection] =
    useState<DirectionKey>('north');
  const [clock, setClock] = useState<Date>(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let active = true;

    const pollTelemetry = async () => {
      try {
        const res = await fetch('/api/dashboard/telemetry');
        if (!res.ok) throw new Error('Backend unreachable');
        const data = (await res.json()) as DashboardTelemetry;
        if (active) {
          setTelemetry(data);
          setBackendHealthy(true);
        }
      } catch {
        if (active) setBackendHealthy(false);
      }
    };

    const loadBenchmark = async () => {
      try {
        const res = await fetch('/api/simulation/benchmark');
        if (res.ok) {
          const data = (await res.json()) as SimulationBenchmarkResponse;
          if (active) setBenchmark(data);
        }
      } catch {
        // Retry silently on next load
      }
    };

    pollTelemetry();
    loadBenchmark();
    const interval = setInterval(pollTelemetry, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const updateBackend = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/traffic/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const updated = (await res.json()) as DashboardTelemetry;
      setTelemetry(updated);
    }
  };

  const dateText = clock.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const timeText = clock.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const activeNavTitle =
    NAV_TABS.find((n) => n.id === activeTab)?.label ?? 'Intersection Monitor';

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[264px] lg:shrink-0 bg-[#0c1220] border-r border-slate-800/90 justify-between">
        <div>
          <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-800/90">
            <FlowAiMark />
            <div className="min-w-0">
              <div className="text-base font-bold tracking-tight text-slate-50 font-display truncate">
                FlowAI
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                Adaptive Traffic Control
              </div>
            </div>
          </div>

          <nav className="p-3 space-y-1" aria-label="Dashboard Navigation">
            {NAV_TABS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full px-3.5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/70 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800/90 space-y-3 text-xs">
          <div className="flex items-center justify-between text-slate-300">
            <span className="inline-flex items-center gap-2 font-medium">
              <span
                className={`w-2 h-2 rounded-full ${
                  backendHealthy ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span>
                {backendHealthy ? 'Python Engine Online' : 'Connecting...'}
              </span>
            </span>
          </div>

          <div className="font-mono tabular-nums text-slate-400 space-y-0.5">
            <div>{dateText}</div>
            <div className="text-slate-200 font-semibold">{timeText}</div>
          </div>

          {telemetry && (
            <div className="pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 leading-snug">
              Source: {telemetry.data_source}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-64 max-w-[80vw] bg-[#0c1220] border-r border-slate-800 flex flex-col justify-between">
            <div>
              <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <FlowAiMark />
                  <span className="text-base font-bold text-slate-50 font-display">
                    FlowAI
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-100"
                  aria-label="Close sidebar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="p-3 space-y-1">
                {NAV_TABS.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileOpen(false);
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/70'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="p-4 border-t border-slate-800 text-xs font-mono tabular-nums text-slate-400">
              {dateText} · {timeText}
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="h-16 px-4 sm:px-8 border-b border-slate-800/90 bg-[#090d16]/95 flex items-center justify-between gap-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-300 hover:text-white rounded-lg"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="font-semibold text-slate-200 whitespace-nowrap">
                FlowAI
              </span>
              <span className="text-slate-600" aria-hidden="true">
                /
              </span>
              <span className="hidden sm:inline text-slate-400 whitespace-nowrap">
                Madan-G81/FlowAI
              </span>
              <span
                className="hidden sm:inline text-slate-600"
                aria-hidden="true"
              >
                /
              </span>
              <span className="text-slate-100 font-medium truncate">
                {activeNavTitle}
              </span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums whitespace-nowrap shrink-0">
            <span>{dateText}</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-200">{timeText}</span>
            <span aria-hidden="true">·</span>
            <span
              className={backendHealthy ? 'text-emerald-400' : 'text-amber-400'}
            >
              {backendHealthy ? 'Python API Live' : 'Reconnecting'}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() =>
                updateBackend({ action: 'toggle_dynamic_flow' })
              }
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-100 border border-slate-700 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {telemetry?.dynamic_flow_enabled === false ? (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Resume Traffic Flow</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-slate-300" />
                  <span>Hold Traffic Counts</span>
                </>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto space-y-8">
          {!telemetry ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-24 rounded-xl bg-slate-900/70 border border-slate-800 animate-pulse"
                  />
                ))}
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-5 aspect-square max-h-[540px] rounded-xl bg-slate-900/70 border border-slate-800 animate-pulse" />
                <div className="xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-56 rounded-xl bg-slate-900/70 border border-slate-800 animate-pulse"
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="space-y-8">
                  {/* Hero Overview Header & Strategy Toggle */}
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                      <h1 className="text-2xl font-semibold text-slate-50 tracking-tight text-balance">
                        FlowAI – Adaptive Traffic Control Dashboard
                      </h1>
                      <p className="mt-1 text-sm text-slate-400">
                        Live telemetry powered by{' '}
                        <code>adaptive_signal_controller.py</code>,{' '}
                        <code>controller/optimizer.py</code>, and YOLOv8
                        multi-direction stream analysis.
                      </p>
                    </div>

                    <div className="inline-flex p-1 rounded-lg bg-slate-900 border border-slate-800 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          updateBackend({
                            action: 'set_strategy',
                            strategy: 'single_approach',
                          })
                        }
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          telemetry.signal_strategy === 'single_approach'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-400 hover:text-slate-100'
                        }`}
                      >
                        Single-Approach (4-Phase)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateBackend({
                            action: 'set_strategy',
                            strategy: 'corridor_pair',
                          })
                        }
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          telemetry.signal_strategy === 'corridor_pair'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-400 hover:text-slate-100'
                        }`}
                      >
                        Paired Corridor (N–S / E–W)
                      </button>
                    </div>
                  </div>

                  {/* 4-Column Live KPI Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="text-xs text-slate-400">
                        Total Detected Vehicles
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <span className="text-2xl font-semibold font-mono tabular-nums text-slate-50">
                          {telemetry.total_vehicles}
                        </span>
                        <span className="text-xs font-mono tabular-nums text-slate-400">
                          Queue: {telemetry.total_queue_length}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                        Overall Density: {telemetry.overall_density} · Cleared:{' '}
                        {telemetry.total_discharged}
                      </div>
                    </div>

                    <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="text-xs text-slate-400">
                        Active Signal Phase
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <span className="text-2xl font-semibold text-emerald-400">
                          {telemetry.signal_strategy === 'single_approach'
                            ? telemetry.adaptive_controller.active_direction ??
                              'ALL RED'
                            : telemetry.corridor_optimizer.active_corridor_phase.toUpperCase()}
                        </span>
                        <span className="text-sm font-mono tabular-nums text-slate-200">
                          {telemetry.signal_strategy === 'single_approach'
                            ? `${telemetry.adaptive_controller.phase} · ${telemetry.adaptive_controller.remaining_seconds}s`
                            : `${telemetry.corridor_optimizer.active_corridor_stage} · ${telemetry.corridor_optimizer.corridor_remaining_seconds}s`}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 truncate">
                        {telemetry.adaptive_controller.reason}
                      </div>
                    </div>

                    <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="text-xs text-slate-400">
                        Average Waiting Time
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <span className="text-2xl font-semibold font-mono tabular-nums text-slate-50">
                          {telemetry.avg_waiting_seconds.toFixed(1)}s
                        </span>
                        <span className="text-xs font-mono tabular-nums text-slate-400">
                          Max 60s threshold
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                        N:{telemetry.approaches.north.waiting_time_seconds}s · S:
                        {telemetry.approaches.south.waiting_time_seconds}s · E:
                        {telemetry.approaches.east.waiting_time_seconds}s · W:
                        {telemetry.approaches.west.waiting_time_seconds}s
                      </div>
                    </div>

                    <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="text-xs text-slate-400">
                        Corridor Demand Scores
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-2 font-mono tabular-nums">
                        <span className="text-2xl font-semibold text-slate-50">
                          N–S{' '}
                          {telemetry.corridor_optimizer.demand_scores.north_south.toFixed(
                            0
                          )}
                        </span>
                        <span className="text-sm text-slate-300">
                          E–W{' '}
                          {telemetry.corridor_optimizer.demand_scores.east_west.toFixed(
                            0
                          )}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Optimizer pick:{' '}
                        <span className="text-emerald-400 font-medium">
                          {telemetry.corridor_optimizer.green_direction} (
                          {telemetry.corridor_optimizer.green_duration}s)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Four-Way Intersection + North/South/East/West Live Cards */}
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                    <div className="xl:col-span-5">
                      <FourWayIntersection
                        telemetry={telemetry}
                        selectedDirection={selectedDirection}
                        onSelectDirection={setSelectedDirection}
                      />
                    </div>
                    <div className="xl:col-span-7">
                      <ApproachCardsGrid
                        approaches={telemetry.approaches}
                        selectedDirection={selectedDirection}
                        onSelectDirection={setSelectedDirection}
                        onForceGreen={(dir) =>
                          updateBackend({
                            action: 'force_direction',
                            direction: dir.toUpperCase(),
                          })
                        }
                        onRequestPedestrian={(dir) =>
                          updateBackend({
                            action: 'request_pedestrian',
                            direction: dir.toUpperCase(),
                            count: 3,
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Embedded Interactive Charts Preview right on Main Dashboard */}
                  <InteractiveChartsPanel
                    telemetry={telemetry}
                    benchmark={benchmark}
                  />
                </div>
              )}

              {activeTab === 'analytics' && (
                <InteractiveChartsPanel
                  telemetry={telemetry}
                  benchmark={benchmark}
                />
              )}

              {(activeTab === 'cameras' ||
                activeTab === 'controller' ||
                activeTab === 'integration') && (
                <ControllerAndYoloPanel
                  mode={activeTab}
                  telemetry={telemetry}
                  selectedDirection={selectedDirection}
                  onSelectDirection={setSelectedDirection}
                  onUpdateBackend={updateBackend}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
