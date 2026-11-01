import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Eye,
  EyeOff,
  FileCode2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sliders,
  Upload,
} from 'lucide-react';
import { CAMERA_IMAGES, resolveApproachBoxes } from '../data/cameraAssets';
import type {
  DashboardTelemetry,
  DirectionKey,
  SignalStrategy,
} from '../types/flowai';

interface ControllerAndYoloPanelProps {
  mode: 'cameras' | 'controller' | 'integration';
  telemetry: DashboardTelemetry;
  selectedDirection: DirectionKey;
  onSelectDirection: (dir: DirectionKey) => void;
  onUpdateBackend: (payload: Record<string, unknown>) => Promise<void>;
}

const DIRECTIONS: DirectionKey[] = ['north', 'south', 'east', 'west'];

export const ControllerAndYoloPanel: React.FC<ControllerAndYoloPanelProps> = ({
  mode,
  telemetry,
  selectedDirection,
  onSelectDirection,
  onUpdateBackend,
}) => {
  const [showBoxes, setShowBoxes] = useState<boolean>(true);
  const [failedImgs, setFailedImgs] = useState<Record<string, boolean>>({});
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [uploadTargetDir, setUploadTargetDir] = useState<DirectionKey>('north');
  const [detectingUpload, setDetectingUpload] = useState<boolean>(false);
  const [uploadSummary, setUploadSummary] = useState<{
    total: number;
    classes: Record<string, number>;
    boxes: Array<{
      id: string;
      label: string;
      confidence: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Timing & traffic inputs bound to Python backend
  const [minGreen, setMinGreen] = useState<number>(
    telemetry.adaptive_controller.min_green
  );
  const [maxGreen, setMaxGreen] = useState<number>(
    telemetry.adaptive_controller.max_green
  );
  const [yellowSec, setYellowSec] = useState<number>(
    telemetry.adaptive_controller.yellow_seconds
  );
  const [allRedSec, setAllRedSec] = useState<number>(
    telemetry.adaptive_controller.all_red_seconds
  );
  const [editCounts, setEditCounts] = useState<Record<DirectionKey, number>>({
    north: telemetry.approaches.north.vehicle_count,
    south: telemetry.approaches.south.vehicle_count,
    east: telemetry.approaches.east.vehicle_count,
    west: telemetry.approaches.west.vehicle_count,
  });
  const [savedFlag, setSavedFlag] = useState<boolean>(false);

  // Live API Contract output inspector
  const [contractCurrentJson, setContractCurrentJson] = useState<string>('');
  const [contractDecisionJson, setContractDecisionJson] = useState<string>('');

  useEffect(() => {
    setMinGreen(telemetry.adaptive_controller.min_green);
    setMaxGreen(telemetry.adaptive_controller.max_green);
    setYellowSec(telemetry.adaptive_controller.yellow_seconds);
    setAllRedSec(telemetry.adaptive_controller.all_red_seconds);
  }, [
    telemetry.adaptive_controller.min_green,
    telemetry.adaptive_controller.max_green,
    telemetry.adaptive_controller.yellow_seconds,
    telemetry.adaptive_controller.all_red_seconds,
  ]);

  const fetchContractEndpoints = async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/traffic/current'),
        fetch('/api/control/decision'),
      ]);
      if (r1.ok) {
        setContractCurrentJson(JSON.stringify(await r1.json(), null, 2));
      }
      if (r2.ok) {
        setContractDecisionJson(JSON.stringify(await r2.json(), null, 2));
      }
    } catch {
      // Ignore transient network errors
    }
  };

  useEffect(() => {
    if (mode === 'integration') {
      fetchContractEndpoints();
    }
  }, [mode]);

  const handleUploadSnapshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setDetectingUpload(true);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result ?? '');
      setUploadUrl(base64);
      try {
        const res = await fetch('/api/yolo/detect-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: file.type || 'image/jpeg',
            applyToDirection: uploadTargetDir,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Frame detection failed');
        setUploadSummary(data);
      } catch (err: unknown) {
        setUploadError(
          err instanceof Error ? err.message : 'Snapshot analysis failed'
        );
      } finally {
        setDetectingUpload(false);
      }
    };
    reader.readAsDataURL(file);
  };

  if (mode === 'cameras') {
    return (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-50 text-balance">
              YOLOv8 Four-Approach Detection Feeds
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Visualizes North, South, East, and West streams classified by{' '}
              <code>flowai_multidirection_adaptive.py</code> and{' '}
              <code>detect_vehicles.py</code>.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowBoxes((v) => !v)}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            {showBoxes ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>Hide YOLO Boxes</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>Show YOLO Boxes</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {DIRECTIONS.map((dir) => {
            const app = telemetry.approaches[dir];
            const boxes = resolveApproachBoxes(app, telemetry.yolo_detections);
            const imgFailed = Boolean(failedImgs[dir]);
            return (
              <div
                key={dir}
                onClick={() => onSelectDirection(dir)}
                className={`rounded-xl bg-slate-900/80 border overflow-hidden cursor-pointer transition-colors ${
                  selectedDirection === dir
                    ? 'border-blue-500/80'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="relative aspect-video bg-slate-950 overflow-hidden">
                  {!imgFailed ? (
                    <img
                      src={CAMERA_IMAGES[dir]}
                      alt={`Traffic monitoring camera view for ${app.label} approach`}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedImgs((prev) => ({ ...prev, [dir]: true }))
                      }
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 p-6">
                      <Camera className="w-8 h-8 text-slate-500 mb-2" />
                      <span className="text-sm font-medium text-slate-200">
                        {app.label} Stream
                      </span>
                    </div>
                  )}

                  <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/80 via-black/35 to-transparent" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

                  <div className="absolute top-3 left-3.5 right-3.5 flex items-center justify-between text-xs font-mono tabular-nums text-slate-100">
                    <span className="font-semibold">
                      {app.label.toUpperCase()} STREAM
                    </span>
                    <span>
                      Queue: {app.queue_length} · Wait:{' '}
                      {app.waiting_time_seconds}s
                    </span>
                  </div>

                  {showBoxes &&
                    boxes.map((box) => (
                      <div
                        key={box.id}
                        className="pointer-events-none absolute border-2 border-emerald-400"
                        style={{
                          left: `${box.x}%`,
                          top: `${box.y}%`,
                          width: `${box.width}%`,
                          height: `${box.height}%`,
                        }}
                      >
                        <span className="absolute -top-5 left-0 px-1 py-0.5 text-[10px] leading-none font-mono font-semibold bg-emerald-500 text-slate-950 whitespace-nowrap">
                          {box.vehicle} {box.confidence.toFixed(2)}
                        </span>
                      </div>
                    ))}

                  <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center justify-between text-xs font-mono tabular-nums text-slate-100">
                    <span>
                      {app.vehicle_count} vehicles · {app.density} DENSITY
                    </span>
                    <span
                      className={
                        app.signal === 'GREEN'
                          ? 'text-emerald-400 font-semibold'
                          : app.signal === 'YELLOW'
                            ? 'text-amber-400 font-semibold'
                            : 'text-red-400 font-semibold'
                      }
                    >
                      {app.signal} ({app.remaining_seconds}s)
                    </span>
                  </div>
                </div>

                <div className="p-4 flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span>{app.signal_suggestion}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateBackend({
                        action: 'force_direction',
                        direction: dir.toUpperCase(),
                      });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium transition-colors whitespace-nowrap shrink-0"
                  >
                    Grant Green
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Upload Road Frame for Live Detection Injection */}
        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Analyze Traffic Snapshot & Push to Python Controller
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload a traffic frame to classify vehicles (Car, Motorcycle,
                Bicycle, Bus, Truck) and inject real counts into any approach.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <select
                value={uploadTargetDir}
                onChange={(e) =>
                  setUploadTargetDir(e.target.value as DirectionKey)
                }
                className="px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
              >
                <option value="north">Apply to North</option>
                <option value="south">Apply to South</option>
                <option value="east">Apply to East</option>
                <option value="west">Apply to West</option>
              </select>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleUploadSnapshot}
                className="hidden"
              />
              <button
                type="button"
                disabled={detectingUpload}
                onClick={() => fileRef.current?.click()}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                {detectingUpload ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Detecting...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Traffic Image</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {uploadError && (
            <div className="mt-4 p-3 rounded-lg bg-red-950/40 border border-red-900/60 text-xs text-red-300">
              {uploadError}
            </div>
          )}

          {uploadUrl ? (
            <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 relative aspect-video rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
                <img
                  src={uploadUrl}
                  alt="Uploaded traffic camera frame"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                {uploadSummary &&
                  showBoxes &&
                  uploadSummary.boxes.map((b) => (
                    <div
                      key={b.id}
                      className="pointer-events-none absolute border-2 border-emerald-400"
                      style={{
                        left: `${b.x}%`,
                        top: `${b.y}%`,
                        width: `${b.width}%`,
                        height: `${b.height}%`,
                      }}
                    >
                      <span className="absolute -top-5 left-0 px-1 py-0.5 text-[10px] leading-none font-mono font-semibold bg-emerald-500 text-slate-950 whitespace-nowrap">
                        {b.label} {b.confidence.toFixed(2)}
                      </span>
                    </div>
                  ))}
              </div>
              <div className="lg:col-span-5 space-y-3">
                {uploadSummary && (
                  <>
                    <div className="text-xs text-slate-400">
                      Detected & pushed to {uploadTargetDir.toUpperCase()}:
                    </div>
                    <div className="text-2xl font-semibold font-mono tabular-nums text-slate-50">
                      {uploadSummary.total} vehicles
                    </div>
                    <div className="pt-2 border-t border-slate-800 text-xs font-mono tabular-nums text-slate-300 flex flex-wrap gap-2">
                      {Object.entries(uploadSummary.classes).map(([k, v]) => (
                        <span key={k}>
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 py-6 text-center text-xs text-slate-400">
              Or run{' '}
              <code className="text-slate-200">
                python dashboard/run_yolo_live.py
              </code>{' '}
              locally with <code>vehicle_detection/yolov8n.pt</code> and{' '}
              <code>traffic2.mp4</code> to stream video frames automatically.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'controller') {
    const handleSaveTimings = async (e: React.FormEvent) => {
      e.preventDefault();
      await onUpdateBackend({
        action: 'update_timings',
        min_green: minGreen,
        max_green: maxGreen,
        yellow_seconds: yellowSec,
        all_red_seconds: allRedSec,
      });
      setSavedFlag(true);
      setTimeout(() => setSavedFlag(false), 2000);
    };

    const handleInjectCounts = async () => {
      await onUpdateBackend({
        action: 'set_counts',
        traffic_data: {
          north: {
            vehicle_count: editCounts.north,
            queue_length: Math.round(editCounts.north * 0.5),
          },
          south: {
            vehicle_count: editCounts.south,
            queue_length: Math.round(editCounts.south * 0.5),
          },
          east: {
            vehicle_count: editCounts.east,
            queue_length: Math.round(editCounts.east * 0.5),
          },
          west: {
            vehicle_count: editCounts.west,
            queue_length: Math.round(editCounts.west * 0.5),
          },
        },
      });
      setSavedFlag(true);
      setTimeout(() => setSavedFlag(false), 2000);
    };

    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-semibold text-slate-50 text-balance">
            Python Adaptive Signal Controller & Optimizer Workbench
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Directly controls both{' '}
            <code>vehicle_detection/adaptive_signal_controller.py</code>{' '}
            (single-approach + pedestrian crossing) and{' '}
            <code>controller/optimizer.py</code> (paired North–South /
            East–West corridors).
          </p>
        </div>

        {/* Controller Strategy Switcher */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">
                Active Python Controller Module
              </h3>
              <span className="text-xs font-mono text-emerald-400">
                Live Python Execution
              </span>
            </div>

            <div className="inline-flex p-1 rounded-lg bg-slate-950 border border-slate-800">
              {(
                [
                  {
                    id: 'single_approach' as SignalStrategy,
                    label: 'AdaptiveSignalController (4-Phase)',
                  },
                  {
                    id: 'corridor_pair' as SignalStrategy,
                    label: 'Corridor Optimizer (N–S / E–W)',
                  },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    onUpdateBackend({
                      action: 'set_strategy',
                      strategy: item.id,
                    })
                  }
                  className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    telemetry.signal_strategy === item.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-800 text-xs text-slate-300 space-y-1.5 font-mono tabular-nums">
              <div>
                Single-Approach State: {telemetry.adaptive_controller.phase} ·
                Active:{' '}
                {telemetry.adaptive_controller.active_direction ?? 'NONE'} (
                {telemetry.adaptive_controller.remaining_seconds}s)
              </div>
              <div className="text-slate-400">
                Reason: {telemetry.adaptive_controller.reason}
              </div>
            </div>
          </div>

          <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">
                Corridor Demand Scores (controller/optimizer.py)
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                5×Queue + 2×Veh + 1×Wait
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <div className="text-xs text-slate-400">
                  North–South Demand Score
                </div>
                <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-50">
                  {telemetry.corridor_optimizer.demand_scores.north_south.toFixed(
                    1
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">
                  East–West Demand Score
                </div>
                <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-50">
                  {telemetry.corridor_optimizer.demand_scores.east_west.toFixed(
                    1
                  )}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 text-xs font-mono tabular-nums text-slate-400">
              Recommended Corridor:{' '}
              <span className="text-emerald-400 font-semibold">
                {telemetry.corridor_optimizer.green_direction.toUpperCase()}
              </span>{' '}
              · Duration: {telemetry.corridor_optimizer.green_duration}s
            </div>
          </div>
        </div>

        {/* Timing Configuration Form */}
        <form
          onSubmit={handleSaveTimings}
          className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-400" />
              <h3 className="text-base font-semibold text-slate-100">
                AdaptiveSignalController Timing Parameters
              </h3>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onUpdateBackend({ action: 'reset_sample' })}
                className="px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to sample_traffic.json</span>
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{savedFlag ? 'Updated' : 'Save Timings'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                min_green (seconds)
              </label>
              <input
                type="number"
                min={3}
                max={40}
                value={minGreen}
                onChange={(e) => setMinGreen(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono tabular-nums text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                max_green (seconds)
              </label>
              <input
                type="number"
                min={10}
                max={90}
                value={maxGreen}
                onChange={(e) => setMaxGreen(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono tabular-nums text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                yellow_seconds
              </label>
              <input
                type="number"
                min={1}
                max={8}
                value={yellowSec}
                onChange={(e) => setYellowSec(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono tabular-nums text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                all_red_seconds
              </label>
              <input
                type="number"
                min={1}
                max={6}
                value={allRedSec}
                onChange={(e) => setAllRedSec(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono tabular-nums text-slate-100"
              />
            </div>
          </div>

          {/* Direct Vehicle Demand Sliders */}
          <div className="pt-5 border-t border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">
                Override Approach Vehicle Counts (Tests Demand Priority)
              </span>
              <button
                type="button"
                onClick={handleInjectCounts}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                Push Vehicle Counts
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {DIRECTIONS.map((d) => (
                <div key={d} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="capitalize text-slate-300">{d}</span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {editCounts[d]} veh
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={45}
                    value={editCounts[d]}
                    onChange={(e) =>
                      setEditCounts((prev) => ({
                        ...prev,
                        [d]: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
              ))}
            </div>
          </div>
        </form>
      </div>
    );
  }

  // mode === 'integration'
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-50 text-balance">
          Madan-G81/FlowAI Repository & API Contract Integration
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Live verification of existing repository Python modules (unmodified)
          and real-time responses from <code>docs/API_CONTRACT.md</code>{' '}
          endpoints.
        </p>
      </div>

      {/* Existing Python Files Verification Table */}
      <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-blue-400" />
            <h3 className="text-base font-semibold text-slate-100">
              Existing Repository Python Modules Status
            </h3>
          </div>
          <span className="text-xs font-mono text-emerald-400">
            Branch: flowai-dashboard · Existing files untouched
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-4 font-medium">Repository Path</th>
                <th className="py-2 px-4 font-medium text-right">Line Count</th>
                <th className="py-2 pl-4 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {telemetry.repo_files.map((f) => (
                <tr key={f.path} className="h-9">
                  <td className="py-1.5 pr-4 font-mono text-slate-200">
                    {f.path}
                  </td>
                  <td className="py-1.5 px-4 text-right font-mono tabular-nums text-slate-400">
                    {f.exists ? `${f.lines} lines` : 'Optional'}
                  </td>
                  <td className="py-1.5 pl-4 text-right font-mono">
                    {f.exists ? (
                      <span className="text-emerald-400">Preserved</span>
                    ) : (
                      <span className="text-slate-500">Not on main</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live API Contract Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-sm font-semibold font-mono text-slate-100">
              GET /api/traffic/current
            </span>
            <button
              type="button"
              onClick={fetchContractEndpoints}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
          <pre className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">
            {contractCurrentJson || 'Loading...'}
          </pre>
        </div>

        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-sm font-semibold font-mono text-slate-100">
              GET /api/control/decision
            </span>
            <span className="text-xs font-mono text-slate-400">
              controller/optimizer.py
            </span>
          </div>
          <pre className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">
            {contractDecisionJson || 'Loading...'}
          </pre>
        </div>
      </div>
    </div>
  );
};
