/**
 * ═══════════════════════════════════════════════════════════════════════
 *  ARCHON NEXUS — Services Panel
 *  Controls ollama · camoufox · browse-proxy via launcher.js
 *
 *  PLACE AT: xdragon/app/ui/app/src/components/ServicesPanel.tsx
 *
 *  USAGE — add to Settings.tsx JSX at the very top of the sections:
 *    import ServicesPanel from "@/components/ServicesPanel";
 *    ...
 *    <ServicesPanel launcherUrl="http://localhost:3002" />
 * ═══════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ── Design tokens ──────────────────────────────────────────────────
const T = {
  gold:'#c9a84c', goldBorder:'#3a3020',
  black:'#080808', surface:'#0f0f0f', surface2:'#161616', surface3:'#202020',
  border:'#282420', text:'#f0ead8', textMuted:'#7a7060', textDim:'#3a3530',
  green:'#4a9a6a', red:'#c05040', teal:'#5ab0c8', sage:'#8aaa60',
};
const mono: React.CSSProperties = { fontFamily:'"Menlo","Monaco","Consolas","Courier New",monospace' };

// ── Types ──────────────────────────────────────────────────────────
type ServiceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

interface ServiceState {
  id:          string;
  label:       string;
  description: string;
  color:       string;
  status:      ServiceStatus;
  pid:         number | null;
  startedAt:   number | null;
  restarts:    number;
}

interface LogEntry {
  t:      number;
  line:   string;
  stream: 'out' | 'err' | 'sys';
}

interface ServicesPanelProps {
  launcherUrl?: string;
}

// ── Status display helpers ─────────────────────────────────────────
const STATUS_COLOR: Record<ServiceStatus, string> = {
  stopped:  T.textDim,
  starting: T.gold,
  running:  T.green,
  stopping: T.gold,
  error:    T.red,
};
const STATUS_DOT: Record<ServiceStatus, string> = {
  stopped:  '○',
  starting: '◌',
  running:  '●',
  stopping: '◌',
  error:    '✕',
};

function uptime(startedAt: number | null): string {
  if (!startedAt) return '—';
  const s = Math.floor((Date.now() - startedAt) / 1000);
  if (s < 60)  return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
}

// ══════════════════════════════════════════════════════════════════
//  COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function ServicesPanel({ launcherUrl = 'http://localhost:3002' }: ServicesPanelProps) {
  const [connected,   setConnected]   = useState(false);
  const [services,    setServices]    = useState<Record<string, ServiceState>>({});
  const [logs,        setLogs]        = useState<Record<string, LogEntry[]>>({});
  const [activeLog,   setActiveLog]   = useState<string | null>(null);
  const [loadingOp,   setLoadingOp]   = useState<Record<string, boolean>>({});
  const [_tick,        setTick]        = useState(0);  // uptime refresh
  const logRef    = useRef<HTMLDivElement>(null);
  const evtSource = useRef<EventSource | null>(null);

  // ── Connect SSE ─────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (evtSource.current) evtSource.current.close();

    const es = new EventSource(`${launcherUrl}/api/events`);
    evtSource.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        if (msg.type === 'init') {
          setConnected(true);
          // Build services from state + definitions
          const built: Record<string, ServiceState> = {};
          for (const [id, st] of Object.entries<any>(msg.state)) {
            built[id] = { id, ...msg.services[id], ...st };
          }
          setServices(built);
        }

        if (msg.type === 'status') {
          setServices(prev => ({
            ...prev,
            [msg.id]: { ...prev[msg.id], status: msg.status, pid: msg.pid ?? prev[msg.id]?.pid },
          }));
        }

        if (msg.type === 'log') {
          setLogs(prev => {
            const existing = prev[msg.id] ?? [];
            const updated  = [...existing, { t: msg.t, line: msg.line, stream: msg.stream }];
            return { ...prev, [msg.id]: updated.slice(-200) };
          });
        }
      } catch { /* ignore malformed */ }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Retry after 4s
      setTimeout(connectSSE, 4000);
    };
  }, [launcherUrl]);

  useEffect(() => {
    connectSSE();
    // Uptime tick
    const iv = setInterval(() => setTick(t => t + 1), 5000);
    return () => {
      evtSource.current?.close();
      clearInterval(iv);
    };
  }, [connectSSE]);

  // Auto-scroll log panel
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs, activeLog]);

  // ── API helpers ─────────────────────────────────────────────────
  const call = async (path: string, method = 'POST') => {
    const r = await fetch(`${launcherUrl}${path}`, { method });
    return r.json();
  };

  const op = async (serviceId: string, action: string) => {
    setLoadingOp(prev => ({ ...prev, [serviceId]: true }));
    try {
      await call(`/api/services/${serviceId}/${action}`);
    } finally {
      setTimeout(() => setLoadingOp(prev => ({ ...prev, [serviceId]: false })), 600);
    }
  };

  const startAll = async () => {
    setLoadingOp({ ollama: true, camoufox: true, browse_proxy: true });
    await call('/api/services/start-all');
    setTimeout(() => setLoadingOp({}), 1000);
  };

  const stopAll = async () => {
    setLoadingOp({ ollama: true, camoufox: true, browse_proxy: true });
    await call('/api/services/stop-all');
    setTimeout(() => setLoadingOp({}), 1000);
  };

  // ── Styles ───────────────────────────────────────────────────────
  const svc_ids = ['ollama', 'camoufox', 'browse_proxy'];

  const allRunning = svc_ids.every(id => services[id]?.status === 'running');
  const anyRunning = svc_ids.some(id =>
    ['running','starting'].includes(services[id]?.status ?? '')
  );

  return (
    <div style={{
      background: T.surface2,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 16,
    }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{
        display:'flex', alignItems:'center', gap:10,
        padding:'10px 16px',
        background: T.surface3,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <span style={{ color: T.gold, fontSize:'0.65rem' }}>◈</span>
        <span style={{ ...mono, fontSize:'0.68rem', fontWeight:700, color:T.gold,
          letterSpacing:'0.12em', textTransform:'uppercase' }}>
          Services
        </span>
        <span style={{ ...mono, fontSize:'0.58rem', color:T.textDim }}>
          xDragon runtime control
        </span>

        {/* Launcher connection indicator */}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ ...mono, fontSize:'0.56rem',
            color: connected ? T.green : T.red }}>
            {connected ? '● launcher connected' : '○ launcher offline'}
          </span>
          {!connected && (
            <span style={{ ...mono, fontSize:'0.52rem', color:T.textDim }}>
              (run node launcher.js)
            </span>
          )}
        </div>
      </div>

      {/* ── Launcher offline notice ──────────────────────────────── */}
      {!connected && (
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${T.border}` }}>
          <div style={{ ...mono, fontSize:'0.62rem', color:T.textMuted, lineHeight:1.7 }}>
            Start the launcher once — then control everything from here:
          </div>
          <div style={{
            marginTop:8, padding:'8px 12px', background:T.surface,
            border:`1px solid ${T.border}`, borderRadius:4,
            ...mono, fontSize:'0.62rem', color:T.sage,
          }}>
            cd C:\Users\DELL\Documents\GitHub\xdragon\app\ui\app<br />
            node launcher.js
          </div>
        </div>
      )}

      {/* ── Master controls ─────────────────────────────────────── */}
      {connected && (
        <div style={{
          display:'flex', alignItems:'center', gap:8, justifyContent:'space-between',
          padding:'8px 16px',
          borderBottom:`1px solid ${T.border}`,
        }}>
          <span style={{ ...mono, fontSize:'0.6rem', color:T.textMuted }}>
            {allRunning
              ? '● All systems operational'
              : anyRunning
              ? '◌ Partially running'
              : '○ All services stopped'}
          </span>
          <div style={{ display:'flex', gap:6 }}>
            <button
              onClick={startAll}
              style={{ ...mono, fontSize:'0.62rem', fontWeight:700,
                padding:'4px 14px', borderRadius:4, cursor:'pointer',
                background: allRunning ? T.surface3 : T.green,
                color: allRunning ? T.textDim : T.black,
                border: `1px solid ${allRunning ? T.border : T.green}`,
                opacity: allRunning ? 0.5 : 1,
              }}
            >
              ▶ Start All
            </button>
            <button
              onClick={stopAll}
              style={{ ...mono, fontSize:'0.62rem',
                padding:'4px 14px', borderRadius:4, cursor:'pointer',
                background:'transparent',
                color: anyRunning ? T.red : T.textDim,
                border: `1px solid ${anyRunning ? T.red+'60' : T.border}`,
                opacity: anyRunning ? 1 : 0.4,
              }}
            >
              ■ Stop All
            </button>
          </div>
        </div>
      )}

      {/* ── Service rows ─────────────────────────────────────────── */}
      {svc_ids.map((id, idx) => {
        const svc     = services[id];
        const loading = loadingOp[id];
        const isLast  = idx === svc_ids.length - 1;
        const logLines = logs[id] ?? [];

        if (!svc && !connected) return (
          <div key={id} style={{
            display:'flex', alignItems:'center', gap:10,
            padding:'10px 16px',
            borderBottom: isLast ? 'none' : `1px solid ${T.border}`,
            opacity:0.4,
          }}>
            <span style={{ ...mono, fontSize:'0.6rem', color:T.textDim }}>
              ○ {id.replace('_',' ')}
            </span>
          </div>
        );

        const status  = svc?.status ?? 'stopped';
        const running = status === 'running';
        const busy    = status === 'starting' || status === 'stopping' || loading;

        return (
          <div key={id} style={{ borderBottom: isLast ? 'none' : `1px solid ${T.border}` }}>
            {/* Row */}
            <div style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'9px 16px',
            }}>
              {/* Status dot */}
              <span style={{
                ...mono, fontSize:'0.8rem',
                color: STATUS_COLOR[status],
                animation: busy ? 'pulse 1s infinite' : 'none',
                flexShrink:0, width:14, textAlign:'center',
              }}>
                {STATUS_DOT[status]}
              </span>

              {/* Service info */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ ...mono, fontSize:'0.68rem', fontWeight:700,
                    color: svc?.color ?? T.textMuted }}>
                    {svc?.label ?? id}
                  </span>
                  <span style={{ ...mono, fontSize:'0.56rem',
                    color: STATUS_COLOR[status], letterSpacing:'0.08em' }}>
                    {status}
                    {running && svc?.startedAt
                      ? ` · up ${uptime(svc.startedAt)}`
                      : ''}
                    {svc?.pid ? ` · pid ${svc.pid}` : ''}
                  </span>
                </div>
                <div style={{ ...mono, fontSize:'0.57rem', color:T.textDim, marginTop:1 }}>
                  {svc?.description}
                </div>
              </div>

              {/* Log toggle */}
              {logLines.length > 0 && (
                <button
                  onClick={() => setActiveLog(activeLog === id ? null : id)}
                  style={{ ...mono, fontSize:'0.55rem', padding:'2px 7px', borderRadius:3,
                    background:'transparent', cursor:'pointer',
                    color: activeLog === id ? T.teal : T.textDim,
                    border:`1px solid ${activeLog === id ? T.teal : T.border}`,
                  }}
                >
                  {activeLog === id ? '▲ logs' : `▼ logs (${logLines.length})`}
                </button>
              )}

              {/* Controls */}
              {connected && (
                <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                  {!running && status !== 'starting' && (
                    <button
                      onClick={() => op(id, 'start')}
                      disabled={busy}
                      style={{ ...mono, fontSize:'0.6rem', fontWeight:700,
                        padding:'3px 11px', borderRadius:4, cursor: busy ? 'not-allowed' : 'pointer',
                        background: T.green, color:T.black,
                        border:`1px solid ${T.green}`,
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      ▶ Start
                    </button>
                  )}
                  {running && (
                    <>
                      <button
                        onClick={() => op(id, 'restart')}
                        disabled={busy}
                        style={{ ...mono, fontSize:'0.6rem',
                          padding:'3px 9px', borderRadius:4, cursor: busy ? 'not-allowed' : 'pointer',
                          background:'transparent', color:T.gold,
                          border:`1px solid ${T.gold}60`,
                          opacity: busy ? 0.5 : 1,
                        }}
                      >
                        ↺
                      </button>
                      <button
                        onClick={() => op(id, 'stop')}
                        disabled={busy}
                        style={{ ...mono, fontSize:'0.6rem',
                          padding:'3px 9px', borderRadius:4, cursor: busy ? 'not-allowed' : 'pointer',
                          background:'transparent', color:T.red,
                          border:`1px solid ${T.red}60`,
                          opacity: busy ? 0.5 : 1,
                        }}
                      >
                        ■ Stop
                      </button>
                    </>
                  )}
                  {(status === 'starting' || status === 'stopping') && (
                    <span style={{ ...mono, fontSize:'0.58rem', color:T.gold, padding:'3px 0' }}>
                      {status === 'starting' ? '◌ starting…' : '◌ stopping…'}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Log panel */}
            {activeLog === id && (
              <div
                ref={logRef}
                style={{
                  maxHeight:160, overflowY:'auto',
                  background:T.surface,
                  borderTop:`1px solid ${T.border}`,
                  padding:'6px 10px',
                }}
              >
                {logLines.length === 0 ? (
                  <div style={{ ...mono, fontSize:'0.58rem', color:T.textDim }}>No logs yet.</div>
                ) : logLines.slice(-100).map((entry, i) => (
                  <div key={i} style={{
                    ...mono, fontSize:'0.58rem', lineHeight:1.7,
                    color: entry.stream === 'err' ? T.red
                         : entry.stream === 'sys' ? T.gold
                         : T.textMuted,
                    whiteSpace:'pre-wrap', wordBreak:'break-all',
                  }}>
                    <span style={{ color:T.textDim, marginRight:8 }}>
                      {new Date(entry.t).toLocaleTimeString()}
                    </span>
                    {entry.line}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Startup tip ─────────────────────────────────────────── */}
      <div style={{
        padding:'7px 16px',
        borderTop:`1px solid ${T.border}`,
        background: T.surface3,
      }}>
        <div style={{ ...mono, fontSize:'0.54rem', color:T.textDim, lineHeight:1.6 }}>
          <span style={{ color:T.gold }}>◈ Auto-start tip:</span> Add{' '}
          <code style={{ color:T.sage }}>node launcher.js</code> to Windows Task Scheduler
          or <code style={{ color:T.sage }}>shell:startup</code> to launch automatically on login.
        </div>
      </div>
    </div>
  );
}
