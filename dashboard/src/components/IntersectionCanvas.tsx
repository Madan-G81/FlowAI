import React, { useEffect, useRef } from 'react';
import type {
  ApproachState,
  Direction,
  SignalColor,
  SystemSnapshot,
  VehicleClassLabel,
} from '../types/traffic';

interface IntersectionCanvasProps {
  snapshot: SystemSnapshot;
  selectedDirection: Direction;
  onSelectDirection: (dir: Direction) => void;
}

interface SimVehicle {
  id: number;
  direction: Direction;
  lane: 0 | 1;
  kind: VehicleClassLabel;
  /** Distance along inbound-through-outbound axis from -380 (far spawn) to +380 (exit). Stop line is at -96. */
  pos: number;
  speed: number;
  maxSpeed: number;
  length: number;
  width: number;
  color: string;
}

const CAR_PALETTE = [
  '#cbd5e1',
  '#94a3b8',
  '#38bdf8',
  '#60a5fa',
  '#e2e8f0',
  '#64748b',
  '#fbbf24',
];

function getSignalHex(sig: SignalColor): string {
  if (sig === 'GREEN') return '#16a34a';
  if (sig === 'YELLOW') return '#d97706';
  return '#dc2626';
}

export const IntersectionCanvas: React.FC<IntersectionCanvasProps> = ({
  snapshot,
  selectedDirection,
  onSelectDirection,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotRef = useRef<SystemSnapshot>(snapshot);
  const selectedRef = useRef<Direction>(selectedDirection);
  const vehiclesRef = useRef<SimVehicle[]>([]);
  const nextIdRef = useRef<number>(1);

  snapshotRef.current = snapshot;
  selectedRef.current = selectedDirection;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    // Seed initial vehicles per approach
    if (vehiclesRef.current.length === 0) {
      const dirs: Direction[] = ['north', 'south', 'east', 'west'];
      for (const d of dirs) {
        const app = snapshotRef.current.approaches[d];
        const initialCount = Math.min(10, Math.max(2, Math.round(app.vehicleCount / 2)));
        for (let i = 0; i < initialCount; i++) {
          const lane = (i % 2) as 0 | 1;
          const rankInLane = Math.floor(i / 2);
          const kind: VehicleClassLabel =
            i === 0 && app.vehicles.emergency > 0
              ? 'ambulance'
              : i === 1 && app.vehicles.buses > 0
                ? 'bus'
                : i === 2 && app.vehicles.trucks > 0
                  ? 'truck'
                  : i % 4 === 3 && app.vehicles.bikes > 0
                    ? 'motorcycle'
                    : 'car';
          const length =
            kind === 'bus'
              ? 36
              : kind === 'truck'
                ? 32
                : kind === 'ambulance'
                  ? 26
                  : kind === 'motorcycle'
                    ? 13
                    : 22;
          const width =
            kind === 'bus' || kind === 'truck'
              ? 13
              : kind === 'motorcycle'
                ? 6
                : 11;

          vehiclesRef.current.push({
            id: nextIdRef.current++,
            direction: d,
            lane,
            kind,
            pos: -112 - rankInLane * 40 - (lane === 1 ? 10 : 0),
            speed: app.signal === 'GREEN' ? 1.8 : 0,
            maxSpeed: kind === 'motorcycle' ? 2.6 : kind === 'bus' ? 1.85 : 2.25,
            length,
            width,
            color:
              kind === 'bus'
                ? '#eab308'
                : kind === 'truck'
                  ? '#f8fafc'
                  : kind === 'ambulance'
                    ? '#ffffff'
                    : CAR_PALETTE[nextIdRef.current % CAR_PALETTE.length],
          });
        }
      }
    }

    let animationFrameId = 0;
    let lastTime = performance.now();

    const syncAndStepVehicles = (dtScale: number) => {
      const snap = snapshotRef.current;
      const dirs: Direction[] = ['north', 'south', 'east', 'west'];
      const stopLinePos = -96;

      for (const dir of dirs) {
        const app: ApproachState = snap.approaches[dir];
        const desiredInbound = Math.min(
          12,
          Math.ceil(app.vehicleCount * 0.55)
        );

        const dirVehicles = vehiclesRef.current.filter(
          (v) => v.direction === dir
        );
        const inboundQueued = dirVehicles.filter((v) => v.pos < stopLinePos + 8);

        // Ensure emergency ambulance exists if telemetry reports emergency > 0
        if (
          app.vehicles.emergency > 0 &&
          !inboundQueued.some((v) => v.kind === 'ambulance')
        ) {
          const lane0MinPos = dirVehicles
            .filter((v) => v.lane === 0)
            .reduce((min, v) => Math.min(min, v.pos - v.length - 14), -130);
          vehiclesRef.current.push({
            id: nextIdRef.current++,
            direction: dir,
            lane: 0,
            kind: 'ambulance',
            pos: Math.min(-130, lane0MinPos),
            speed: 1.8,
            maxSpeed: 2.5,
            length: 26,
            width: 12,
            color: '#ffffff',
          });
        }

        // Spawn inbound vehicles if visual queue is below scaled telemetry count
        if (inboundQueued.length < desiredInbound && !snap.simulationPaused) {
          const lane0Count = inboundQueued.filter((v) => v.lane === 0).length;
          const lane1Count = inboundQueued.filter((v) => v.lane === 1).length;
          const chosenLane: 0 | 1 = lane0Count <= lane1Count ? 0 : 1;

          const furthestBack = dirVehicles
            .filter((v) => v.lane === chosenLane)
            .reduce((min, v) => Math.min(min, v.pos - v.length - 16), -330);

          if (furthestBack > -365) {
            const roll = Math.random();
            let kind: VehicleClassLabel = 'car';
            if (app.vehicles.buses > 0 && roll < 0.14) kind = 'bus';
            else if (app.vehicles.trucks > 0 && roll < 0.26) kind = 'truck';
            else if (app.vehicles.bikes > 0 && roll < 0.45) kind = 'motorcycle';

            const length =
              kind === 'bus'
                ? 36
                : kind === 'truck'
                  ? 32
                  : kind === 'motorcycle'
                    ? 13
                    : 22;
            const width =
              kind === 'bus' || kind === 'truck'
                ? 13
                : kind === 'motorcycle'
                  ? 6
                  : 11;

            vehiclesRef.current.push({
              id: nextIdRef.current++,
              direction: dir,
              lane: chosenLane,
              kind,
              pos: Math.min(-345, furthestBack),
              speed: 1.6,
              maxSpeed:
                kind === 'motorcycle' ? 2.6 : kind === 'bus' ? 1.85 : 2.25,
              length,
              width,
              color:
                kind === 'bus'
                  ? '#eab308'
                  : kind === 'truck'
                    ? '#f1f5f9'
                    : CAR_PALETTE[nextIdRef.current % CAR_PALETTE.length],
            });
          }
        }
      }

      if (snap.simulationPaused || prefersReducedMotion) {
        return;
      }

      // Advance vehicle positions per lane with safe car-following headway
      for (const dir of dirs) {
        const sig = snap.approaches[dir].signal;
        for (const lane of [0, 1] as const) {
          const laneCars = vehiclesRef.current
            .filter((v) => v.direction === dir && v.lane === lane)
            .sort((a, b) => b.pos - a.pos); // front-most first

          for (let i = 0; i < laneCars.length; i++) {
            const car = laneCars[i];
            const leader = i > 0 ? laneCars[i - 1] : null;
            const frontBumper = car.pos + car.length * 0.5;

            let targetSpeed = car.maxSpeed;

            // Stop bar constraint on RED or YELLOW (if still behind stop bar)
            if (sig !== 'GREEN' && frontBumper <= stopLinePos + 3) {
              const distToStop = stopLinePos - frontBumper;
              if (distToStop <= 2) {
                targetSpeed = 0;
              } else if (distToStop < 70) {
                targetSpeed = Math.min(targetSpeed, (distToStop / 70) * car.maxSpeed);
              }
            }

            // Car-following headway constraint
            if (leader) {
              const leaderRear = leader.pos - leader.length * 0.5;
              const gap = leaderRear - frontBumper;
              const minGap = 9;
              if (gap <= minGap) {
                targetSpeed = 0;
              } else if (gap < 48) {
                targetSpeed = Math.min(
                  targetSpeed,
                  leader.speed + ((gap - minGap) / 39) * 1.1
                );
              }
            }

            // Smooth acceleration / braking
            if (car.speed < targetSpeed) {
              car.speed = Math.min(targetSpeed, car.speed + 0.08 * dtScale);
            } else {
              car.speed = Math.max(0, car.speed - 0.16 * dtScale);
            }

            car.pos += car.speed * dtScale;
          }
        }
      }

      // Prune exited vehicles
      vehiclesRef.current = vehiclesRef.current.filter((v) => v.pos < 375);
    };

    const drawScene = (now: number) => {
      const dt = Math.min(32, now - lastTime);
      lastTime = now;
      syncAndStepVehicles(dt / 16.67);

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(320, Math.floor(rect.width));
      const cssH = Math.max(320, Math.floor(rect.height));

      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Virtual 680x680 coordinate space centered at (0,0)
      const size = Math.min(cssW, cssH);
      const scale = size / 680;
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, cssW, cssH);

      ctx.translate(cssW / 2, cssH / 2);
      ctx.scale(scale, scale);

      const roadHalf = 74; // Total 4-lane road width = 148
      const laneW = roadHalf / 2; // 37px per lane
      const reach = 350;

      // 1. Urban City Blocks / Sidewalks
      const quadrants = [
        [-reach, -reach, -roadHalf, -roadHalf],
        [roadHalf, -reach, reach, -roadHalf],
        [-reach, roadHalf, -roadHalf, reach],
        [roadHalf, roadHalf, reach, reach],
      ];

      for (const [x1, y1, x2, y2] of quadrants) {
        // Sidewalk curb apron
        ctx.fillStyle = '#111827';
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

        // Subtle architectural building plot inset
        const inset = 18;
        const bx = x1 < 0 ? x1 : x1 + inset;
        const by = y1 < 0 ? y1 : y1 + inset;
        const bw = x2 - x1 - inset;
        const bh = y2 - y1 - inset;
        ctx.fillStyle = '#0b111e';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, bw, bh);
      }

      // 2. Asphalt Roadways
      ctx.fillStyle = '#161f30';
      ctx.fillRect(-roadHalf, -reach, roadHalf * 2, reach * 2);
      ctx.fillRect(-reach, -roadHalf, reach * 2, roadHalf * 2);

      // Junction Center Box subtle surface tone
      ctx.fillStyle = '#192338';
      ctx.fillRect(-roadHalf, -roadHalf, roadHalf * 2, roadHalf * 2);

      // Curb edge lines
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      const curbLines = [
        [-roadHalf, -reach, -roadHalf, -roadHalf],
        [roadHalf, -reach, roadHalf, -roadHalf],
        [-roadHalf, roadHalf, -roadHalf, reach],
        [roadHalf, roadHalf, roadHalf, reach],
        [-reach, -roadHalf, -roadHalf, -roadHalf],
        [-reach, roadHalf, -roadHalf, roadHalf],
        [roadHalf, -roadHalf, reach, -roadHalf],
        [roadHalf, roadHalf, reach, roadHalf],
      ];
      for (const [x1, y1, x2, y2] of curbLines) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // 3. Active Signal Right-of-Way Flow Ribbon inside Junction Box
      const snap = snapshotRef.current;
      const activeDir = snap.activePhaseDirection;
      const activeApp = snap.approaches[activeDir];
      if (activeApp.signal === 'GREEN' || activeApp.signal === 'YELLOW') {
        ctx.save();
        const rotMap: Record<Direction, number> = {
          north: 0, // North approach moves South (+y)
          east: Math.PI / 2, // East approach moves West (-x)
          south: Math.PI, // South approach moves North (-y)
          west: -Math.PI / 2, // West approach moves East (+x)
        };
        ctx.rotate(rotMap[activeDir]);
        const ribbonColor =
          activeApp.signal === 'GREEN'
            ? snap.mode === 'EMERGENCY_PREEMPT'
              ? 'rgba(59, 130, 246, 0.16)'
              : 'rgba(22, 163, 74, 0.14)'
            : 'rgba(217, 119, 6, 0.14)';
        ctx.fillStyle = ribbonColor;
        // Inbound lanes for North approach are on the West side (x from -roadHalf to 0)
        ctx.fillRect(-roadHalf + 3, -roadHalf, roadHalf - 6, roadHalf * 2);

        // Directional flow chevrons inside junction
        ctx.strokeStyle =
          activeApp.signal === 'GREEN'
            ? snap.mode === 'EMERGENCY_PREEMPT'
              ? 'rgba(96, 165, 250, 0.45)'
              : 'rgba(74, 222, 128, 0.38)'
            : 'rgba(251, 191, 36, 0.4)';
        ctx.lineWidth = 2;
        for (const chevronY of [-36, 0, 36]) {
          ctx.beginPath();
          ctx.moveTo(-laneW - 7, chevronY - 5);
          ctx.lineTo(-laneW, chevronY + 4);
          ctx.lineTo(-laneW + 7, chevronY - 5);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 4. Lane Markings, Zebra Crosswalks & Stop Lines for each of the 4 arms
      const armRotations: Array<{ dir: Direction; angle: number }> = [
        { dir: 'north', angle: 0 },
        { dir: 'east', angle: Math.PI / 2 },
        { dir: 'south', angle: Math.PI },
        { dir: 'west', angle: -Math.PI / 2 },
      ];

      for (const { dir, angle } of armRotations) {
        ctx.save();
        ctx.rotate(angle);

        // Selected approach subtle highlight border along approach arm
        if (selectedRef.current === dir) {
          ctx.fillStyle = 'rgba(59, 130, 246, 0.07)';
          ctx.fillRect(-roadHalf, -reach, roadHalf, reach - roadHalf);
        }

        // Double yellow center divider (y from -reach to -102)
        ctx.strokeStyle = '#ca8a04';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-2, -reach);
        ctx.lineTo(-2, -102);
        ctx.moveTo(2, -reach);
        ctx.lineTo(2, -102);
        ctx.stroke();

        // Dashed white lane dividers for inbound (-laneW) and outbound (+laneW)
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([12, 12]);
        ctx.beginPath();
        ctx.moveTo(-laneW, -reach);
        ctx.lineTo(-laneW, -104);
        ctx.moveTo(laneW, -reach);
        ctx.lineTo(laneW, -104);
        ctx.stroke();
        ctx.setLineDash([]);

        // Solid white stop bar for inbound lanes (-roadHalf to -2 at y = -98)
        const appSig = snap.approaches[dir].signal;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(-roadHalf + 2, -100, roadHalf - 4, 4);

        // Subtle signal state bar right along stop line
        ctx.fillStyle = getSignalHex(appSig);
        ctx.fillRect(-roadHalf + 2, -95, roadHalf - 4, 2.5);

        // Pedestrian Zebra Crosswalk (-90 to -76)
        ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
        for (let sx = -roadHalf + 6; sx < roadHalf - 6; sx += 12) {
          ctx.fillRect(sx, -90, 6, 13);
        }

        // Inbound pavement directional arrow (pointing +y into junction)
        ctx.fillStyle = 'rgba(226, 232, 240, 0.28)';
        for (const lx of [-laneW * 1.5, -laneW * 0.5]) {
          ctx.beginPath();
          ctx.moveTo(lx, -135);
          ctx.lineTo(lx - 5, -145);
          ctx.lineTo(lx - 2, -145);
          ctx.lineTo(lx - 2, -160);
          ctx.lineTo(lx + 2, -160);
          ctx.lineTo(lx + 2, -145);
          ctx.lineTo(lx + 5, -145);
          ctx.closePath();
          ctx.fill();
        }

        ctx.restore();
      }

      // 5. Draw Simulated Vehicles
      const strobePhase = Math.floor(now / 180) % 2 === 0;
      for (const car of vehiclesRef.current) {
        const rotMap: Record<Direction, number> = {
          north: 0,
          east: Math.PI / 2,
          south: Math.PI,
          west: -Math.PI / 2,
        };
        ctx.save();
        ctx.rotate(rotMap[car.direction]);

        // Inbound lane x centers: lane 0 (outer) = -55.5, lane 1 (inner) = -18.5
        const xCenter = car.lane === 0 ? -laneW * 1.5 : -laneW * 0.5;
        const yCenter = car.pos;

        ctx.translate(xCenter, yCenter);

        // Vehicle shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.roundRect(
          -car.width / 2 + 1.5,
          -car.length / 2 + 2,
          car.width,
          car.length,
          3
        );
        ctx.fill();

        // Main chassis
        ctx.fillStyle = car.color;
        ctx.beginPath();
        ctx.roundRect(-car.width / 2, -car.length / 2, car.width, car.length, 3);
        ctx.fill();

        // Windshield & roof details
        if (car.kind === 'bus') {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(-car.width / 2 + 1.5, car.length / 2 - 7, car.width - 3, 4.5);
          ctx.fillStyle = '#16a34a';
          ctx.fillRect(-car.width / 2 + 2, -car.length / 2 + 4, car.width - 4, car.length - 14);
        } else if (car.kind === 'truck') {
          // Truck cab + white cargo box
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(-car.width / 2 + 1, car.length / 2 - 9, car.width - 2, 8);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(-car.width / 2 + 1.5, car.length / 2 - 5, car.width - 3, 3);
        } else if (car.kind === 'ambulance') {
          // Crimson cross & flashing emergency lightbar
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(-1.5, -5, 3, 9);
          ctx.fillRect(-4.5, -2, 9, 3);
          ctx.fillStyle = strobePhase ? '#ef4444' : '#3b82f6';
          ctx.fillRect(-car.width / 2 + 1, car.length / 2 - 8, (car.width - 2) / 2, 3);
          ctx.fillStyle = strobePhase ? '#3b82f6' : '#ef4444';
          ctx.fillRect(0, car.length / 2 - 8, (car.width - 2) / 2, 3);
        } else if (car.kind === 'car') {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(-car.width / 2 + 1.5, -3, car.width - 3, 9);
        }

        // Headlights (pointing +y)
        ctx.fillStyle = 'rgba(254, 249, 195, 0.85)';
        ctx.fillRect(-car.width / 2 + 1, car.length / 2 - 1.5, 2.5, 1.5);
        ctx.fillRect(car.width / 2 - 3.5, car.length / 2 - 1.5, 2.5, 1.5);

        // Brake lights (bright red when decelerated/stopped)
        if (car.speed < 0.35) {
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(-car.width / 2 + 1, -car.length / 2, 3, 1.8);
          ctx.fillRect(car.width / 2 - 4, -car.length / 2, 3, 1.8);
        }

        ctx.restore();
      }

      // 6. Signal Housings & Approach Callout HUD Badges at each Quadrant Corner
      const badgePositions: Array<{
        dir: Direction;
        x: number;
        y: number;
        title: string;
      }> = [
        { dir: 'north', x: -186, y: -205, title: 'NORTH' },
        { dir: 'east', x: 186, y: -205, title: 'EAST' },
        { dir: 'south', x: 186, y: 205, title: 'SOUTH' },
        { dir: 'west', x: -186, y: 205, title: 'WEST' },
      ];

      for (const item of badgePositions) {
        const app = snap.approaches[item.dir];
        const isSelected = selectedRef.current === item.dir;
        const boxW = 148;
        const boxH = 88;
        const bx = item.x - boxW / 2;
        const by = item.y - boxH / 2;

        // Card container
        ctx.fillStyle = isSelected ? '#152238' : '#0f172a';
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 8);
        ctx.fill();

        ctx.strokeStyle = isSelected
          ? '#3b82f6'
          : app.emergencyDetected
            ? '#ef4444'
            : '#1e293b';
        ctx.lineWidth = isSelected ? 1.8 : 1.2;
        ctx.stroke();

        // 3-aspect Traffic Signal Lamp Column on left of HUD
        const lampX = bx + 18;
        const lampTop = by + 20;
        const lamps: Array<{ c: SignalColor; activeHex: string; dimHex: string }> =
          [
            { c: 'RED', activeHex: '#ef4444', dimHex: '#3b181e' },
            { c: 'YELLOW', activeHex: '#f59e0b', dimHex: '#3b2a14' },
            { c: 'GREEN', activeHex: '#22c55e', dimHex: '#133223' },
          ];

        ctx.fillStyle = '#090d16';
        ctx.beginPath();
        ctx.roundRect(lampX - 9, lampTop - 10, 18, 64, 5);
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.stroke();

        lamps.forEach((l, idx) => {
          const ly = lampTop + idx * 21;
          const active = app.signal === l.c;
          ctx.beginPath();
          ctx.arc(lampX, ly, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = active ? l.activeHex : l.dimHex;
          ctx.fill();
        });

        // Direction title & timer
        ctx.fillStyle = '#f8fafc';
        ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(item.title, bx + 36, by + 23);

        ctx.fillStyle = getSignalHex(app.signal);
        ctx.font = '600 13px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${app.countdownSec}s`, bx + boxW - 12, by + 23);

        // Live vehicle count
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '600 18px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${app.vehicleCount}`, bx + 36, by + 49);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 11px "DM Sans", sans-serif';
        ctx.fillText('vehicles', bx + 65, by + 48);

        // Density text
        const densityColor =
          app.density === 'High'
            ? '#f87171'
            : app.density === 'Medium'
              ? '#fbbf24'
              : '#4ade80';
        ctx.fillStyle = densityColor;
        ctx.font = '500 11px "DM Sans", sans-serif';
        ctx.fillText(
          app.emergencyDetected ? 'Emergency Alert' : `${app.density} Density`,
          bx + 36,
          by + 70
        );
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(drawScene);
    };

    animationFrameId = requestAnimationFrame(drawScene);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;

    const size = Math.min(rect.width, rect.height);
    const scale = size / 680;
    const vx = cx / scale;
    const vy = cy / scale;

    // Check quadrant HUD cards first
    const cards: Array<{ dir: Direction; x: number; y: number }> = [
      { dir: 'north', x: -186, y: -205 },
      { dir: 'east', x: 186, y: -205 },
      { dir: 'south', x: 186, y: 205 },
      { dir: 'west', x: -186, y: 205 },
    ];
    for (const c of cards) {
      if (Math.abs(vx - c.x) <= 78 && Math.abs(vy - c.y) <= 48) {
        onSelectDirection(c.dir);
        return;
      }
    }

    // Otherwise check road arm
    if (Math.abs(vy) > Math.abs(vx)) {
      onSelectDirection(vy < 0 ? 'north' : 'south');
    } else {
      onSelectDirection(vx > 0 ? 'east' : 'west');
    }
  };

  return (
    <div className="relative w-full aspect-square max-h-[560px] bg-[#090d16] rounded-xl border border-slate-800 overflow-hidden">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="w-full h-full cursor-pointer block"
        aria-label="Interactive four-way traffic intersection simulation showing North, South, East, and West approaches"
      />
      <div className="pointer-events-none absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs text-slate-400">
        <span>Click any approach or signal block to inspect corridor</span>
        <span className="font-mono tabular-nums text-slate-300">
          Cycle #{snapshot.cycleCount} · {snapshot.phaseStage.replace(/_/g, ' ')}
        </span>
      </div>
    </div>
  );
};
