import React from 'react';
import {
  CheckCircle2,
  Clock,
  Footprints,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  ApproachTelemetry,
  DirectionKey,
  SignalLamp,
} from '../types/flowai';

interface ApproachCardsGridProps {
  approaches: Record<DirectionKey, ApproachTelemetry>;
  selectedDirection: DirectionKey;
  onSelectDirection: (dir: DirectionKey) => void;
  onForceGreen: (dir: DirectionKey) => void;
  onRequestPedestrian: (dir: DirectionKey) => void;
}

const ORDERED_DIRS: DirectionKey[] = ['north', 'south', 'east', 'west'];

function SignalHousing({ signal }: { signal: SignalLamp }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800"
      aria-label={`Traffic signal is ${signal}`}
    >
      <span
        className={`w-2.5 h-2.5 rounded-full ${
          signal === 'RED' ? 'bg-red-500' : 'bg-red-950/60'
        }`}
      />
      <span
        className={`w-2.5 h-2.5 rounded-full ${
          signal === 'YELLOW' ? 'bg-amber-400' : 'bg-amber-950/60'
        }`}
      />
      <span
        className={`w-2.5 h-2.5 rounded-full ${
          signal === 'GREEN' ? 'bg-emerald-500' : 'bg-emerald-950/60'
        }`}
      />
    </div>
  );
}

export const ApproachCardsGrid: React.FC<ApproachCardsGridProps> = ({
  approaches,
  selectedDirection,
  onSelectDirection,
  onForceGreen,
  onRequestPedestrian,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {ORDERED_DIRS.map((dir) => {
        const app = approaches[dir];
        const isSelected = selectedDirection === dir;
        const densityRatio = Math.min(1, Math.max(0.06, app.vehicle_count / 32));

        const densityTextClass =
          app.density === 'HIGH'
            ? 'text-red-400'
            : app.density === 'MEDIUM'
              ? 'text-amber-400'
              : 'text-emerald-400';

        const densityBarClass =
          app.density === 'HIGH'
            ? 'bg-red-500'
            : app.density === 'MEDIUM'
              ? 'bg-amber-500'
              : 'bg-emerald-500';

        const signalTextClass =
          app.signal === 'GREEN'
            ? 'text-emerald-400'
            : app.signal === 'YELLOW'
              ? 'text-amber-400'
              : 'text-red-400';

        return (
          <div
            key={dir}
            onClick={() => onSelectDirection(dir)}
            className={`p-5 rounded-xl bg-slate-900/80 border transition-colors cursor-pointer ${
              isSelected
                ? 'border-blue-500/80 bg-slate-900'
                : 'border-slate-800 hover:border-slate-700'
            }`}
          >
            {/* Header: Approach Title & Live Signal State */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                  <span>Demand {app.demand_score.toFixed(0)}</span>
                  <span aria-hidden="true">·</span>
                  <span>Queue {app.queue_length} veh</span>
                </div>
                <h3 className="mt-0.5 text-base font-semibold text-slate-100">
                  {app.label} Approach
                </h3>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <div className="text-right">
                  <div
                    className={`text-xs font-semibold tracking-wide ${signalTextClass}`}
                  >
                    {app.signal}
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-300">
                    {app.remaining_seconds}s
                  </div>
                </div>
                <SignalHousing signal={app.signal} />
              </div>
            </div>

            {/* Primary Numbers: Live Vehicle Count & Density */}
            <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-400">Live Vehicle Count</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold font-mono tabular-nums text-slate-50">
                    {app.vehicle_count}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-400">
                    Wait {app.waiting_time_seconds}s
                  </span>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400">Traffic Density</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <CheckCircle2
                    className={`w-3.5 h-3.5 shrink-0 ${densityTextClass}`}
                  />
                  <span className={`text-sm font-semibold ${densityTextClass}`}>
                    {app.density}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-transform duration-200 origin-left ${densityBarClass}`}
                    style={{ transform: `scaleX(${densityRatio})` }}
                  />
                </div>
              </div>
            </div>

            {/* YOLOv8 5-Category Breakdown (from detect_vehicles.py) */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1 text-xs text-slate-400 font-mono tabular-nums">
              <span>Car {app.vehicle_classes.Car}</span>
              <span aria-hidden="true">·</span>
              <span>Moto {app.vehicle_classes.Motorcycle}</span>
              <span aria-hidden="true">·</span>
              <span>Bike {app.vehicle_classes.Bicycle}</span>
              <span aria-hidden="true">·</span>
              <span>Bus {app.vehicle_classes.Bus}</span>
              <span aria-hidden="true">·</span>
              <span>Truck {app.vehicle_classes.Truck}</span>
            </div>

            {/* Actions */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono tabular-nums">
                <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Alloc {app.allocated_green_seconds}s</span>
                {app.pedestrian_waiting > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-sky-400">
                      Ped {app.pedestrian_waiting}
                    </span>
                  </>
                )}
              </div>

              <div
                className="flex items-center gap-2 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onRequestPedestrian(dir)}
                  title="Request pedestrian walk crossing phase in AdaptiveSignalController"
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Footprints className="w-3.5 h-3.5" />
                  <span>Ped Walk</span>
                </button>
                <button
                  type="button"
                  disabled={app.signal === 'GREEN'}
                  onClick={() => onForceGreen(dir)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    app.signal === 'GREEN'
                      ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/60 cursor-default'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>
                    {app.signal === 'GREEN' ? 'Active Green' : 'Grant Green'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
