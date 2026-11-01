import 'dotenv/config';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const PYTHON_PORT = Number(process.env.FLOWAI_BACKEND_PORT || 8000);
const PYTHON_BASE = `http://127.0.0.1:${PYTHON_PORT}`;

let pythonProc: ChildProcess | null = null;

async function isPythonBackendUp(): Promise<boolean> {
  try {
    const res = await fetch(`${PYTHON_BASE}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensurePythonBackend(backendScriptPath: string): Promise<void> {
  if (await isPythonBackendUp()) {
    return;
  }

  pythonProc = spawn('python3', [backendScriptPath], {
    env: {
      ...process.env,
      FLOWAI_BACKEND_PORT: String(PYTHON_PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pythonProc.stdout?.on('data', (chunk: Buffer) => {
    process.stdout.write(`[Python] ${chunk.toString()}`);
  });
  pythonProc.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[Python] ${chunk.toString()}`);
  });

  for (let attempt = 0; attempt < 25; attempt++) {
    if (await isPythonBackendUp()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

function cleanupChild() {
  if (pythonProc && !pythonProc.killed) {
    pythonProc.kill('SIGTERM');
    pythonProc = null;
  }
}

process.on('SIGINT', () => {
  cleanupChild();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanupChild();
  process.exit(0);
});

export async function createFlowAiGatewayServer(options: {
  viteRootDir: string;
  backendScriptPath: string;
}) {
  await ensurePythonBackend(options.backendScriptPath);

  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Snapshot computer-vision vehicle detector that pushes directly into Python backend
  app.post('/api/yolo/detect-frame', async (req: Request, res: Response) => {
    try {
      const { imageBase64, mimeType, applyToDirection } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        applyToDirection?: string;
      };

      if (!imageBase64 || !mimeType) {
        res.status(400).json({ error: 'Missing imageBase64 or mimeType' });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.status(500).json({
          error:
            'GEMINI_API_KEY is not configured. Check Settings > Secrets or run python dashboard/run_yolo_live.py for local YOLOv8.',
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });

      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [
            { inlineData: { mimeType, data: cleanBase64 } },
            {
              text:
                'Detect all road vehicles in this image and classify each strictly as one of: ' +
                '"Car", "Motorcycle", "Bicycle", "Bus", or "Truck". ' +
                'Provide normalized bounding box [ymin, xmin, ymax, xmax] scaled 0 to 1000.',
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    confidence: { type: Type.NUMBER },
                    ymin: { type: Type.NUMBER },
                    xmin: { type: Type.NUMBER },
                    ymax: { type: Type.NUMBER },
                    xmax: { type: Type.NUMBER },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse(
        (response.text ?? '{"detections":[]}').trim()
      ) as {
        detections?: Array<{
          label?: string;
          confidence?: number;
          ymin?: number;
          xmin?: number;
          ymax?: number;
          xmax?: number;
        }>;
      };

      const classes: Record<string, number> = {
        Car: 0,
        Motorcycle: 0,
        Bicycle: 0,
        Bus: 0,
        Truck: 0,
      };

      const boxes = (parsed.detections ?? []).slice(0, 35).map((d, idx) => {
        const raw = (d.label ?? 'Car').toLowerCase();
        let norm = 'Car';
        if (raw.includes('motor') || raw.includes('scooter')) norm = 'Motorcycle';
        else if (raw.includes('bicyc') || raw.includes('bike')) norm = 'Bicycle';
        else if (raw.includes('bus')) norm = 'Bus';
        else if (raw.includes('truck') || raw.includes('van')) norm = 'Truck';

        classes[norm] += 1;

        const xmin = Math.max(0, Math.min(980, Number(d.xmin ?? 100)));
        const ymin = Math.max(0, Math.min(980, Number(d.ymin ?? 100)));
        const xmax = Math.max(xmin + 20, Math.min(1000, Number(d.xmax ?? 260)));
        const ymax = Math.max(ymin + 20, Math.min(1000, Number(d.ymax ?? 260)));

        return {
          id: `frame-${Date.now()}-${idx}`,
          label: norm,
          confidence: Math.max(0.55, Math.min(0.99, Number(d.confidence ?? 0.92))),
          x: Math.round((xmin / 10) * 10) / 10,
          y: Math.round((ymin / 10) * 10) / 10,
          width: Math.round(((xmax - xmin) / 10) * 10) / 10,
          height: Math.round(((ymax - ymin) / 10) * 10) / 10,
        };
      });

      const total =
        classes.Car +
        classes.Motorcycle +
        classes.Bicycle +
        classes.Bus +
        classes.Truck;

      if (applyToDirection) {
        const dirUp = applyToDirection.toUpperCase();
        await fetch(`${PYTHON_BASE}/api/yolo/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: `Snapshot Upload (${dirUp})`,
            streams: {
              [dirUp]: {
                vehicle_count: total,
                queue_length: Math.max(0, Math.round(total * 0.6)),
                vehicle_classes: classes,
              },
            },
          }),
        });
      }

      res.json({ total, classes, boxes });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Detection failed',
      });
    }
  });

  // Proxy all other /api/* requests directly to Python backend_server.py
  app.all('/api/*', async (req: Request, res: Response) => {
    try {
      const targetUrl = `${PYTHON_BASE}${req.originalUrl}`;
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body:
          req.method !== 'GET' && req.method !== 'HEAD'
            ? JSON.stringify(req.body ?? {})
            : undefined,
      });
      const text = await upstream.text();
      res
        .status(upstream.status)
        .setHeader('Content-Type', 'application/json; charset=utf-8')
        .send(text);
    } catch (err: unknown) {
      res.status(502).json({
        error: 'Python backend unreachable',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: options.viteRootDir,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(options.viteRootDir, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FlowAI Dashboard running on http://0.0.0.0:${PORT}`);
  });
}

// Run directly when executed via `cd dashboard && npm run dev`
if (path.resolve(process.argv[1] || '') === __filename) {
  createFlowAiGatewayServer({
    viteRootDir: __dirname,
    backendScriptPath: path.join(__dirname, 'backend_server.py'),
  });
}
