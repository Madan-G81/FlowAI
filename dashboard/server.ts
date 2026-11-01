import path from 'path';
import { fileURLToPath } from 'url';
import { createFlowAiGatewayServer } from './dashboard/server.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

createFlowAiGatewayServer({
  viteRootDir: __dirname,
  backendScriptPath: path.join(__dirname, 'dashboard', 'backend_server.py'),
});
