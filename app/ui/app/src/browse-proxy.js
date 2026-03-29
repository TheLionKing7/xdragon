/**
 * ═══════════════════════════════════════════════════════════════════════
 *  ARCHON NEXUS — xDragon Browse Proxy
 *  Bridges BrowserPanel.tsx ↔ Camoufox Connector
 *
 *  INSTALL (once, in xdragon/app/ui/app or any node project):
 *    npm install express playwright cors
 *
 *  RUN (PowerShell, keep open alongside camoufox-connector):
 *    node browse-proxy.js
 *    → listens on http://localhost:3001
 *
 *  SET in BrowserPanel.tsx:
 *    daemonUrl="http://localhost:3001"
 *
 *  REQUIRES: camoufox-connector already running on port 8080
 * ═══════════════════════════════════════════════════════════════════════
 */

import express    from 'express';
import cors       from 'cors';
import { firefox } from 'playwright';
import { randomUUID } from 'crypto';

const PORT            = 3001;
const CONNECTOR_URL   = 'http://localhost:8080';
const SCREENSHOT_TYPE = 'png';

const app      = express();
const sessions = new Map(); // sessionId → { page, context, browser, agent, url, title, history }

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Helpers ─────────────────────────────────────────────────────────────

/** Ask connector for next available Camoufox WebSocket endpoint */
async function getConnectorEndpoint() {
  const r = await fetch(`${CONNECTOR_URL}/next`);
  if (!r.ok) throw new Error(`Connector returned ${r.status}: ${await r.text()}`);
  const data = await r.json();
  // connector /next returns { endpoint: "ws://..." } or { ws: "..." }
  const ws = data.endpoint || data.ws || data.websocket || data.browser_endpoint;
  if (!ws) throw new Error(`No WebSocket endpoint in connector response: ${JSON.stringify(data)}`);
  return ws;
}

/** Connect Playwright Firefox to Camoufox via WS endpoint */
async function connectToInstance(wsEndpoint) {
  const browser = await firefox.connect(wsEndpoint, { timeout: 30_000 });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: undefined, // Camoufox manages its own UA
  });
  const page = await context.newPage();
  return { browser, context, page };
}

/** Take PNG screenshot → base64 string */
async function screenshot(page) {
  try {
    const buf = await page.screenshot({ type: SCREENSHOT_TYPE, fullPage: false });
    return buf.toString('base64');
  } catch (e) {
    console.warn('Screenshot failed:', e.message);
    return null;
  }
}

/** Build accessibility snapshot (simplified tree for UI rendering) */
async function axSnapshot(page) {
  try {
    const snap = await page.accessibility.snapshot({ interestingOnly: false });
    return simplifyAX(snap, 0);
  } catch (e) {
    console.warn('AX snapshot failed:', e.message);
    return null;
  }
}

/** Trim AX tree depth and assign short refs to interactive elements */
let refCounter = 0;
const refMap = new Map(); // ref string → { sessionId, role, name }

function simplifyAX(node, depth) {
  if (!node || depth > 6) return null;
  const interestiveRoles = ['button','link','textbox','combobox','checkbox','radio','menuitem','listitem'];
  const ref = interestiveRoles.includes(node.role) ? `e${++refCounter}` : undefined;
  if (ref) refMap.set(ref, { role: node.role, name: node.name });

  const simplified = {
    role:  node.role,
    name:  node.name  || undefined,
    ref:   ref        || undefined,
  };

  if (node.children && depth < 5) {
    const kids = node.children
      .map(c => simplifyAX(c, depth + 1))
      .filter(Boolean);
    if (kids.length) simplified.children = kids;
  }

  return simplified;
}

/** Find element on page using ref → locate by role+name */
async function locateByRef(page, ref) {
  const meta = refMap.get(ref);
  if (!meta) throw new Error(`Unknown ref ${ref}`);
  // Try accessible role locator first
  try {
    const loc = page.getByRole(meta.role, { name: meta.name, exact: false });
    if (await loc.count() > 0) return loc.first();
  } catch (_e) { /* fall through */ }
  // Fallback: text locator
  if (meta.name) {
    const byText = page.getByText(meta.name, { exact: false });
    if (await byText.count() > 0) return byText.first();
  }
  throw new Error(`Could not locate element [${ref}] role=${meta.role} name=${meta.name}`);
}

// ── Routes ───────────────────────────────────────────────────────────────

/** GET / — server info */
app.get('/', (_req, res) => {
  res.json({
    name:      'xDragon Browse Proxy',
    version:   '1.0.0',
    connector: CONNECTOR_URL,
    sessions:  sessions.size,
  });
});

/** GET /api/browse/sessions — list all active sessions */
app.get('/api/browse/sessions', (_req, res) => {
  const list = [...sessions.entries()].map(([id, s]) => ({
    id,
    agent:     s.agent,
    url:       s.url,
    title:     s.title,
    status:    s.status,
    startedAt: s.startedAt,
  }));
  res.json({ sessions: list });
});

/** GET /api/health */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', sessions: sessions.size });
});

/** POST /api/browse/new — create a new session */
app.post('/api/browse/new', async (req, res) => {
  const { agent = 'KOFI' } = req.body;
  try {
    console.log(`[browse] Creating session for ${agent}...`);
    const wsEndpoint = await getConnectorEndpoint();
    console.log(`[browse] Connecting to ${wsEndpoint}`);
    const { browser, context, page } = await connectToInstance(wsEndpoint);
    const sessionId = randomUUID();
    sessions.set(sessionId, {
      browser, context, page,
      agent,
      url:       '',
      title:     '',
      status:    'idle',
      startedAt: Date.now(),
      history:   [],
    });
    console.log(`[browse] Session ${sessionId.slice(0, 8)} created for ${agent}`);
    res.json({ sessionId, agent });
  } catch (e) {
    console.error('[browse] new session failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/browse/navigate — navigate to URL */
app.post('/api/browse/navigate', async (req, res) => {
  const { sessionId, url } = req.body;
  const s = sessions.get(sessionId);
  if (!s) return res.status(404).json({ error: 'Session not found' });

  s.status = 'loading';
  try {
    console.log(`[browse:${sessionId.slice(0,8)}] Navigate → ${url}`);
    await s.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await s.page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

    s.url    = s.page.url();
    s.title  = await s.page.title();
    s.status = 'ready';
    s.history.unshift({ url: s.url, title: s.title, ts: Date.now() });
    if (s.history.length > 50) s.history.pop();

    const snap = await axSnapshot(s.page);
    const shot = await screenshot(s.page);

    console.log(`[browse:${sessionId.slice(0,8)}] Loaded: ${s.title}`);
    res.json({ url: s.url, title: s.title, snapshot: snap, screenshot: shot });
  } catch (e) {
    s.status = 'error';
    console.error(`[browse:${sessionId.slice(0,8)}] Navigate failed:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/browse/action — click, type, scroll, back, forward, reload, extract */
app.post('/api/browse/action', async (req, res) => {
  const { sessionId, type, ref, text } = req.body;
  const s = sessions.get(sessionId);
  if (!s) return res.status(404).json({ error: 'Session not found' });

  try {
    console.log(`[browse:${sessionId.slice(0,8)}] Action: ${type}${ref ? ` [${ref}]` : ''}`);

    switch (type) {
      case 'click': {
        const el = await locateByRef(s.page, ref);
        await el.click({ timeout: 8_000 });
        await s.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
        break;
      }
      case 'type': {
        if (ref) {
          const el = await locateByRef(s.page, ref);
          await el.fill(text ?? '', { timeout: 5_000 });
        } else {
          await s.page.keyboard.type(text ?? '');
        }
        break;
      }
      case 'scroll':
        await s.page.evaluate(() => window.scrollBy(0, 600));
        break;
      case 'back':
        await s.page.goBack({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {});
        break;
      case 'forward':
        await s.page.goForward({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {});
        break;
      case 'reload':
        await s.page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 });
        break;
      case 'extract': {
        const extracted = await s.page.evaluate(() => document.body.innerText);
        const snap = await axSnapshot(s.page);
        const shot = await screenshot(s.page);
        s.url   = s.page.url();
        s.title = await s.page.title();
        return res.json({
          url: s.url, title: s.title,
          snapshot: snap, screenshot: shot,
          text: extracted,
        });
      }
      default:
        return res.status(400).json({ error: `Unknown action type: ${type}` });
    }

    s.url   = s.page.url();
    s.title = await s.page.title().catch(() => s.title);

    const snap = await axSnapshot(s.page);
    const shot = await screenshot(s.page);
    res.json({ url: s.url, title: s.title, snapshot: snap, screenshot: shot });
  } catch (e) {
    console.error(`[browse:${sessionId.slice(0,8)}] Action ${type} failed:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/browse/snapshot — refresh snapshot for existing session */
app.get('/api/browse/snapshot', async (req, res) => {
  const { sessionId } = req.query;
  const s = sessions.get(sessionId);
  if (!s) return res.status(404).json({ error: 'Session not found' });

  try {
    s.url   = s.page.url();
    s.title = await s.page.title().catch(() => s.title);
    const snap = await axSnapshot(s.page);
    const shot = await screenshot(s.page);
    res.json({
      agent: s.agent, url: s.url, title: s.title,
      snapshot: snap, screenshot: shot,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** DELETE /api/browse/session — close session */
app.delete('/api/browse/session', async (req, res) => {
  const { sessionId } = req.body;
  const s = sessions.get(sessionId);
  if (!s) return res.status(404).json({ error: 'Session not found' });

  try {
    await s.context.close().catch(() => {});
    await s.browser.disconnect().catch(() => {});
  } catch (_e) { /* ignore */ }

  sessions.delete(sessionId);
  console.log(`[browse] Session ${sessionId.slice(0, 8)} closed`);
  res.json({ ok: true });
});

// ── Start ────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('');
  console.log('============================================================');
  console.log('  xDragon Browse Proxy — Ready');
  console.log('============================================================');
  console.log(`  Listening:  http://localhost:${PORT}`);
  console.log(`  Connector:  ${CONNECTOR_URL}`);
  console.log('  Routes:');
  console.log('    POST /api/browse/new');
  console.log('    POST /api/browse/navigate');
  console.log('    POST /api/browse/action');
  console.log('    GET  /api/browse/snapshot?sessionId=');
  console.log('    GET  /api/browse/sessions');
  console.log('    DELETE /api/browse/session');
  console.log('============================================================');
  console.log('');
  console.log('  Set in BrowserPanel.tsx:');
  console.log('    daemonUrl="http://localhost:3001"');
  console.log('');
});

// Graceful shutdown — close all browser sessions
process.on('SIGINT', async () => {
  console.log('\n[browse] Shutting down — closing sessions...');
  for (const [id, s] of sessions) {
    try { await s.context.close(); await s.browser.disconnect(); } catch (_e) { /* ignore */ }
    console.log(`[browse]   closed ${id.slice(0, 8)}`);
  }
  process.exit(0);
});