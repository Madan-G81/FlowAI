import React, { useEffect, useState } from 'react';
import {
  Check,
  RotateCcw,
  ShieldAlert,
  Sliders,
} from 'lucide-react';
import type {
  ControlMode,
  ControllerConfig,
  Direction,
  ScenarioPreset,
  SystemSnapshot,
} from '../types/traffic';

interface SignalControllerViewProps {
  snapshot: SystemSnapshot;
  onSetMode: (mode: ControlMode) => Promise<void>;
  onSetScenario: (scenario: ScenarioPreset) => Promise<void>;
  onTriggerEmergency: (dir: Direction) => Promise<void>;
  onClearEmergency: () => Promise<void>;
  onSaveConfig: (
    payload: Partial<ControllerConfig> & {
      approachOverrides?: Partial<
        Record<Direction, { arrivalRatePerMin?: number }>
      >;
    }
  ) => Promise<void>;
}

const DIRECTIONS: Direction[] = ['north', 'south', 'east', 'west'];

const SCENARIOS: Array<{
  id: ScenarioPreset;
  label: string;
  summary: string;
}> = [
  {
    id: 'NS_ARTERIAL_SURGE',
    label: 'North–South Arterial Surge',
    summary: 'Heavy North/South commuter wave (32–34 veh/min) with light East/West cross traffic.',
  },
  {
    id: 'RUSH_HOUR',
    label: 'Peak Rush Hour',
    summary: 'High arrival rates across all four corridors testing maximum green cap and fairness.',
  },
  {
    id: 'BALANCED',
    label: 'Balanced Urban Flow',
    summary: 'Moderate steady arrivals (16–18 veh/min) across North, South, East, and West.',
  },
  {
    id: 'EMERGENCY_DISPATCH',
    label: 'Ambulance Preemption Test',
    summary: 'Dispatches an emergency ambulance on West Corridor to verify automatic green wave.',
  },
  {
    id: 'EXTERNAL_YOLO',
    label: 'External Python YOLO Stream',
    summary: 'Holds internal stochastic arrivals so external Python script POSTs drive queues exclusively.',
  },
];

export const SignalControllerView: React.FC<SignalControllerViewProps> = ({
  snapshot,
  onSetMode,
  onSetScenario,
  onTriggerEmergency,
  onClearEmergency,
  onSaveConfig,
}) => {
  const [minGreenSec, setMinGreenSec] = useState<number>(
    snapshot.config.minGreenSec
  );
  const [maxGreenSec, setMaxGreenSec] = useState<number>(
    snapshot.config.maxGreenSec
  );
  const [fixedGreenSec, setFixedGreenSec] = useState<number>(
    snapshot.config.fixedGreenSec
  );
  const [yellowClearanceSec, setYellowClearanceSec] = useState<number>(
    snapshot.config.yellowClearanceSec
  );
  const [allRedBufferSec, setAllRedBufferSec] = useState<number>(
    snapshot.config.allRedBufferSec
  );
  const [autoEmergencyPreempt, setAutoEmergencyPreempt] = useState<boolean>(
    snapshot.config.autoEmergencyPreempt
  );
  const [arrivalRates, setArrivalRates] = useState<Record<Direction, number>>({
    north: snapshot.approaches.north.arrivalRatePerMin,
    south: snapshot.approaches.south.arrivalRatePerMin,
    east: snapshot.approaches.east.arrivalRatePerMin,
    west: snapshot.approaches.west.arrivalRatePerMin,
  });
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  useEffect(() => {
    setMinGreenSec(snapshot.config.minGreenSec);
    setMaxGreenSec(snapshot.config.maxGreenSec);
    setFixedGreenSec(snapshot.config.fixedGreenSec);
    setYellowClearanceSec(snapshot.config.yellowClearanceSec);
    setAllRedBufferSec(snapshot.config.allRedBufferSec);
    setAutoEmergencyPreempt(snapshot.config.autoEmergencyPreempt);
    setArrivalRates({
      north: snapshot.approaches.north.arrivalRatePerMin,
      south: snapshot.approaches.south.arrivalRatePerMin,
      east: snapshot.approaches.east.arrivalRatePerMin,
      west: snapshot.approaches.west.arrivalRatePerMin,
    });
  }, [snapshot.config, snapshot.activeScenario]);

  const handleApplyParameters = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveConfig({
      minGreenSec,
      maxGreenSec: Math.max(minGreenSec + 5, maxGreenSec),
      fixedGreenSec,
      yellowClearanceSec,
      allRedBufferSec,
      autoEmergencyPreempt,
      approachOverrides: {
        north: { arrivalRatePerMin: arrivalRates.north },
        south: { arrivalRatePerMin: arrivalRates.south },
        east: { arrivalRatePerMin: arrivalRates.east },
        west: { arrivalRatePerMin: arrivalRates.west },
      },
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2200);
  };

  const handleResetDefaults = async () => {
    await onSaveConfig({
      minGreenSec: 12,
      maxGreenSec: 55,
      fixedGreenSec: 30,
      yellowClearanceSec: 3,
      allRedBufferSec: 2,
      autoEmergencyPreempt: true,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2200);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-50 text-balance">
          Adaptive Traffic Signal Controller & Preemption
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Configure dynamic green-phase bounds, Passenger Car Unit (PCU)
          optimization mode, traffic demand scenarios, and emergency vehicle
          corridors.
        </p>
      </div>

      {/* Mode Selection & Emergency Corridor Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Control Algorithm Selector */}
        <div className="lg:col-span-6 p-6 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-base font-semibold text-slate-100">
                Signal Timing Strategy
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                Active: {snapshot.mode.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-slate-400">
              Adaptive AI computes phase duration dynamically from real-time
              YOLO PCU weights, queue wait time, and early gap-out termination
              when a lane clears.
            </p>

            {/* Segmented Mode Control */}
            <div className="mt-5 inline-flex p-1 rounded-lg bg-slate-950 border border-slate-800">
              <button
                type="button"
                onClick={() => onSetMode('ADAPTIVE')}
                className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  snapshot.mode === 'ADAPTIVE'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                Adaptive AI Optimization
              </button>
              <button
                type="button"
                onClick={() => onSetMode('FIXED')}
                className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  snapshot.mode === 'FIXED'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                Fixed-Time Baseline ({snapshot.config.fixedGreenSec}s)
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
            <span>Adaptive Wait: {snapshot.avgWaitSec.toFixed(1)}s</span>
            <span aria-hidden="true">·</span>
            <span>Fixed Baseline: {snapshot.fixedBaselineWaitSec.toFixed(1)}s</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400 font-semibold">
              -{snapshot.waitReductionPct}% Delay
            </span>
          </div>
        </div>

        {/* Emergency Preemption Matrix */}
        <div className="lg:col-span-6 p-6 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-base font-semibold text-slate-100">
                Emergency Green Corridor Preemption
              </h3>
              {snapshot.mode === 'EMERGENCY_PREEMPT' && (
                <button
                  type="button"
                  onClick={onClearEmergency}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  Clear Preemption
                </button>
              )}
            </div>
            <p className="mt-1.5 text-sm text-slate-400">
              Safely transitions conflicting green phases through{' '}
              {snapshot.config.yellowClearanceSec}s yellow and{' '}
              {snapshot.config.allRedBufferSec}s all-red clearance before opening
              an uninterrupted corridor.
            </p>

            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {DIRECTIONS.map((dir) => {
                const app = snapshot.approaches[dir];
                const isPreemptActive =
                  snapshot.mode === 'EMERGENCY_PREEMPT' &&
                  app.vehicles.emergency > 0;
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => onTriggerEmergency(dir)}
                    className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                      isPreemptActive
                        ? 'bg-red-600 border-red-500 text-white'
                        : 'bg-slate-950 border-slate-800 hover:border-red-500/60 text-slate-200 hover:text-white'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span>{app.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
            <label className="inline-flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoEmergencyPreempt}
                onChange={(e) => {
                  const val = e.target.checked;
                  setAutoEmergencyPreempt(val);
                  onSaveConfig({ autoEmergencyPreempt: val });
                }}
                className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500"
              />
              <span>
                Automatically preempt signal when YOLO detects ambulance or fire
                apparatus
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Traffic Scenario Presets */}
      <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Traffic Flow Scenarios
            </h3>
            <p className="text-sm text-slate-400 mt-0.5">
              Switch arrival patterns to observe real-time adaptive signal
              re-allocation across approaches.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            Selected: {snapshot.activeScenario.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {SCENARIOS.map((sc) => {
            const active = snapshot.activeScenario === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => onSetScenario(sc.id)}
                className={`p-3.5 rounded-lg text-left border transition-colors flex flex-col justify-between ${
                  active
                    ? 'bg-blue-950/30 border-blue-500/80 text-slate-50'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="text-xs font-semibold text-slate-100">
                  {sc.label}
                </div>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  {sc.summary}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Controller Timing Bounds & Corridor Arrival Rates Form */}
      <form
        onSubmit={handleApplyParameters}
        className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-blue-400 shrink-0" />
            <h3 className="text-base font-semibold text-slate-100">
              Phase Timing Bounds & Corridor Arrival Calibration
            </h3>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{savedNotice ? 'Parameters Saved' : 'Apply Parameters'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Minimum Green (s)
            </label>
            <input
              type="number"
              min={5}
              max={40}
              value={minGreenSec}
              onChange={(e) => setMinGreenSec(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Maximum Green (s)
            </label>
            <input
              type="number"
              min={15}
              max={120}
              value={maxGreenSec}
              onChange={(e) => setMaxGreenSec(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Fixed Baseline Green (s)
            </label>
            <input
              type="number"
              min={10}
              max={90}
              value={fixedGreenSec}
              onChange={(e) => setFixedGreenSec(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Yellow Clearance (s)
            </label>
            <input
              type="number"
              min={2}
              max={6}
              value={yellowClearanceSec}
              onChange={(e) => setYellowClearanceSec(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              All-Red Safety Buffer (s)
            </label>
            <input
              type="number"
              min={1}
              max={5}
              value={allRedBufferSec}
              onChange={(e) => setAllRedBufferSec(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Per-Approach Arrival Rate Sliders */}
        <div className="pt-5 border-t border-slate-800">
          <div className="text-xs font-medium text-slate-300 mb-4">
            Simulated Approach Arrival Rates (Vehicles / Minute)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {DIRECTIONS.map((dir) => {
              const app = snapshot.approaches[dir];
              return (
                <div key={dir} className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">
                      {app.label} ({app.roadName})
                    </span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {arrivalRates[dir]} veh/min
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={55}
                    value={arrivalRates[dir]}
                    onChange={(e) =>
                      setArrivalRates((prev) => ({
                        ...prev,
                        [dir]: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* PCU Reference Formula Note */}
        <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono tabular-nums">
          <span>
            PCU Weights: Car {snapshot.config.pcuWeights.cars.toFixed(1)} · Bike{' '}
            {snapshot.config.pcuWeights.bikes.toFixed(1)} · Bus{' '}
            {snapshot.config.pcuWeights.buses.toFixed(1)} · Truck{' '}
            {snapshot.config.pcuWeights.trucks.toFixed(1)} · Emergency{' '}
            {snapshot.config.pcuWeights.emergency.toFixed(1)}
          </span>
          <span>
            Formula: T_green = clamp(T_min + 1.15 × PCU + 0.16 × Wait, T_min,
            T_max)
          </span>
        </div>
      </form>
    </div>
  );
};
