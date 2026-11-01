import React, { useEffect, useRef } from 'react';
import type {
  DashboardTelemetry,
  DirectionKey,
  SignalLamp,
} from '../types/flowai';

interface FourWayIntersectionProps {
  telemetry: DashboardTelemetry;
  selectedDirection: DirectionKey;
  onSelectDirection: (dir: DirectionKey) => void;
}

interface SimVehicle {
  id: number;
  direction: DirectionKey;
  lane: 0 | 1;
  category: 'Car' | 'Motorcycle' | 'Bicycle' | 'Bus' | 'Truck';
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
];

function lampHex(sig: SignalLamp): string {
  if (sig === 'GREEN') return '#22c55e';
  if (sig === 'YELLOW') return '#f59e0b';
  return '#ef4444';
}

export const FourWayIntersection: React.FC<FourWayIntersectionProps> = ({
  telemetry,
  selectedDirection,
  onSelectDirection,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const telemetryRef = useRef<DashboardTelemetry>(telemetry);
  const selectedRef = useRef<DirectionKey>(selectedDirection);
  const vehiclesRef = useRef<SimVehicle[]>([]);
  const nextIdRef = useRef<number>(1);

  telemetryRef.current = telemetry;
  selectedRef.current = selectedDirection;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (vehiclesRef.current.length === 0) {
      const dirs: DirectionKey[] = ['north', 'south', 'east', 'west'];
      for (const d of dirs) {
        const app = telemetryRef.current.approaches[d];
        const count = Math.min(10, Math.max(2, Math.round(app.vehicle_count * 0.45)));
        for (let i = 0; i < count; i++) {
          const lane = (i % 2) as 0 | 1;
          const rank = Math.floor(i / 2);
          const category: SimVehicle['category'] =
            i === 1 && app.vehicle_classes.Bus > 0
              ? 'Bus'
              : i === 2 && app.vehicle_classes.Truck > 0
                ? 'Truck'
                : i % 4 === 3 && app.vehicle_classes.Motorcycle > 0
                  ? 'Motorcycle'
                  : 'Car';
          const length =
            category === 'Bus'
              ? 35
              : category === 'Truck'
                ? 31
                : category === 'Motorcycle'
                  ? 13
                  : 22;
          const width =
            category === 'Bus' || category === 'Truck'
              ? 13
              : category === 'Motorcycle'
                ? 6
                : 11;
          vehiclesRef.current.push({
            id: nextIdRef.current++,
            direction: d,
            lane,
            category,
            pos: -112 - rank * 38 - (lane === 1 ? 8 : 0),
            speed: app.signal === 'GREEN' ? 1.8 : 0,
            maxSpeed: category === 'Motorcycle' ? 2.5 : category === 'Bus' ? 1.8 : 2.2,
            length,
            width,
            color:
              category === 'Bus'
                ? '#eab308'
                : category === 'Truck'
                  ? '#f8fafc'
                  : CAR_PALETTE[nextIdRef.current % CAR_PALETTE.length],
          });
        }
      }
    }

    let rafId = 0;
    let lastMs = performance.now();

    const stepVehicles = (dtScale: number) => {
      const tel = telemetryRef.current;
      const dirs: DirectionKey[] = ['north', 'south', 'east', 'west'];
      const stopLine = -96;

      for (const dir of dirs) {
        const app = tel.approaches[dir];
        const targetInbound = Math.min(12, Math.ceil(app.vehicle_count * 0.5));
        const dirCars = vehiclesRef.current.filter((v) => v.direction === dir);
        const queued = dirCars.filter((v) => v.pos < stopLine + 8);

        if (queued.length < targetInbound && tel.dynamic_flow_enabled) {
          const l0 = queued.filter((v) => v.lane === 0).length;
          const l1 = queued.filter((v) => v.lane === 1).length;
          const lane: 0 | 1 = l0 <= l1 ? 0 : 1;
          const backPos = dirCars
            .filter((v) => v.lane === lane)
            .reduce((m, v) => Math.min(m, v.pos - v.length - 15), -330);

          if (backPos > -365) {
            const roll = Math.random();
            let category: SimVehicle['category'] = 'Car';
            if (app.vehicle_classes.Bus > 0 && roll < 0.12) category = 'Bus';
            else if (app.vehicle_classes.Truck > 0 && roll < 0.24)
              category = 'Truck';
            else if (app.vehicle_classes.Motorcycle > 0 && roll < 0.44)
              category = 'Motorcycle';

            const length =
              category === 'Bus'
                ? 35
                : category === 'Truck'
                  ? 31
                  : category === 'Motorcycle'
                    ? 13
                    : 22;
            const width =
              category === 'Bus' || category === 'Truck'
                ? 13
                : category === 'Motorcycle'
                  ? 6
                  : 11;

            vehiclesRef.current.push({
              id: nextIdRef.current++,
              direction: dir,
              lane,
              category,
              pos: Math.min(-340, backPos),
              speed: 1.5,
              maxSpeed:
                category === 'Motorcycle' ? 2.5 : category === 'Bus' ? 1.8 : 2.2,
              length,
              width,
              color:
                category === 'Bus'
                  ? '#eab308'
                  : category === 'Truck'
                    ? '#f1f5f9'
                    : CAR_PALETTE[nextIdRef.current % CAR_PALETTE.length],
            });
          }
        }
      }

      if (prefersReducedMotion || !tel.dynamic_flow_enabled) return;

      for (const dir of dirs) {
        const sig = tel.approaches[dir].signal;
        for (const lane of [0, 1] as const) {
          const laneCars = vehiclesRef.current
            .filter((v) => v.direction === dir && v.lane === lane)
            .sort((a, b) => b.pos - a.pos);

          for (let i = 0; i < laneCars.length; i++) {
            const car = laneCars[i];
            const leader = i > 0 ? laneCars[i - 1] : null;
            const front = car.pos + car.length * 0.5;

            let targetSpeed = car.maxSpeed;

            if (sig !== 'GREEN' && front <= stopLine + 3) {
              const dist = stopLine - front;
              if (dist <= 2) targetSpeed = 0;
              else if (dist < 68)
                targetSpeed = Math.min(targetSpeed, (dist / 68) * car.maxSpeed);
            }

            if (leader) {
              const gap = leader.pos - leader.length * 0.5 - front;
              if (gap <= 9) targetSpeed = 0;
              else if (gap < 46)
                targetSpeed = Math.min(
                  targetSpeed,
                  leader.speed + ((gap - 9) / 37) * 1.1
                );
            }

            if (car.speed < targetSpeed) {
              car.speed = Math.min(targetSpeed, car.speed + 0.08 * dtScale);
            } else {
              car.speed = Math.max(0, car.speed - 0.16 * dtScale);
            }
            car.pos += car.speed * dtScale;
          }
        }
      }

      vehiclesRef.current = vehiclesRef.current.filter((v) => v.pos < 375);
    };

    const render = (now: number) => {
      const dt = Math.min(32, now - lastMs);
      lastMs = now;
      stepVehicles(dt / 16.67);

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

      const size = Math.min(cssW, cssH);
      const scale = size / 680;
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, cssW, cssH);

      ctx.translate(cssW / 2, cssH / 2);
      ctx.scale(scale, scale);

      const roadHalf = 74;
      const laneW = roadHalf / 2;
      const reach = 350;

      // Urban quadrants
      const blocks = [
        [-reach, -reach, -roadHalf, -roadHalf],
        [roadHalf, -reach, reach, -roadHalf],
        [-reach, roadHalf, -roadHalf, reach],
        [roadHalf, roadHalf, reach, reach],
      ];
      for (const [x1, y1, x2, y2] of blocks) {
        ctx.fillStyle = '#111827';
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
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

      // Asphalt arms & center junction
      ctx.fillStyle = '#161f30';
      ctx.fillRect(-roadHalf, -reach, roadHalf * 2, reach * 2);
      ctx.fillRect(-reach, -roadHalf, reach * 2, roadHalf * 2);

      ctx.fillStyle = '#192338';
      ctx.fillRect(-roadHalf, -roadHalf, roadHalf * 2, roadHalf * 2);

      // Curb edges
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      const curbs = [
        [-roadHalf, -reach, -roadHalf, -roadHalf],
        [roadHalf, -reach, roadHalf, -roadHalf],
        [-roadHalf, roadHalf, -roadHalf, reach],
        [roadHalf, roadHalf, roadHalf, reach],
        [-reach, -roadHalf, -roadHalf, -roadHalf],
        [-reach, roadHalf, -roadHalf, roadHalf],
        [roadHalf, -roadHalf, reach, -roadHalf],
        [roadHalf, roadHalf, reach, roadHalf],
      ];
      for (const [x1, y1, x2, y2] of curbs) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Active GREEN / YELLOW corridor ribbons (supports single OR paired opposing green!)
      const tel = telemetryRef.current;
      const arms: Array<{ dir: DirectionKey; angle: number }> = [
        { dir: 'north', angle: 0 },
        { dir: 'east', angle: Math.PI / 2 },
        { dir: 'south', angle: Math.PI },
        { dir: 'west', angle: -Math.PI / 2 },
      ];

      for (const { dir, angle } of arms) {
        const sig = tel.approaches[dir].signal;
        if (sig === 'GREEN' || sig === 'YELLOW') {
          ctx.save();
          ctx.rotate(angle);
          ctx.fillStyle =
            sig === 'GREEN'
              ? 'rgba(34, 197, 94, 0.14)'
              : 'rgba(245, 158, 11, 0.14)';
          ctx.fillRect(-roadHalf + 3, -roadHalf, roadHalf - 6, roadHalf * 2);
          ctx.restore();
        }
      }

      // Markings & Crosswalks
      for (const { dir, angle } of arms) {
        ctx.save();
        ctx.rotate(angle);

        if (selectedRef.current === dir) {
          ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
          ctx.fillRect(-roadHalf, -reach, roadHalf, reach - roadHalf);
        }

        // Double amber center divider
        ctx.strokeStyle = '#ca8a04';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-2, -reach);
        ctx.lineTo(-2, -102);
        ctx.moveTo(2, -reach);
        ctx.lineTo(2, -102);
        ctx.stroke();

        // Dashed lane lines
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

        // Stop bar + signal color strip
        const appSig = tel.approaches[dir].signal;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(-roadHalf + 2, -100, roadHalf - 4, 4);
        ctx.fillStyle = lampHex(appSig);
        ctx.fillRect(-roadHalf + 2, -95, roadHalf - 4, 2.5);

        // Zebra crosswalk (highlighted blue-green if AdaptiveSignalController is serving PEDESTRIAN_WALK on this approach)
        const isPedWalk =
          tel.adaptive_controller.pedestrian_walk &&
          tel.adaptive_controller.active_direction === dir.toUpperCase();
        ctx.fillStyle = isPedWalk
          ? 'rgba(56, 189, 248, 0.85)'
          : 'rgba(226, 232, 240, 0.55)';
        for (let sx = -roadHalf + 6; sx < roadHalf - 6; sx += 12) {
          ctx.fillRect(sx, -90, 6, 13);
        }

        // Directional arrows
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

      // Draw vehicles
      for (const car of vehiclesRef.current) {
        const rotMap: Record<DirectionKey, number> = {
          north: 0,
          east: Math.PI / 2,
          south: Math.PI,
          west: -Math.PI / 2,
        };
        ctx.save();
        ctx.rotate(rotMap[car.direction]);
        const xCenter = car.lane === 0 ? -laneW * 1.5 : -laneW * 0.5;
        ctx.translate(xCenter, car.pos);

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

        ctx.fillStyle = car.color;
        ctx.beginPath();
        ctx.roundRect(-car.width / 2, -car.length / 2, car.width, car.length, 3);
        ctx.fill();

        if (car.category === 'Bus') {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(-car.width / 2 + 1.5, car.length / 2 - 7, car.width - 3, 4.5);
        } else if (car.category === 'Truck') {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(-car.width / 2 + 1, car.length / 2 - 9, car.width - 2, 8);
        } else if (car.category === 'Car') {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(-car.width / 2 + 1.5, -3, car.width - 3, 9);
        }

        if (car.speed < 0.35) {
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(-car.width / 2 + 1, -car.length / 2, 3, 1.8);
          ctx.fillRect(car.width / 2 - 4, -car.length / 2, 3, 1.8);
        }
        ctx.restore();
      }

      // 4 Signal Housing & Live Count Callout Blocks
      const callouts: Array<{
        dir: DirectionKey;
        x: number;
        y: number;
        title: string;
      }> = [
        { dir: 'north', x: -186, y: -205, title: 'NORTH' },
        { dir: 'east', x: 186, y: -205, title: 'EAST' },
        { dir: 'south', x: 186, y: 205, title: 'SOUTH' },
        { dir: 'west', x: -186, y: 205, title: 'WEST' },
      ];

      for (const c of callouts) {
        const app = tel.approaches[c.dir];
        const isSel = selectedRef.current === c.dir;
        const bw = 152;
        const bh = 90;
        const bx = c.x - bw / 2;
        const by = c.y - bh / 2;

        ctx.fillStyle = isSel ? '#152238' : '#0f172a';
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 8);
        ctx.fill();
        ctx.strokeStyle = isSel ? '#3b82f6' : '#1e293b';
        ctx.lineWidth = isSel ? 1.8 : 1.2;
        ctx.stroke();

        // 3-aspect lamp column
        const lx = bx + 18;
        const lt = by + 21;
        ctx.fillStyle = '#090d16';
        ctx.beginPath();
        ctx.roundRect(lx - 9, lt - 10, 18, 64, 5);
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.stroke();

        const aspects: Array<{ s: SignalLamp; on: string; off: string }> = [
          { s: 'RED', on: '#ef4444', off: '#3b181e' },
          { s: 'YELLOW', on: '#f59e0b', off: '#3b2a14' },
          { s: 'GREEN', on: '#22c55e', off: '#133223' },
        ];
        aspects.forEach((a, idx) => {
          ctx.beginPath();
          ctx.arc(lx, lt + idx * 21, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = app.signal === a.s ? a.on : a.off;
          ctx.fill();
        });

        ctx.fillStyle = '#f8fafc';
        ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(c.title, bx + 36, by + 23);

        ctx.fillStyle = lampHex(app.signal);
        ctx.font = '600 13px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${app.remaining_seconds}s`, bx + bw - 11, by + 23);

        ctx.fillStyle = '#f1f5f9';
        ctx.font = '600 18px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${app.vehicle_count}`, bx + 36, by + 49);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 11px "DM Sans", sans-serif';
        ctx.fillText(`veh · Q:${app.queue_length}`, bx + 66, by + 48);

        ctx.fillStyle =
          app.density === 'HIGH'
            ? '#f87171'
            : app.density === 'MEDIUM'
              ? '#fbbf24'
              : '#4ade80';
        ctx.font = '500 11px "DM Sans", sans-serif';
        ctx.fillText(`${app.density} DENSITY`, bx + 36, by + 71);
      }

      ctx.restore();
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    const scale = Math.min(rect.width, rect.height) / 680;
    const vx = cx / scale;
    const vy = cy / scale;

    const callouts: Array<{ dir: DirectionKey; x: number; y: number }> = [
      { dir: 'north', x: -186, y: -205 },
      { dir: 'east', x: 186, y: -205 },
      { dir: 'south', x: 186, y: 205 },
      { dir: 'west', x: -186, y: 205 },
    ];
    for (const c of callouts) {
      if (Math.abs(vx - c.x) <= 78 && Math.abs(vy - c.y) <= 48) {
        onSelectDirection(c.dir);
        return;
      }
    }
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
        onClick={handleClick}
        className="w-full h-full cursor-pointer block"
        aria-label="Four-way intersection showing live North, South, East, and West vehicle counts and red/yellow/green traffic signals"
      />
      <div className="pointer-events-none absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs text-slate-400">
        <span>
          {telemetry.signal_strategy === 'single_approach'
            ? `AdaptiveSignalController · ${telemetry.adaptive_controller.phase}`
            : `Corridor Optimizer · ${telemetry.corridor_optimizer.active_corridor_phase.toUpperCase()}`}
        </span>
        <span className="font-mono tabular-nums text-slate-300">
          {telemetry.adaptive_controller.remaining_seconds}s remaining
        </span>
      </div>
    </div>
  );
};
