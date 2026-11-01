import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  ApproachState,
  Direction,
  SignalColor,
} from '../types/traffic';

interface DirectionStatusGridProps {
  approaches: Record<Direction, ApproachState>;
  selectedDirection: Direction;
  onSelectDirection: (dir: Direction) => void;
  onGrantGreen: (dir: Direction) => void;
  onOpenCamera: (dir: Direction) => void;
}

const ORDERED_DIRECTIONS: Direction[] = ['north', 'south', 'east', 'west'];

function SignalLampIndicator({ signal }: { signal: SignalColor }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-950 border border-slate-800"
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

export const DirectionStatusGrid: React.FC<DirectionStatusGridProps> = ({
  approaches,
  selectedDirection,
  onSelectDirection,
  onGrantGreen,
  onOpenCamera,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {ORDERED_DIRECTIONS.map((dir) => {
        const app = approaches[dir];
        const isSelected = selectedDirection === dir;
        const densityPct = Math.min(100, Math.round((app.pcuScore / 36) * 100));

        const densityTextColor =
          app.density === 'High'
            ? 'text-red-400'
            : app.density === 'Medium'
              ? 'text-amber-400'
              : 'text-emerald-400';

        const densityBarColor =
          app.density === 'High'
            ? 'bg-red-500'
            : app.density === 'Medium'
              ? 'bg-amber-500'
              : 'bg-emerald-500';

        const signalLabelColor =
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
            {/* Header Row: Direction Name & Signal State */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{app.cameraId}</span>
                  <span aria-hidden="true">·</span>
                  <span>{app.roadName}</span>
                </div>
                <h3 className="mt-0.5 text-base font-semibold text-slate-100">
                  {app.label} Direction
                </h3>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <div className="text-right">
                  <div
                    className={`text-xs font-semibold tracking-wide ${signalLabelColor}`}
                  >
                    {app.signal}
                  </div>
                  <div className="font-mono tabular-nums text-xs text-slate-300">
                    {app.countdownSec}s
                  </div>
                </div>
                <SignalLampIndicator signal={app.signal} />
              </div>
            </div>

            {/* Primary Metrics Row: Live Vehicle Count & Density */}
            <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-400">Live Vehicle Count</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold font-mono tabular-nums text-slate-50">
                    {app.vehicleCount}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-400">
                    {app.pcuScore.toFixed(1)} PCU
                  </span>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400">Traffic Density</div>
                <div className="mt-1 flex items-center gap-1.5">
                  {app.emergencyDetected ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  ) : (
                    <CheckCircle2
                      className={`w-3.5 h-3.5 shrink-0 ${densityTextColor}`}
                    />
                  )}
                  <span className={`text-sm font-semibold ${densityTextColor}`}>
                    {app.density}
                  </span>
                  <span className="text-xs text-slate-500">·</span>
                  <span className="text-xs font-mono tabular-nums text-slate-400">
                    {app.queueLengthMeters}m
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-transform duration-200 origin-left ${densityBarColor}`}
                    style={{
                      transform: `scaleX(${Math.max(0.06, densityPct / 100)})`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Class Breakdown */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
              <span>Cars {app.vehicles.cars}</span>
              <span aria-hidden="true">·</span>
              <span>Bikes {app.vehicles.bikes}</span>
              <span aria-hidden="true">·</span>
              <span>Buses {app.vehicles.buses}</span>
              <span aria-hidden="true">·</span>
              <span>Trucks {app.vehicles.trucks}</span>
              {app.vehicles.emergency > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-red-400 font-semibold">
                    Emerg {app.vehicles.emergency}
                  </span>
                </>
              )}
            </div>

            {/* Adaptive Timer & Actions */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono tabular-nums">
                <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Green {app.allocatedGreenSec}s</span>
                <span aria-hidden="true">·</span>
                <span>Wait {Math.round(app.avgWaitSec)}s</span>
              </div>

              <div
                className="flex items-center gap-2 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onOpenCamera(dir)}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <span>Camera</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={app.signal === 'GREEN'}
                  onClick={() => onGrantGreen(dir)}
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
