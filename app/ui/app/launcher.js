/**
 * ═══════════════════════════════════════════════════════════════════════
 *  ARCHON NEXUS — xDragon Service Launcher
 *  Manages: ollama serve · camoufox-connector · browse-proxy.js
 *
 *  SETUP (one time):
 *    cd C:\Users\DELL\Documents\GitHub\xdragon\app\ui\app
 *    npm install express cors
 *
 *  RUN (one time, then control everything from xDragon Settings UI):
 *    node launcher.js
 *    → API on http://localhost:3002
 *
 *  OPTIONAL — auto-start on Windows login:
 *    Add to Task Scheduler or create a .bat file in shell:startup
 *    %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\archon-launcher.bat
 *    Content: node C:\Users\DELL\Documents\GitHub\xdragon\app\ui\app\launcher.js
 * ═══════════════════════════════════════════════════════════════════════
 */

import express  from 'express';
import cors     from 'cors';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path     from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3002;

const app = express();
app.use(cors());
app.use(express.json());

// ── Service definitions ──────────────────────────────────────────────
const SERVICES = {
  ollama: {
    id:      'ollama',
    label:   'Ollama Serve',
    command: 'ollama',
    args:    ['serve'],
    cwd:     null,
    color:   '#c9a84c',
    description: 'Local LLM inference engine — port 11434',
    readySignal: null,   // ollama serve has no startup banner — uses 2s timed fallback
    stopSignal:  'SIGTERM',
  },
  camoufox: {
    id:      'camoufox',
    label:   'Camoufox Connector',
    command: 'python',
    args:    [path.join(__dirname, 'start-camoufox.py')],  // tiny helper — avoids shell quoting issues
    cwd:     __dirname,
    color:   '#5ab0c8',
    description: 'Stealth browser pool — port 8080',
    readySignal: 'Browser pool started',  // confirmed working in logs
    stopSignal:  'SIGTERM',
    env: { PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
  },
  browse_proxy: {
    id:      'browse_proxy',
    label:   'Browse Proxy',
    command: 'node',
    args:    [path.join(__dirname, 'browse-proxy.js')],  // absolute path — works from any cwd
    cwd:     __dirname,
    color:   '#4a9a6a',
    description: 'Playwright bridge for BrowserPanel — port 3001',
    readySignal: 'Listening:',  // matches "  Listening:  http://localhost:3001"
    stopSignal:  'SIGTERM',
  },
};

// ── State ────────────────────────────────────────────────────────────
const state = {};
const logs  = {};
const emitter = new EventEmitter();

for (const id of Object.keys(SERVICES)) {
  state[id] = { status: 'stopped', pid: null, startedAt: null, restarts: 0 };
  logs[id]  = [];  // circular buffer, last 200 lines
}

function pushLog(id, line, stream = 'out') {
  const entry = { t: Date.now(), line: line.trimEnd(), stream };
  logs[id].push(entry);
  if (logs[id].length > 200) logs[id].shift();
  emitter.emit('log', { id, ...entry });
}

// ── Process management ───────────────────────────────────────────────
const procs = {};

function startService(id) {
  const svc = SERVICES[id];
  if (!svc) return { ok: false, error: `Unknown service: ${id}` };
  // Reset ghost 'starting' state if process already exited
  if (state[id].status === 'starting' && !procs[id]) {
    state[id].status = 'stopped';
    pushLog(id, `[launcher] Reset stuck starting state`, 'sys');
  }
  if (procs[id]) return { ok: false, error: `${svc.label} is already running` };

  state[id].status = 'starting';
  pushLog(id, `[launcher] Starting ${svc.label}…`, 'sys');

  const opts = { shell: true };
  if (svc.cwd) opts.cwd = svc.cwd;
  if (svc.env) opts.env = { ...process.env, ...svc.env };

  let proc;
  try {
    proc = spawn(svc.command, svc.args, opts);
  } catch (e) {
    state[id].status = 'error';
    pushLog(id, `[launcher] Failed to spawn: ${e.message}`, 'err');
    return { ok: false, error: e.message };
  }

  procs[id]          = proc;
  state[id].pid      = proc.pid;
  state[id].startedAt = Date.now();

  const onData = (data, stream) => {
    const lines = data.toString().split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      pushLog(id, line, stream);
      // Detect ready signal
      if (state[id].status === 'starting' && svc.readySignal && line.includes(svc.readySignal)) {
        state[id].status = 'running';
        pushLog(id, `[launcher] ${svc.label} is ready ✓`, 'sys');
        emitter.emit('status', { id, status: 'running' });
      }
    }
  };

  proc.stdout.on('data', d => onData(d, 'out'));
  proc.stderr.on('data', d => onData(d, 'err'));

  proc.on('error', err => {
    state[id].status = 'error';
    pushLog(id, `[launcher] Process error: ${err.message}`, 'err');
    delete procs[id];
    emitter.emit('status', { id, status: 'error' });
  });

  proc.on('close', code => {
    const wasRunning = state[id].status === 'running';
    state[id].status = 'stopped';
    state[id].pid    = null;
    delete procs[id];
    pushLog(id, `[launcher] Process exited (code ${code})`, 'sys');
    emitter.emit('status', { id, status: 'stopped' });
  });

  // Timed fallback — marks running if no readySignal fires within timeout
  // ollama: 3s, camoufox: 60s (browser warmup), browse_proxy: 5s
  const timeouts = { ollama: 3000, camoufox: 90000, browse_proxy: 5000 };
  const fallback = timeouts[id] ?? 5000;
  setTimeout(() => {
    if (state[id].status === 'starting') {
      state[id].status = 'running';
      pushLog(id, `[launcher] ${svc.label} marked ready (timed fallback)`, 'sys');
      emitter.emit('status', { id, status: 'running' });
    }
  }, fallback);

  return { ok: true, pid: proc.pid };
}

function stopService(id) {
  const svc   = SERVICES[id];
  const proc  = procs[id];
  if (!proc) return { ok: false, error: `${svc?.label ?? id} is not running` };

  state[id].status = 'stopping';
  pushLog(id, `[launcher] Stopping ${svc.label}…`, 'sys');

  try {
    // Windows: use taskkill to kill the whole process tree
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { shell: true });
    } else {
      proc.kill('SIGTERM');
    }
  } catch (e) {
    pushLog(id, `[launcher] Stop error: ${e.message}`, 'err');
  }

  return { ok: true };
}

// ── Routes ───────────────────────────────────────────────────────────

// GET / — server info
app.get('/', (_req, res) => {
  res.json({
    name: 'xDragon Service Launcher',
    version: '1.0.0',
    port: PORT,
    services: Object.keys(SERVICES),
  });
});

// GET /api/services — all service states
app.get('/api/services', (_req, res) => {
  const result = {};
  for (const [id, svc] of Object.entries(SERVICES)) {
    result[id] = {
      ...svc,
      ...state[id],
      logCount: logs[id].length,
    };
  }
  res.json(result);
});

// GET /api/services/:id/status
app.get('/api/services/:id/status', (req, res) => {
  const { id } = req.params;
  if (!SERVICES[id]) return res.status(404).json({ error: 'Unknown service' });
  res.json({ id, ...state[id] });
});

// GET /api/services/:id/logs?tail=50
app.get('/api/services/:id/logs', (req, res) => {
  const { id } = req.params;
  if (!SERVICES[id]) return res.status(404).json({ error: 'Unknown service' });
  const tail = Math.min(parseInt(req.query.tail ?? '50', 10), 200);
  res.json({ id, logs: logs[id].slice(-tail) });
});

// POST /api/services/:id/start
app.post('/api/services/:id/start', (req, res) => {
  const { id } = req.params;
  if (!SERVICES[id]) return res.status(404).json({ error: 'Unknown service' });
  const result = startService(id);
  res.status(result.ok ? 200 : 400).json(result);
});

// POST /api/services/:id/stop
app.post('/api/services/:id/stop', (req, res) => {
  const { id } = req.params;
  if (!SERVICES[id]) return res.status(404).json({ error: 'Unknown service' });
  const result = stopService(id);
  res.status(result.ok ? 200 : 400).json(result);
});

// POST /api/services/:id/restart
app.post('/api/services/:id/restart', async (req, res) => {
  const { id } = req.params;
  if (!SERVICES[id]) return res.status(404).json({ error: 'Unknown service' });
  stopService(id);
  await new Promise(r => setTimeout(r, 1500));
  const result = startService(id);
  state[id].restarts++;
  res.status(result.ok ? 200 : 400).json(result);
});

// POST /api/services/start-all — start all stopped services
app.post('/api/services/start-all', async (_req, res) => {
  const results = {};
  for (const id of Object.keys(SERVICES)) {
    const stuck = state[id].status === 'starting' && !procs[id];
    if (state[id].status === 'stopped' || state[id].status === 'error' || stuck) {
      if (stuck) {
        state[id].status = 'stopped'; // reset ghost starting state
        pushLog(id, `[launcher] Reset stuck starting state for ${id}`, 'sys');
      }
      results[id] = startService(id);
      await new Promise(r => setTimeout(r, 800)); // stagger starts
    } else {
      results[id] = { ok: true, already: state[id].status };
    }
  }
  res.json(results);
});

// POST /api/services/stop-all
app.post('/api/services/stop-all', (_req, res) => {
  const results = {};
  for (const id of Object.keys(SERVICES)) {
    if (procs[id]) {
      results[id] = stopService(id);
    } else {
      results[id] = { ok: true, already: 'stopped' };
    }
  }
  res.json(results);
});

// GET /api/events — SSE stream for live log + status updates
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  // Send current state immediately
  res.write(`data: ${JSON.stringify({ type: 'init', state, services: SERVICES })}\n\n`);

  const onLog = data => {
    res.write(`data: ${JSON.stringify({ type: 'log', ...data })}\n\n`);
  };
  const onStatus = data => {
    res.write(`data: ${JSON.stringify({ type: 'status', ...data })}\n\n`);
  };

  emitter.on('log',    onLog);
  emitter.on('status', onStatus);

  // Heartbeat every 15s to keep connection alive
  const hb = setInterval(() => res.write(`: heartbeat\n\n`), 15000);

  req.on('close', () => {
    emitter.off('log',    onLog);
    emitter.off('status', onStatus);
    clearInterval(hb);
  });
});

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('============================================================');
  console.log('  xDragon Service Launcher — Ready');
  console.log('============================================================');
  console.log(`  API:      http://localhost:${PORT}`);
  console.log(`  Events:   http://localhost:${PORT}/api/events  (SSE)`);
  console.log('  Services: ollama · camoufox · browse_proxy');
  console.log('');
  console.log('  Control all services from xDragon Settings → Services');
  console.log('============================================================');
  console.log('');
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n[launcher] Shutting down all services…');
  for (const id of Object.keys(procs)) stopService(id);
  setTimeout(() => process.exit(0), 1500);
});