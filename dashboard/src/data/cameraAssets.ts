import camNorthUrl from '../assets/images/cam_north_avenue_1793537981171.jpg';
import camSouthUrl from '../assets/images/cam_south_boulevard_1793537982279.jpg';
import camEastUrl from '../assets/images/cam_east_expressway_1793537984584.jpg';
import camWestUrl from '../assets/images/cam_west_corridor_1793537983445.jpg';
import type {
  ApproachState,
  BoundingBoxDetection,
  Direction,
} from '../types/traffic';

export const CAMERA_FEED_IMAGES: Record<Direction, string> = {
  north: camNorthUrl,
  south: camSouthUrl,
  east: camEastUrl,
  west: camWestUrl,
};

/**
 * Calibrated baseline bounding boxes aligned to the vehicles visible in each
 * elevated pole-mounted intersection camera view. Additional dynamic boxes
 * scale smoothly with live telemetry counts.
 */
const BASE_BOXES: Record<Direction, BoundingBoxDetection[]> = {
  north: [
    {
      id: 'n-bus-1',
      label: 'bus',
      confidence: 0.96,
      x: 26.8,
      y: 36.8,
      width: 24.4,
      height: 27.2,
    },
    {
      id: 'n-car-1',
      label: 'car',
      confidence: 0.95,
      x: 10.4,
      y: 58.5,
      width: 15.6,
      height: 22.8,
    },
    {
      id: 'n-car-2',
      label: 'car',
      confidence: 0.94,
      x: 26.5,
      y: 56.2,
      width: 15.8,
      height: 19.2,
    },
    {
      id: 'n-moto-1',
      label: 'motorcycle',
      confidence: 0.91,
      x: 53.0,
      y: 57.0,
      width: 8.8,
      height: 17.8,
    },
    {
      id: 'n-car-3',
      label: 'car',
      confidence: 0.92,
      x: 15.5,
      y: 43.4,
      width: 9.4,
      height: 12.6,
    },
    {
      id: 'n-car-4',
      label: 'car',
      confidence: 0.89,
      x: 21.0,
      y: 39.6,
      width: 6.4,
      height: 8.2,
    },
  ],
  south: [
    {
      id: 's-truck-1',
      label: 'truck',
      confidence: 0.96,
      x: 20.6,
      y: 39.2,
      width: 12.0,
      height: 24.6,
    },
    {
      id: 's-car-1',
      label: 'car',
      confidence: 0.93,
      x: 10.4,
      y: 48.0,
      width: 9.8,
      height: 15.6,
    },
    {
      id: 's-moto-1',
      label: 'motorcycle',
      confidence: 0.88,
      x: 34.6,
      y: 54.4,
      width: 3.4,
      height: 10.8,
    },
    {
      id: 's-car-2',
      label: 'car',
      confidence: 0.94,
      x: 41.0,
      y: 48.4,
      width: 6.4,
      height: 14.4,
    },
    {
      id: 's-car-3',
      label: 'car',
      confidence: 0.92,
      x: 34.6,
      y: 39.8,
      width: 6.2,
      height: 12.0,
    },
    {
      id: 's-car-4',
      label: 'car',
      confidence: 0.91,
      x: 53.6,
      y: 51.2,
      width: 6.4,
      height: 12.8,
    },
    {
      id: 's-car-5',
      label: 'car',
      confidence: 0.9,
      x: 59.6,
      y: 42.2,
      width: 6.4,
      height: 10.6,
    },
    {
      id: 's-car-6',
      label: 'car',
      confidence: 0.91,
      x: 66.6,
      y: 42.8,
      width: 7.4,
      height: 10.6,
    },
  ],
  east: [
    {
      id: 'e-car-1',
      label: 'car',
      confidence: 0.96,
      x: 27.0,
      y: 68.2,
      width: 11.8,
      height: 19.6,
    },
    {
      id: 'e-car-2',
      label: 'car',
      confidence: 0.95,
      x: 45.2,
      y: 67.4,
      width: 10.2,
      height: 17.4,
    },
    {
      id: 'e-car-3',
      label: 'car',
      confidence: 0.96,
      x: 59.6,
      y: 60.8,
      width: 10.8,
      height: 18.2,
    },
    {
      id: 'e-moto-1',
      label: 'motorcycle',
      confidence: 0.91,
      x: 76.0,
      y: 64.2,
      width: 4.4,
      height: 15.8,
    },
  ],
  west: [
    {
      id: 'w-amb-1',
      label: 'ambulance',
      confidence: 0.98,
      x: 46.8,
      y: 43.8,
      width: 7.6,
      height: 19.8,
    },
    {
      id: 'w-car-1',
      label: 'car',
      confidence: 0.94,
      x: 28.8,
      y: 52.0,
      width: 6.8,
      height: 11.8,
    },
    {
      id: 'w-car-2',
      label: 'car',
      confidence: 0.94,
      x: 38.0,
      y: 51.2,
      width: 6.0,
      height: 12.2,
    },
    {
      id: 'w-car-3',
      label: 'car',
      confidence: 0.91,
      x: 32.8,
      y: 44.8,
      width: 5.4,
      height: 9.2,
    },
    {
      id: 'w-car-4',
      label: 'car',
      confidence: 0.9,
      x: 40.6,
      y: 45.0,
      width: 5.2,
      height: 8.8,
    },
    {
      id: 'w-car-5',
      label: 'car',
      confidence: 0.92,
      x: 63.6,
      y: 47.4,
      width: 5.4,
      height: 8.4,
    },
    {
      id: 'w-car-6',
      label: 'car',
      confidence: 0.93,
      x: 65.6,
      y: 55.0,
      width: 6.4,
      height: 10.6,
    },
  ],
};

export function getDisplayDetectionsForApproach(
  approach: ApproachState
): BoundingBoxDetection[] {
  if (approach.customDetections && approach.customDetections.length > 0) {
    return approach.customDetections;
  }

  const base = BASE_BOXES[approach.direction];
  if (approach.vehicleCount === 0) {
    return [];
  }

  // Filter out ambulance box on west unless emergency > 0, or relabel as truck
  const adjusted = base.map((box) => {
    if (box.label === 'ambulance' && approach.vehicles.emergency === 0) {
      return {
        ...box,
        label: 'truck' as const,
        confidence: 0.91,
      };
    }
    return box;
  });

  // Slice proportional to current queue count so low traffic shows fewer active boxes
  const maxVisible = Math.max(1, Math.min(adjusted.length, approach.vehicleCount));
  return adjusted.slice(0, maxVisible);
}
