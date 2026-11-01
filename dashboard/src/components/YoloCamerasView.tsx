import React, { useRef, useState } from 'react';
import {
  Camera,
  Eye,
  EyeOff,
  Loader2,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import {
  CAMERA_FEED_IMAGES,
  getDisplayDetectionsForApproach,
} from '../data/cameraAssets';
import type {
  BoundingBoxDetection,
  Direction,
  SystemSnapshot,
  VehicleClassLabel,
  VisionDetectionResult,
} from '../types/traffic';

interface YoloCamerasViewProps {
  snapshot: SystemSnapshot;
  focusedDirection: Direction;
  onSelectDirection: (dir: Direction) => void;
  onGrantGreen: (dir: Direction) => void;
}

const DIRECTIONS: Direction[] = ['north', 'south', 'east', 'west'];

function getBoxStrokeClasses(label: VehicleClassLabel): {
  border: string;
  tagBg: string;
} {
  switch (label) {
    case 'ambulance':
      return {
        border: 'border-red-500',
        tagBg: 'bg-red-600 text-white',
      };
    case 'bus':
      return {
        border: 'border-amber-400',
        tagBg: 'bg-amber-500 text-slate-950',
      };
    case 'truck':
      return {
        border: 'border-sky-400',
        tagBg: 'bg-sky-500 text-slate-950',
      };
    case 'motorcycle':
      return {
        border: 'border-emerald-400',
        tagBg: 'bg-emerald-500 text-slate-950',
      };
    default:
      return {
        border: 'border-blue-400',
        tagBg: 'bg-blue-600 text-white',
      };
  }
}

export const YoloCamerasView: React.FC<YoloCamerasViewProps> = ({
  snapshot,
  focusedDirection,
  onSelectDirection,
  onGrantGreen,
}) => {
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(
    null
  );
  const [targetInjectDir, setTargetInjectDir] = useState<Direction>('north');
  const [analyzingFrame, setAnalyzingFrame] = useState<boolean>(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [visionResult, setVisionResult] =
    useState<VisionDetectionResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVisionError(null);
    setAnalyzingFrame(true);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result ?? '');
      setUploadedPreviewUrl(dataUrl);

      try {
        const res = await fetch('/api/yolo/detect-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: dataUrl,
            mimeType: file.type || 'image/jpeg',
            applyToDirection: targetInjectDir,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Frame vehicle detection failed');
        }
        setVisionResult(data as VisionDetectionResult);
      } catch (err: unknown) {
        setVisionError(
          err instanceof Error
            ? err.message
            : 'Unable to analyze uploaded traffic image.'
        );
      } finally {
        setAnalyzingFrame(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-50 text-balance">
            YOLO Multi-Corridor Detection Feeds
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Real-time vehicle localization, Passenger Car Unit (PCU) weighting,
            and emergency vehicle classification across all four approaches.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setShowBoundingBoxes((prev) => !prev)}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            {showBoundingBoxes ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>Hide Bounding Boxes</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>Show Bounding Boxes</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4-Camera Surveillance Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {DIRECTIONS.map((dir) => {
          const app = snapshot.approaches[dir];
          const boxes: BoundingBoxDetection[] =
            getDisplayDetectionsForApproach(app);
          const isFocused = focusedDirection === dir;
          const imgFailed = Boolean(failedImages[dir]);

          return (
            <div
              key={dir}
              onClick={() => onSelectDirection(dir)}
              className={`rounded-xl bg-slate-900/80 border overflow-hidden transition-colors cursor-pointer ${
                isFocused
                  ? 'border-blue-500/80'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Camera Viewport */}
              <div className="relative aspect-video bg-slate-950 overflow-hidden">
                {!imgFailed ? (
                  <img
                    src={CAMERA_FEED_IMAGES[dir]}
                    alt={`Elevated traffic camera feed for ${app.roadName} (${app.label} approach)`}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedImages((prev) => ({ ...prev, [dir]: true }))
                    }
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-400 p-6">
                    <Camera className="w-8 h-8 text-slate-500 mb-2" />
                    <span className="text-sm font-medium text-slate-300">
                      {app.cameraId} · {app.roadName}
                    </span>
                    <span className="text-xs text-slate-500 mt-1">
                      Optical telemetry stream active ({app.vehicleCount}{' '}
                      vehicles tracked)
                    </span>
                  </div>
                )}

                {/* Measured contrast scrim along top & bottom for legibility */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/80 via-black/35 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

                {/* Top Camera Metadata Overlay */}
                <div className="absolute top-3 left-3.5 right-3.5 flex items-center justify-between text-xs text-slate-100 font-mono tabular-nums">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{app.cameraId}</span>
                    <span aria-hidden="true">·</span>
                    <span>{app.roadName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{app.yoloFps.toFixed(1)} FPS</span>
                    <span aria-hidden="true">·</span>
                    <span>{app.yoloInferenceMs.toFixed(1)} ms</span>
                  </div>
                </div>

                {/* YOLO Bounding Boxes Overlay */}
                {showBoundingBoxes &&
                  boxes.map((box) => {
                    const styleInfo = getBoxStrokeClasses(box.label);
                    return (
                      <div
                        key={box.id}
                        className={`pointer-events-none absolute border-2 ${styleInfo.border}`}
                        style={{
                          left: `${box.x}%`,
                          top: `${box.y}%`,
                          width: `${box.width}%`,
                          height: `${box.height}%`,
                        }}
                      >
                        <span
                          className={`absolute -top-5 left-0 px-1 py-0.5 text-[10px] leading-none font-mono font-semibold whitespace-nowrap ${styleInfo.tagBg}`}
                        >
                          {box.label} {box.confidence.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}

                {/* Bottom Signal & Density Overlay */}
                <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center justify-between text-xs text-slate-100">
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span>{app.vehicleCount} vehicles</span>
                    <span aria-hidden="true">·</span>
                    <span>{app.pcuScore.toFixed(1)} PCU</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        app.density === 'High'
                          ? 'text-red-300 font-semibold'
                          : app.density === 'Medium'
                            ? 'text-amber-300 font-semibold'
                            : 'text-emerald-300 font-semibold'
                      }
                    >
                      {app.density} Density
                    </span>
                  </div>

                  <span
                    className={`font-mono tabular-nums font-semibold ${
                      app.signal === 'GREEN'
                        ? 'text-emerald-400'
                        : app.signal === 'YELLOW'
                          ? 'text-amber-400'
                          : 'text-red-400'
                    }`}
                  >
                    {app.signal} ({app.countdownSec}s)
                  </span>
                </div>
              </div>

              {/* Camera Footer Breakdown & Action */}
              <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
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
                        Ambulance {app.vehicles.emergency}
                      </span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  disabled={app.signal === 'GREEN'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onGrantGreen(dir);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    app.signal === 'GREEN'
                      ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/60 cursor-default'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>
                    {app.signal === 'GREEN'
                      ? 'Green Active'
                      : `Prioritize ${app.label}`}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Snapshot Vision Analyzer & Corridor Injector */}
      <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Test Road Camera Snapshot Detection
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Upload any street or intersection frame to detect vehicles,
              compute PCU density, and push live counts directly into a chosen
              approach.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <label
                htmlFor="inject-dir-select"
                className="text-xs text-slate-400 whitespace-nowrap"
              >
                Apply counts to:
              </label>
              <select
                id="inject-dir-select"
                value={targetInjectDir}
                onChange={(e) =>
                  setTargetInjectDir(e.target.value as Direction)
                }
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="north">North Avenue (CAM-01)</option>
                <option value="south">South Boulevard (CAM-02)</option>
                <option value="east">East Expressway (CAM-03)</option>
                <option value="west">West Corridor (CAM-04)</option>
              </select>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              disabled={analyzingFrame}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              {analyzingFrame ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Detecting Vehicles...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Traffic Snapshot</span>
                </>
              )}
            </button>
          </div>
        </div>

        {visionError && (
          <div className="mt-4 p-3 rounded-lg bg-red-950/40 border border-red-900/60 text-xs text-red-300">
            {visionError}
          </div>
        )}

        {uploadedPreviewUrl ? (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 relative rounded-lg overflow-hidden bg-slate-950 border border-slate-800 aspect-video">
              <img
                src={uploadedPreviewUrl}
                alt="Uploaded road traffic snapshot with detected vehicle bounding boxes"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              {visionResult &&
                showBoundingBoxes &&
                visionResult.detections.map((box) => {
                  const styleInfo = getBoxStrokeClasses(box.label);
                  return (
                    <div
                      key={box.id}
                      className={`pointer-events-none absolute border-2 ${styleInfo.border}`}
                      style={{
                        left: `${box.x}%`,
                        top: `${box.y}%`,
                        width: `${box.width}%`,
                        height: `${box.height}%`,
                      }}
                    >
                      <span
                        className={`absolute -top-5 left-0 px-1 py-0.5 text-[10px] leading-none font-mono font-semibold whitespace-nowrap ${styleInfo.tagBg}`}
                      >
                        {box.label} {box.confidence.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
            </div>

            <div className="lg:col-span-5 space-y-4">
              {analyzingFrame ? (
                <div className="space-y-3 py-6">
                  <div className="h-5 w-48 bg-slate-800 rounded animate-pulse" />
                  <div className="h-4 w-full bg-slate-800/70 rounded animate-pulse" />
                  <div className="h-4 w-3/4 bg-slate-800/70 rounded animate-pulse" />
                </div>
              ) : visionResult ? (
                <>
                  <div className="text-xs text-slate-400">
                    Frame Analysis Summary · {visionResult.inferenceMs} ms
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                    <div>
                      <div className="text-xs text-slate-400">
                        Total Detected
                      </div>
                      <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-50">
                        {visionResult.totalCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">
                        Calculated Green
                      </div>
                      <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-emerald-400">
                        {visionResult.recommendedGreenSec}s
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Weighted PCU</div>
                      <div className="mt-1 text-base font-semibold font-mono tabular-nums text-slate-200">
                        {visionResult.pcuScore.toFixed(1)} PCU
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">
                        Classified Density
                      </div>
                      <div className="mt-1 text-base font-semibold text-slate-200">
                        {visionResult.density}
                      </div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-800 text-xs text-slate-300 font-mono tabular-nums flex flex-wrap items-center gap-2">
                    <span>Cars: {visionResult.vehicles.cars}</span>
                    <span>·</span>
                    <span>Bikes: {visionResult.vehicles.bikes}</span>
                    <span>·</span>
                    <span>Buses: {visionResult.vehicles.buses}</span>
                    <span>·</span>
                    <span>Trucks: {visionResult.vehicles.trucks}</span>
                    <span>·</span>
                    <span>Emergency: {visionResult.vehicles.emergency}</span>
                  </div>
                  {visionResult.appliedToDirection && (
                    <p className="text-xs text-emerald-400">
                      Counts synchronized live to{' '}
                      {
                        snapshot.approaches[visionResult.appliedToDirection]
                          .roadName
                      }{' '}
                      signal controller.
                    </p>
                  )}
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-5 py-8 text-center text-sm text-slate-400">
            No custom snapshot uploaded yet. Upload a road camera image to run
            server-side bounding-box vehicle detection and update approach queue
            weights.
          </div>
        )}
      </div>
    </div>
  );
};
