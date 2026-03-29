/**
 * ═══════════════════════════════════════════════════════════════════
 *  ARCHON ↔ xDragon TUNNEL CLIENT  v3.0
 *  Sovereign Agent Gateway — Socket.io Bridge
 *
 *  PLACE AT: xdragon/app/ui/app/src/lib/archon-tunnel.ts
 * ═══════════════════════════════════════════════════════════════════
 */

import { io, Socket } from 'socket.io-client';
import { ARCHON_BACKEND_URL } from './config';

// ── Types ──────────────────────────────────────────────────────────

export type ArchonTaskAction =
  | 'code.generate'   | 'code.review'     | 'code.deploy'
  | 'code.gitfort.commit' | 'code.gitfort.push'
  | 'design.create_page' | 'design.update_asset' | 'design.export'
  | 'services.ping_all'  | 'services.report'
  | 'vault.store'    | 'vault.retrieve' | 'vault.index' | 'vault.search'
  | 'research.brief' | 'research.deep'
  | 'legal.create_issue' | 'legal.compliance_check'
  | 'training.save_example' | 'training.sync_to_archon'
  | 'studio.navigate' | 'agent.ranks.update'
  | string;

export interface ArchonTask {
  taskId:    string;
  agentId:   string;
  action:    ArchonTaskAction;
  payload:   Record<string, unknown>;
  context?:  Record<string, unknown>;
  ts:        number;
  priority?: 'critical' | 'high' | 'normal' | 'low';
}

export interface ArchonTaskResult {
  taskId:     string;
  agentId:    string;
  action:     ArchonTaskAction;
  status:     'ok' | 'error' | 'partial';
  output?:    unknown;
  error?:     string;
  durationMs: number;
  ts:         number;
}

export interface ArchonStreamChunk {
  taskId: string;
  chunk:  string;
  done:   boolean;
}

export interface TunnelLogEntry {
  ts:      number;
  level:   'info' | 'success' | 'warn' | 'error';
  source:  string;
  message: string;
}

type TaskHandler = (task: ArchonTask, send: (msg: object) => void) => Promise<void>;
export type TunnelStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

// ── Config ─────────────────────────────────────────────────────────
// Railway cloud URL (switch back when deploying to production):
// const ARCHON_BASE_URL = 'https://archon-nexus-api-production.up.railway.app';
const GATEWAY_KEY_STORE = 'archon_gateway_key';

// ── Singleton ──────────────────────────────────────────────────────
export class ArchonTunnel {
  private static instance: ArchonTunnel | null = null;

  private socket:          Socket | null = null;
  private handlers:        Map<string, TaskHandler> = new Map();
  private globalHandler:   TaskHandler | null = null;
  private _status:         TunnelStatus = 'disconnected';
  private statusListeners: ((s: TunnelStatus) => void)[] = [];
  private logListeners:    ((e: TunnelLogEntry) => void)[] = [];
  private activeTasks:     Map<string, AbortController> = new Map();
  private agentRanks:      Record<string, number> = {};

  static getInstance(): ArchonTunnel {
    if (!ArchonTunnel.instance) ArchonTunnel.instance = new ArchonTunnel();
    return ArchonTunnel.instance;
  }

  private constructor() {}

  // ── Public API ─────────────────────────────────────────────────

  get status(): TunnelStatus { return this._status; }

  setGatewayKey(key: string): void { localStorage.setItem(GATEWAY_KEY_STORE, key); }
  getGatewayKey(): string          { return localStorage.getItem(GATEWAY_KEY_STORE) || ''; }
  getAgentRanks(): Record<string, number> { return this.agentRanks; }

  onStatusChange(cb: (s: TunnelStatus) => void): () => void {
    this.statusListeners.push(cb);
    return () => { this.statusListeners = this.statusListeners.filter(l => l !== cb); };
  }

  onLog(cb: (entry: TunnelLogEntry) => void): () => void {
    this.logListeners.push(cb);
    return () => { this.logListeners = this.logListeners.filter(l => l !== cb); };
  }

  onTask(action: ArchonTaskAction, handler: TaskHandler): void {
    this.handlers.set(action, handler);
  }

  onAnyTask(handler: TaskHandler): void {
    this.globalHandler = handler;
  }

  connect(): void {
    const key = this.getGatewayKey();
    if (!key) {
      this.log('warn', 'TUNNEL', 'No gateway key — configure in Settings → Archon Bridge');
      return;
    }
    if (this.socket?.connected) return;

    this.setStatus('connecting');
    this.log('info', 'TUNNEL', 'Connecting to Archon via Socket.io...');

    // Always connect directly to Railway — dev and prod
    const base = ARCHON_BACKEND_URL.replace(/\/$/, ''); // strip trailing slash
    const path = '/socket.io';
    const ns   = '/xdragon';

    this.log('info', 'TUNNEL', `Target: ${base}${ns}`);

    this.socket = io(`${base}${ns}`, {
      path,
      // polling first — more reliable through Railway's HTTP proxy
      // upgrades to websocket automatically after handshake
      transports:          ['polling'],  // polling only — Railway proxy blocks WS upgrades
      auth:                { key },
      reconnection:        true,
      reconnectionDelay:   3000,
      reconnectionDelayMax:30000,
      reconnectionAttempts:Infinity,
      timeout:             20000,
    });

    this.socket.on('connect', () => {
      this.setStatus('connected');
      this.log('success', 'TUNNEL', '✓ Connected to Archon backend');
      this.socket!.emit('announce', {
        client:       'xDragon-Studio',
        version:      'Alpha-S7',
        capabilities: [...this.handlers.keys()],
        ts:           Date.now(),
      });
    });

    this.socket.on('disconnect', (reason: string) => {
      this.setStatus(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting');
      this.log('warn', 'TUNNEL', `Disconnected: ${reason}`);
    });

    this.socket.on('connect_error', (err: Error) => {
      this.setStatus('reconnecting');
      this.log('error', 'TUNNEL', `Connection error: ${err.message}`);
    });

    this.socket.on('reconnect_attempt', (n: number) => {
      this.log('info', 'TUNNEL', `Reconnecting... (attempt ${n})`);
    });

    this.socket.on('welcome', (data: { clientId: string }) => {
      this.log('info', 'TUNNEL', `Welcome — clientId: ${data.clientId}`);
    });

    this.socket.on('task', (msg: { type: string; task: ArchonTask }) => {
      if (msg?.task) this.dispatchTask(msg.task);
    });

    this.socket.on('ping', (data: { ts: number }) => {
      this.socket!.emit('pong', { ts: Date.now(), originTs: data.ts });
    });

    this.socket.on('broadcast', (msg: { event: string; data: unknown }) => {
      this.log('info', 'BROADCAST', `${msg.event}`);
      if (msg.event === 'agent.ranks.update') {
        const d = msg.data as { ranks?: Record<string, number> };
        if (d?.ranks) this.agentRanks = d.ranks;
      }
      // Dispatch custom event for UI components to listen to
      window.dispatchEvent(new CustomEvent(`archon:broadcast:${msg.event}`, { detail: msg.data }));
    });

    this.socket.on('agent_update', (msg: { agentId: string }) => {
      this.log('info', 'AGENT', `${msg.agentId} updated`);
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.setStatus('disconnected');
  }

  sendResult(result: ArchonTaskResult): void {
    this.socket?.emit('result', { type: 'result', result });
  }

  sendStream(chunk: ArchonStreamChunk): void {
    this.socket?.emit('stream', { type: 'stream', ...chunk });
  }

  // ── Private ────────────────────────────────────────────────────

  private async dispatchTask(task: ArchonTask): Promise<void> {
    const start = Date.now();
    this.activeTasks.set(task.taskId, new AbortController());

    this.log('info', task.agentId, `→ ${task.action} [${task.taskId}]`);

    // Built-in: AgentRank update
    if (task.action === 'agent.ranks.update' && task.payload?.ranks) {
      this.agentRanks = task.payload.ranks as Record<string, number>;
      this.log('info', 'AGENTRANK', `Ranks: ${Object.entries(this.agentRanks).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k}=${v.toFixed(2)}`).join(' > ')}`);
      this.activeTasks.delete(task.taskId);
      return;
    }

    const handler = this.handlers.get(task.action) || this.globalHandler;

    if (!handler) {
      this.sendResult({
        taskId: task.taskId, agentId: task.agentId, action: task.action,
        status: 'error', error: `No handler for: ${task.action}`,
        durationMs: Date.now() - start, ts: Date.now(),
      });
      this.activeTasks.delete(task.taskId);
      return;
    }

    try {
      await handler(task, (msg) => this.socket?.emit('message', msg));
      this.log('success', task.agentId, `✓ ${task.action} in ${Date.now() - start}ms`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendResult({
        taskId: task.taskId, agentId: task.agentId, action: task.action,
        status: 'error', error: message, durationMs: Date.now() - start, ts: Date.now(),
      });
      this.log('error', task.agentId, `✗ ${task.action}: ${message}`);
    } finally {
      this.activeTasks.delete(task.taskId);
    }
  }

  private setStatus(s: TunnelStatus): void {
    this._status = s;
    this.statusListeners.forEach(cb => cb(s));
  }

  private log(level: TunnelLogEntry['level'], source: string, message: string): void {
    const entry: TunnelLogEntry = { ts: Date.now(), level, source, message };
    this.logListeners.forEach(cb => cb(entry));
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    fn(`[ArchonTunnel:${source}] ${message}`);
  }
}