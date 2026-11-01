import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, Play, RefreshCw } from 'lucide-react';
import type { Direction, SystemSnapshot } from '../types/traffic';

interface PythonIntegrationViewProps {
  snapshot: SystemSnapshot;
}

export const PythonIntegrationView: React.FC<PythonIntegrationViewProps> = ({
  snapshot,
}) => {
  const baseUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000';

  const [testPayload, setTestPayload] = useState<string>(() =>
    JSON.stringify(
      {
        intersectionId: 'INT-402',
        source: 'ultralytics-yolov8m-node01',
        approaches: {
          north: {
            cars: 22,
            bikes: 6,
            buses: 3,
            trucks: 2,
            emergency: 0,
            fps: 36.4,
            inferenceMs: 12.1,
          },
          south: {
            cars: 14,
            bikes: 4,
            buses: 1,
            trucks: 1,
            emergency: 0,
            fps: 35.8,
            inferenceMs: 12.6,
          },
          east: {
            cars: 4,
            bikes: 2,
            buses: 0,
            trucks: 0,
            emergency: 0,
            fps: 37.1,
            inferenceMs: 11.8,
          },
          west: {
            cars: 11,
            bikes: 3,
            buses: 1,
            trucks: 0,
            emergency: 0,
            fps: 36.0,
            inferenceMs: 12.3,
          },
        },
      },
      null,
      2
    )
  );

  const [apiResponseText, setApiResponseText] = useState<string>('');
  const [sendingPayload, setSendingPayload] = useState<boolean>(false);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [hardwareStateJson, setHardwareStateJson] = useState<string>('');

  const pythonScript = useMemo(() => {
    return `"""
FlowAI - Real-Time YOLOv8/v11 Detection & Adaptive Signal Bridge
Integrates existing OpenCV / Ultralytics YOLO camera streams with the FlowAI Web Dashboard
and reads back authoritative R/Y/G signal states for hardware/PLC/Arduino controllers.

Dependencies:
    pip install ultralytics opencv-python requests
"""

import time
import cv2
import requests
from ultralytics import YOLO

FLOWAI_BASE_URL = "${baseUrl}"
INGEST_ENDPOINT = f"{FLOWAI_BASE_URL}/api/yolo/ingest"
COMMANDS_ENDPOINT = f"{FLOWAI_BASE_URL}/api/signal/commands"

# Load pretrained or custom-trained YOLO weights (COCO: 2=car, 3=motorcycle, 5=bus, 7=truck)
model = YOLO("yolov8m.pt")

CAMERA_STREAMS = {
    "north": 0,  # Replace with RTSP URL or MP4 path e.g. "rtsp://cam-north/stream"
    "south": "videos/south_corridor.mp4",
    "east": "videos/east_expressway.mp4",
    "west": "videos/west_corridor.mp4",
}

COCO_CLASS_MAP = {
    2: "cars",
    3: "bikes",
    5: "buses",
    7: "trucks",
}


def analyze_frame(frame):
    t0 = time.perf_counter()
    results = model.predict(frame, conf=0.40, verbose=False)[0]
    inference_ms = round((time.perf_counter() - t0) * 1000, 1)
    fps = round(1000.0 / max(1.0, inference_ms), 1)

    counts = {"cars": 0, "bikes": 0, "buses": 0, "trucks": 0, "emergency": 0}
    detections = []

    h, w = frame.shape[:2]
    for idx, box in enumerate(results.boxes):
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        cls_name = model.names.get(cls_id, "car").lower()

        if "ambulance" in cls_name or "emergency" in cls_name:
            counts["emergency"] += 1
            norm_label = "ambulance"
        elif cls_id in COCO_CLASS_MAP:
            bucket = COCO_CLASS_MAP[cls_id]
            counts[bucket] += 1
            norm_label = (
                "motorcycle" if bucket == "bikes"
                else "bus" if bucket == "buses"
                else "truck" if bucket == "trucks"
                else "car"
            )
        else:
            continue

        x1, y1, x2, y2 = box.xyxy[0].tolist()
        detections.append({
            "id": f"yolo-{idx}",
            "label": norm_label,
            "confidence": round(conf, 2),
            "x": round((x1 / w) * 100, 1),
            "y": round((y1 / h) * 100, 1),
            "width": round(((x2 - x1) / w) * 100, 1),
            "height": round(((y2 - y1) / h) * 100, 1),
        })

    return {
        **counts,
        "fps": fps,
        "inferenceMs": inference_ms,
        "detections": detections[:25],
    }


def run_bridge_loop():
    caps = {direction: cv2.VideoCapture(src) for direction, src in CAMERA_STREAMS.items()}
    print(f"Connected to FlowAI controller at {FLOWAI_BASE_URL}")

    while True:
        approaches_payload = {}
        for direction, cap in caps.items():
            ok, frame = cap.read()
            if not ok:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            approaches_payload[direction] = analyze_frame(frame)

        if approaches_payload:
            resp = requests.post(
                INGEST_ENDPOINT,
                json={
                    "intersectionId": "INT-402",
                    "source": "python-yolov8-bridge",
                    "approaches": approaches_payload,
                },
                timeout=3.0,
            )
            controller_reply = resp.json()
            # Forward authoritative R/Y/G signal states to GPIO / Serial Traffic Controller:
            print("Active Signals:", controller_reply.get("signals"))

        time.sleep(1.0)


if __name__ == "__main__":
    run_bridge_loop()
`;
  }, [baseUrl]);

  const handleSendTestPayload = async () => {
    setPayloadError(null);
    setSendingPayload(true);
    try {
      const parsed = JSON.parse(testPayload);
      const res = await fetch('/api/yolo/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to push YOLO payload');
      }
      setApiResponseText(JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      setPayloadError(
        err instanceof Error ? err.message : 'Invalid JSON payload'
      );
    } finally {
      setSendingPayload(false);
    }
  };

  const handlePollHardwareSignals = async () => {
    const res = await fetch('/api/signal/commands');
    const data = await res.json();
    setHardwareStateJson(JSON.stringify(data, null, 2));
  };

  const handleCopyScript = async () => {
    await navigator.clipboard.writeText(pythonScript);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDownloadScript = () => {
    const blob = new Blob([pythonScript], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flowai_yolo_bridge.py';
    a.click();
    URL.revokeObjectURL(url);
  };

  const directions: Direction[] = ['north', 'south', 'east', 'west'];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-50 text-balance">
            Python YOLO & Signal Hardware API Integration
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Stream live vehicle detections from your Python Ultralytics YOLO
            pipeline via REST and poll authoritative R/Y/G phase commands for
            physical signal controllers.
          </p>
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-300 shrink-0">
          {snapshot.externalYoloConnected
            ? `External YOLO Connected · Last push ${new Date(
                snapshot.lastExternalPushIso ?? Date.now()
              ).toLocaleTimeString()}`
            : 'Internal Adaptive Simulator Active · Listening on /api/yolo/ingest'}
        </div>
      </div>

      {/* Endpoint Summary Table */}
      <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800">
        <h3 className="text-base font-semibold text-slate-100 pb-4 border-b border-slate-800">
          REST & Streaming Telemetry Endpoints
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-4 font-medium">Method</th>
                <th className="py-2 px-4 font-medium">Endpoint Path</th>
                <th className="py-2 px-4 font-medium">Integration Role</th>
                <th className="py-2 pl-4 font-medium text-right">
                  Active Source
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              <tr className="h-10">
                <td className="py-2 pr-4 font-mono font-semibold text-blue-400">
                  POST
                </td>
                <td className="py-2 px-4 font-mono text-slate-200">
                  {baseUrl}/api/yolo/ingest
                </td>
                <td className="py-2 px-4 text-slate-400">
                  Ingests per-corridor YOLO vehicle counts, bounding boxes, FPS,
                  and emergency vehicle flags
                </td>
                <td className="py-2 pl-4 text-right font-mono tabular-nums text-slate-300">
                  {directions
                    .map((d) => snapshot.approaches[d].source)
                    .includes('PYTHON_YOLO_API')
                    ? 'PYTHON_YOLO_API'
                    : 'READY'}
                </td>
              </tr>
              <tr className="h-10">
                <td className="py-2 pr-4 font-mono font-semibold text-emerald-400">
                  GET
                </td>
                <td className="py-2 px-4 font-mono text-slate-200">
                  {baseUrl}/api/signal/commands
                </td>
                <td className="py-2 px-4 text-slate-400">
                  Returns authoritative RED / YELLOW / GREEN lamp states and
                  countdowns for Arduino, RPi, or PLC controllers
                </td>
                <td className="py-2 pl-4 text-right font-mono tabular-nums text-emerald-400">
                  1 Hz SYNC
                </td>
              </tr>
              <tr className="h-10">
                <td className="py-2 pr-4 font-mono font-semibold text-emerald-400">
                  GET
                </td>
                <td className="py-2 px-4 font-mono text-slate-200">
                  {baseUrl}/api/traffic/stream
                </td>
                <td className="py-2 px-4 text-slate-400">
                  Server-Sent Events (SSE) real-time intersection telemetry
                  stream
                </td>
                <td className="py-2 pl-4 text-right font-mono tabular-nums text-emerald-400">
                  STREAMING
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Live API Payload Sandbox & Hardware Command Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Test YOLO Ingestion Endpoint
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Send a real HTTP POST payload to update live intersection
                  queues and adaptive green timers immediately.
                </p>
              </div>
              <button
                type="button"
                disabled={sendingPayload}
                onClick={handleSendTestPayload}
                className="px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                <span>
                  {sendingPayload ? 'Sending...' : 'POST /api/yolo/ingest'}
                </span>
              </button>
            </div>

            {payloadError && (
              <div className="mt-3 p-2.5 rounded-lg bg-red-950/40 border border-red-900/60 text-xs text-red-300">
                {payloadError}
              </div>
            )}

            <textarea
              value={testPayload}
              onChange={(e) => setTestPayload(e.target.value)}
              rows={13}
              spellCheck={false}
              className="mt-4 w-full p-3.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          {apiResponseText && (
            <div className="pt-3 border-t border-slate-800">
              <div className="text-xs text-emerald-400 mb-1.5">
                Controller HTTP 200 Response:
              </div>
              <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto max-h-40">
                {apiResponseText}
              </pre>
            </div>
          )}
        </div>

        <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Inspect Signal Controller Output
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Poll authoritative R/Y/G signal states consumed by physical
                  intersection relays or microcontrollers.
                </p>
              </div>
              <button
                type="button"
                onClick={handlePollHardwareSignals}
                className="px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>GET /api/signal/commands</span>
              </button>
            </div>

            <pre className="mt-4 p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 overflow-x-auto min-h-[260px]">
              {hardwareStateJson ||
                JSON.stringify(
                  {
                    intersectionId: snapshot.intersectionId,
                    mode: snapshot.mode,
                    phaseStage: snapshot.phaseStage,
                    activePhaseDirection: snapshot.activePhaseDirection,
                    signals: {
                      north: {
                        state: snapshot.approaches.north.signal,
                        countdownSec: snapshot.approaches.north.countdownSec,
                        allocatedGreenSec:
                          snapshot.approaches.north.allocatedGreenSec,
                      },
                      south: {
                        state: snapshot.approaches.south.signal,
                        countdownSec: snapshot.approaches.south.countdownSec,
                        allocatedGreenSec:
                          snapshot.approaches.south.allocatedGreenSec,
                      },
                      east: {
                        state: snapshot.approaches.east.signal,
                        countdownSec: snapshot.approaches.east.countdownSec,
                        allocatedGreenSec:
                          snapshot.approaches.east.allocatedGreenSec,
                      },
                      west: {
                        state: snapshot.approaches.west.signal,
                        countdownSec: snapshot.approaches.west.countdownSec,
                        allocatedGreenSec:
                          snapshot.approaches.west.allocatedGreenSec,
                      },
                    },
                  },
                  null,
                  2
                )}
            </pre>
          </div>

          <div className="pt-3 border-t border-slate-800 text-xs text-slate-400">
            Tip: Set emergency count to 1 in any corridor payload above and send
            to observe automatic emergency vehicle preemption.
          </div>
        </div>
      </div>

      {/* Python YOLOv8 Bridge Script */}
      <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Python YOLO Detection Bridge (flowai_yolo_bridge.py)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Drop-in Python client for Ultralytics YOLOv8/YOLOv11 + OpenCV
              pre-configured for this FlowAI deployment URL.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyScript}
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadScript}
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .py</span>
            </button>
          </div>
        </div>

        <pre className="mt-4 p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto max-h-[420px]">
          <code>{pythonScript}</code>
        </pre>
      </div>
    </div>
  );
};
