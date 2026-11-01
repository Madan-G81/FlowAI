export type DirectionKey = 'north' | 'south' | 'east' | 'west';

export type SignalLamp = 'RED' | 'YELLOW' | 'GREEN';

export type DensityCode = 'LOW' | 'MEDIUM' | 'HIGH';

export type SignalStrategy = 'single_approach' | 'corridor_pair';

export interface YoloVehicleClasses {
  Car: number;
  Motorcycle: number;
  Bicycle: number;
  Bus: number;
  Truck: number;
}

export interface ApproachTelemetry {
  direction: DirectionKey;
  label: string;
  vehicle_count: number;
  queue_length: number;
  waiting_time_seconds: number;
  density: DensityCode;
  signal_suggestion: string;
  signal: SignalLamp;
  remaining_seconds: number;
  allocated_green_seconds: number;
  demand_score: number;
  arrival_rate_per_sec: number;
  pedestrian_waiting: number;
  vehicle_classes: YoloVehicleClasses;
}

export interface AdaptiveControllerTelemetry {
  phase:
    | 'GREEN'
    | 'YELLOW'
    | 'ALL_RED'
    | 'PEDESTRIAN_WALK'
    | 'PEDESTRIAN_CLEARANCE';
  active_direction: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | null;
  green_direction: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | null;
  pedestrian_walk: boolean;
  remaining_seconds: number;
  reason: string;
  min_green: number;
  max_green: number;
  yellow_seconds: number;
  all_red_seconds: number;
}

export interface CorridorOptimizerTelemetry {
  green_direction: 'north_south' | 'east_west';
  green_directions: DirectionKey[];
  green_duration: number;
  reason: string;
  demand_scores: {
    north_south: number;
    east_west: number;
  };
  yellow_duration: number;
  all_red_duration: number;
  mode: string;
  active_corridor_phase: 'north_south' | 'east_west';
  active_corridor_stage: 'GREEN' | 'YELLOW' | 'ALL_RED';
  corridor_remaining_seconds: number;
  weights: {
    queue_weight: number;
    vehicle_weight: number;
    waiting_weight: number;
  };
}

export interface TelemetryHistoryPoint {
  timestamp: string;
  north: number;
  south: number;
  east: number;
  west: number;
  total_vehicles: number;
  total_queue: number;
  avg_wait_seconds: number;
  ns_demand: number;
  ew_demand: number;
}

export interface PhaseLogRecord {
  id: string;
  timestamp: string;
  strategy: string;
  phase: string;
  direction: string;
  duration_seconds: number;
  reason: string;
}

export interface RepoFileStatus {
  path: string;
  exists: boolean;
  lines: number;
}

export interface YoloDetectionItem {
  vehicle: string;
  confidence: number;
  track_id?: number | null;
  approach_stream?: string;
  movement_direction?: string;
  bounding_box?: [number, number, number, number];
  bounding_box_pct?: [number, number, number, number];
}

export interface DashboardTelemetry {
  timestamp: string;
  uptime_seconds: number;
  data_source: string;
  signal_strategy: SignalStrategy;
  dynamic_flow_enabled: boolean;
  total_vehicles: number;
  total_queue_length: number;
  avg_waiting_seconds: number;
  overall_density: DensityCode;
  total_discharged: number;
  approaches: Record<DirectionKey, ApproachTelemetry>;
  adaptive_controller: AdaptiveControllerTelemetry;
  corridor_optimizer: CorridorOptimizerTelemetry;
  aggregate_vehicle_classes: YoloVehicleClasses;
  movement_counts: Record<string, number>;
  yolo_detections: YoloDetectionItem[];
  history: TelemetryHistoryPoint[];
  phase_logs: PhaseLogRecord[];
  repo_files: RepoFileStatus[];
  yolo_assets: {
    yolov8n_weights_present: boolean;
    traffic2_video_present: boolean;
    detections_json_present: boolean;
  };
}

export interface SimulationRunMetrics {
  completed_vehicles: number;
  average_wait_seconds: number;
  total_wait_seconds: number;
  remaining_vehicles: number;
}

export interface SimulationTimelinePoint {
  second: number;
  fixed_queue: number;
  adaptive_queue: number;
  fixed_avg_wait: number;
  adaptive_avg_wait: number;
  fixed_completed: number;
  adaptive_completed: number;
}

export interface SimulationBenchmarkResponse {
  simulation_duration_seconds: number;
  fixed: SimulationRunMetrics;
  adaptive: SimulationRunMetrics;
  timeline: SimulationTimelinePoint[];
}
