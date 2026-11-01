import camNorthUrl from '../assets/images/cam_north_avenue_1793537981171.jpg';
import camSouthUrl from '../assets/images/cam_south_boulevard_1793537982279.jpg';
import camEastUrl from '../assets/images/cam_east_expressway_1793537984584.jpg';
import camWestUrl from '../assets/images/cam_west_corridor_1793537983445.jpg';
import type {
  ApproachTelemetry,
  DirectionKey,
  YoloDetectionItem,
} from '../types/flowai';

export const CAMERA_IMAGES: Record<DirectionKey, string> = {
  north: camNorthUrl,
  south: camSouthUrl,
  east: camEastUrl,
  west: camWestUrl,
};

export interface CameraBoxOverlay {
  id: string;
  vehicle: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const CALIBRATED_BOXES: Record<DirectionKey, CameraBoxOverlay[]> = {
  north: [
    { id: 'nb-1', vehicle: 'Bus', confidence: 0.96, x: 26.8, y: 36.8, width: 24.4, height: 27.2 },
    { id: 'nb-2', vehicle: 'Car', confidence: 0.95, x: 10.4, y: 58.5, width: 15.6, height: 22.8 },
    { id: 'nb-3', vehicle: 'Car', confidence: 0.94, x: 26.5, y: 56.2, width: 15.8, height: 19.2 },
    { id: 'nb-4', vehicle: 'Motorcycle', confidence: 0.91, x: 53.0, y: 57.0, width: 8.8, height: 17.8 },
    { id: 'nb-5', vehicle: 'Car', confidence: 0.92, x: 15.5, y: 43.4, width: 9.4, height: 12.6 },
  ],
  south: [
    { id: 'sb-1', vehicle: 'Truck', confidence: 0.96, x: 20.6, y: 39.2, width: 12.0, height: 24.6 },
    { id: 'sb-2', vehicle: 'Car', confidence: 0.93, x: 10.4, y: 48.0, width: 9.8, height: 15.6 },
    { id: 'sb-3', vehicle: 'Motorcycle', confidence: 0.88, x: 34.6, y: 54.4, width: 3.4, height: 10.8 },
    { id: 'sb-4', vehicle: 'Car', confidence: 0.94, x: 41.0, y: 48.4, width: 6.4, height: 14.4 },
    { id: 'sb-5', vehicle: 'Car', confidence: 0.91, x: 53.6, y: 51.2, width: 6.4, height: 12.8 },
  ],
  east: [
    { id: 'eb-1', vehicle: 'Car', confidence: 0.96, x: 27.0, y: 68.2, width: 11.8, height: 19.6 },
    { id: 'eb-2', vehicle: 'Car', confidence: 0.95, x: 45.2, y: 67.4, width: 10.2, height: 17.4 },
    { id: 'eb-3', vehicle: 'Car', confidence: 0.96, x: 59.6, y: 60.8, width: 10.8, height: 18.2 },
    { id: 'eb-4', vehicle: 'Motorcycle', confidence: 0.91, x: 76.0, y: 64.2, width: 4.4, height: 15.8 },
  ],
  west: [
    { id: 'wb-1', vehicle: 'Truck', confidence: 0.95, x: 46.8, y: 43.8, width: 7.6, height: 19.8 },
    { id: 'wb-2', vehicle: 'Car', confidence: 0.94, x: 28.8, y: 52.0, width: 6.8, height: 11.8 },
    { id: 'wb-3', vehicle: 'Car', confidence: 0.94, x: 38.0, y: 51.2, width: 6.0, height: 12.2 },
    { id: 'wb-4', vehicle: 'Car', confidence: 0.91, x: 32.8, y: 44.8, width: 5.4, height: 9.2 },
  ],
};

export function resolveApproachBoxes(
  approach: ApproachTelemetry,
  liveDetections: YoloDetectionItem[]
): CameraBoxOverlay[] {
  const dirUpper = approach.direction.toUpperCase();
  const matchingLive = liveDetections.filter(
    (d) =>
      d.approach_stream === dirUpper &&
      Array.isArray(d.bounding_box_pct) &&
      d.bounding_box_pct.length === 4
  );

  if (matchingLive.length > 0) {
    return matchingLive.map((item, idx) => {
      const [x, y, w, h] = item.bounding_box_pct!;
      return {
        id: `live-${dirUpper}-${idx}`,
        vehicle: item.vehicle,
        confidence: item.confidence,
        x,
        y,
        width: w,
        height: h,
      };
    });
  }

  if (approach.vehicle_count <= 0) return [];
  const base = CALIBRATED_BOXES[approach.direction];
  return base.slice(0, Math.max(1, Math.min(base.length, approach.vehicle_count)));
}
