export type Direction = 'north' | 'south' | 'east' | 'west';

export type SignalColor = 'RED' | 'YELLOW' | 'GREEN';

export type DensityLevel = 'Low' | 'Medium' | 'High';

export type ControlMode =
  | 'ADAPTIVE'
  | 'FIXED'
  | 'MANUAL_OVERRIDE'
  | 'EMERGENCY_PREEMPT';

export type ScenarioPreset =
  | 'BALANCED'
  | 'RUSH_HOUR'
  | 'NS_ARTERIAL_SURGE'
  | 'EMERGENCY_DISPATCH'
  | 'EXTERNAL_YOLO';

export type VehicleClassLabel =
  | 'car'
  | 'motorcycle'
  | 'bus'
  | 'truck'
  | 'ambulance';

export interface VehicleBreakdown {
  cars: number;
  bikes: number;
  buses: number;
  trucks: number;
  emergency: number;
}

export interface BoundingBoxDetection {
  id: string;
  label: VehicleClassLabel;
  confidence: number;
  /** Percentage 0..100 from left */
  x: number;
  /** Percentage 0..100 from top */
  y: number;
  /** Percentage 0..100 width */
  width: number;
  /** Percentage 0..100 height */
  height: number;
}

export interface ApproachState {
  direction: Direction;
  label: string;
  roadName: string;
  cameraId: string;
  signal: SignalColor;
  countdownSec: number;
  allocatedGreenSec: number;
  vehicleCount: number;
  pcuScore: number;
  density: DensityLevel;
  avgWaitSec: number;
  queueLengthMeters: number;
  arrivalRatePerMin: number;
  vehicles: VehicleBreakdown;
  yoloFps: number;
  yoloInferenceMs: number;
  confidenceAvg: number;
  emergencyDetected: boolean;
  lastUpdatedIso: string;
  source: 'INTERNAL_SIM' | 'PYTHON_YOLO_API' | 'VISION_FRAME';
  customDetections?: BoundingBoxDetection[];
}

export interface ControllerConfig {
  minGreenSec: number;
  maxGreenSec: number;
  fixedGreenSec: number;
  yellowClearanceSec: number;
  allRedBufferSec: number;
  autoEmergencyPreempt: boolean;
  pcuWeights: {
    cars: number;
    bikes: number;
    buses: number;
    trucks: number;
    emergency: number;
  };
}

export interface PhaseLogEntry {
  id: string;
  timestampIso: string;
  direction: Direction;
  mode: ControlMode;
  allocatedGreenSec: number;
  vehiclesCleared: number;
  pcuAtStart: number;
  densityAtStart: DensityLevel;
  reason: string;
}

export interface HistoricalPoint {
  timestamp: string;
  northCount: number;
  southCount: number;
  eastCount: number;
  westCount: number;
  adaptiveAvgWaitSec: number;
  fixedBaselineWaitSec: number;
  throughputPerMin: number;
}

export interface SystemSnapshot {
  intersectionId: string;
  intersectionName: string;
  serverTimeIso: string;
  uptimeSec: number;
  mode: ControlMode;
  simulationPaused: boolean;
  activeScenario: ScenarioPreset;
  activeGreenDirection: Direction | null;
  activePhaseDirection: Direction;
  nextScheduledDirection: Direction;
  phaseStage: 'GREEN_FLOW' | 'YELLOW_CLEARANCE' | 'ALL_RED_BUFFER';
  cycleCount: number;
  totalVehiclesActive: number;
  totalVehiclesClearedToday: number;
  avgWaitSec: number;
  fixedBaselineWaitSec: number;
  waitReductionPct: number;
  throughputPerMin: number;
  externalYoloConnected: boolean;
  lastExternalPushIso: string | null;
  approaches: Record<Direction, ApproachState>;
  config: ControllerConfig;
  recentLogs: PhaseLogEntry[];
  history: HistoricalPoint[];
}

export interface YoloApproachIngestPayload {
  cars?: number;
  bikes?: number;
  buses?: number;
  trucks?: number;
  emergency?: number;
  fps?: number;
  inferenceMs?: number;
  detections?: BoundingBoxDetection[];
}

export interface YoloIngestRequest {
  intersectionId?: string;
  source?: string;
  approaches: Partial<Record<Direction, YoloApproachIngestPayload>>;
}

export interface VisionDetectionResult {
  vehicles: VehicleBreakdown;
  totalCount: number;
  density: DensityLevel;
  pcuScore: number;
  recommendedGreenSec: number;
  detections: BoundingBoxDetection[];
  inferenceMs: number;
  appliedToDirection: Direction | null;
}
