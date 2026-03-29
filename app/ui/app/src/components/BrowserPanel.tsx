/**
 * ═══════════════════════════════════════════════════════════════════════
 *  ARCHON NEXUS — xDragon Agent Browser Panel
 *  Camoufox v135 stealth Firefox · camofox-browser REST API (:9377)
 *
 *  SETUP (daemon machine — one time):
 *    npm install @askjo/camoufox-browser
 *    npx camoufox-browser
 *
 *  DAEMON PROXY ENDPOINTS (add to xDragon Go/Node daemon):
 *    POST   /api/browse/new        { agent }            -> { sessionId }
 *    POST   /api/browse/navigate   { sessionId, url }   -> { url, title, snapshot, screenshot }
 *    POST   /api/browse/action     { sessionId, type, ref?, text? }
 *    GET    /api/browse/snapshot?sessionId=
 *    GET    /api/browse/sessions
 *    DELETE /api/browse/session    { sessionId }
 *
 *  Agent signal from chat stream:
 *    ARCHON_BROWSE::{"url":"...","agent":"KOFI","action":"navigate"}
 * =======================================================================
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";

// Design tokens
const T = {
  gold:       "#c9a84c",
  goldDim:    "#6b5820",
  goldBorder: "#3a3020",
  black:      "#080808",
  surface:    "#0f0f0f",
  surface2:   "#161616",
  surface3:   "#202020",
  border:     "#282420",
  text:       "#f0ead8",
  textMuted:  "#7a7060",
  textDim:    "#3a3530",
  green:      "#4a9a6a",
  red:        "#c05040",
  teal:       "#5ab0c8",
  blue:       "#4a8aba",
  purple:     "#9a7ab0",
  orange:     "#d4805a",
  sage:       "#8aaa60",
} as const;

const mono: React.CSSProperties = {
  fontFamily: '"Menlo","Monaco","Consolas","Courier New",monospace',
};

// Agent roster (super7.js source of truth)
const AGENTS: Record<string, { color: string; title: string }> = {
  ARCHON:   { color: T.gold,    title: "Supreme Orchestrator"       },
  MODEBOLA: { color: T.purple,  title: "Chief of Staff"             },
  AYO:      { color: T.gold,    title: "CTO & Head of Engineering"  },
  KOFI:     { color: T.blue,    title: "Chief Economist & CFO"      },
  MEI:      { color: T.teal,    title: "Chief Business Intelligence"},
  ARIA:     { color: "#b04a9a", title: "Chief Creative Officer"     },
  KENDRA:   { color: T.orange,  title: "Chief Growth Officer"       },
  TUNDE:    { color: T.sage,    title: "Chief Legal Counsel & PRO"  },
};

// Types
type SessionStatus = "idle" | "loading" | "ready" | "error";
type ServerStatus  = "unknown" | "online" | "offline";
type PanelTab      = "view" | "tree" | "history" | "sessions";
type SearchEngine  = "google" | "bing" | "duckduckgo";

interface AXNode {
  role:      string;
  name?:     string;
  ref?:      string;
  children?: AXNode[];
}

interface NavEntry { url: string; title: string; ts: number; }

interface BrowserSession {
  id:          string;
  agent:       string;
  url:         string;
  title:       string;
  status:      SessionStatus;
  startedAt:   number;
  snapshot?:   AXNode;
  screenshot?: string;
  history:     NavEntry[];
}

export interface BrowserPanelProps {
  daemonUrl?:         string;
  defaultAgent?:      string;
  onExtract?:         (text: string, url: string, agent: string) => void;
  embedded?:          boolean;
  initialUrl?:        string;
  externalSessionId?: string;
}

// Helpers
function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^localhost|^127\.|^\d+\.\d+/.test(s)) return `http://${s}`;
  return `https://${s}`;
}

function timeSince(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function searchUrl(q: string, engine: SearchEngine): string {
  const e = encodeURIComponent(q);
  if (engine === "bing")       return `https://www.bing.com/search?q=${e}`;
  if (engine === "duckduckgo") return `https://duckduckgo.com/?q=${e}`;
  return `https://www.google.com/search?q=${e}`;
}

function btnStyle(accent: string, extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${accent}50`,
    color: accent,
    borderRadius: 4,
    padding: "3px 8px",
    fontSize: "0.63rem",
    cursor: "pointer",
    flexShrink: 0,
    lineHeight: 1.5,
    ...mono,
    ...extra,
  };
}

const navBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${T.border}`,
  color: T.textMuted,
  borderRadius: 4,
  padding: "3px 7px",
  fontSize: "0.65rem",
  cursor: "pointer",
  flexShrink: 0,
};

// AX Tree node component
function TreeNode({
  node, depth, onSelect,
}: {
  node: AXNode;
  depth: number;
  onSelect: (ref: string, name: string) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(depth < 2);
  const hasKids = (node.children?.length ?? 0) > 0;
  const interactive = ["button","link","textbox","combobox","checkbox","radio","menuitem"].includes(node.role);

  return (
    <div style={{ paddingLeft: depth * 10 }}>
      <div
        onClick={() => hasKids && setOpen(o => !o)}
        style={{ display:"flex", alignItems:"center", gap:4, padding:"1px 4px", borderRadius:3,
          cursor: hasKids ? "pointer" : "default", fontSize:"0.65rem", ...mono }}
      >
        <span style={{ color: T.goldDim, width:10, flexShrink:0 }}>
          {hasKids ? (open ? "\u25be" : "\u25b8") : " "}
        </span>
        <span style={{ color: interactive ? T.teal : T.textMuted }}>{node.role}</span>
        {node.name && (
          <span style={{ color: depth === 0 ? T.text : T.textMuted, maxWidth:240,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {" "}{node.name}
          </span>
        )}
        {node.ref && (
          <button
            onClick={e => { e.stopPropagation(); onSelect(node.ref!, node.name ?? node.role); }}
            style={{ marginLeft:"auto", ...btnStyle(T.teal, { padding:"1px 5px", fontSize:"0.58rem" }) }}
          >{node.ref}</button>
        )}
      </div>
      {open && hasKids && node.children!.map((c, i) => (
        <TreeNode key={i} node={c} depth={depth + 1} onSelect={onSelect} />
      ))}
    </div>
  );
}

// Status dots
function ServerDot({ status }: { status: ServerStatus }): React.ReactElement {
  const color = status === "online" ? T.green : status === "offline" ? T.red : T.textDim;
  const label = status === "online" ? "Camoufox online" : status === "offline" ? "Camoufox offline" : "Checking...";
  return (
    <span title={label} style={{
      display:"inline-block", width:6, height:6, borderRadius:"50%", background:color, flexShrink:0,
      boxShadow: status === "online" ? `0 0 6px ${T.green}` : "none",
    }}/>
  );
}

function SessionDot({ status }: { status: SessionStatus }): React.ReactElement {
  const map = { idle:{c:T.textDim,g:false}, loading:{c:T.gold,g:true}, ready:{c:T.green,g:true}, error:{c:T.red,g:false} };
  const {c,g} = map[status];
  return <span style={{ display:"inline-block", width:5, height:5, borderRadius:"50%", background:c, boxShadow:g?`0 0 5px ${c}`:"none", flexShrink:0 }}/>;
}

// Empty state
function EmptyState({ onNew, serverStatus }: { onNew:()=>void; serverStatus:ServerStatus }): React.ReactElement {
  return (
    <div style={{ padding:"32px 24px", textAlign:"center", color:T.textMuted, flex:1 }}>
      <div style={{ fontSize:"2.2rem", marginBottom:12 }}>\uD83C\uDF10</div>
      <div style={{ fontSize:"0.8rem", color:T.gold, marginBottom:6, letterSpacing:"0.1em" }}>STEALTH BROWSER</div>
      <div style={{ fontSize:"0.62rem", color:T.textMuted, lineHeight:1.9, marginBottom:16 }}>
        Camoufox v135 — Firefox fork with C++ fingerprint spoofing<br/>
        Canvas \u00b7 WebGL \u00b7 Audio \u00b7 Navigator — all masked at engine level<br/>
        Defeats Cloudflare, DataDome, PerimeterX
      </div>
      {serverStatus === "offline" ? (
        <div>
          <div style={{ color:T.red, fontSize:"0.65rem", marginBottom:10 }}>\u274c Camoufox server not running</div>
          <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6,
            padding:"10px 14px", textAlign:"left", display:"inline-block" }}>
            <div style={{ color:T.textDim, fontSize:"0.58rem", marginBottom:6, letterSpacing:"0.1em" }}>
              START SERVER
            </div>
            <code style={{ color:T.gold, fontSize:"0.65rem", ...mono, display:"block", marginBottom:4 }}>
              npm i @askjo/camoufox-browser
            </code>
            <code style={{ color:T.sage, fontSize:"0.65rem", ...mono, display:"block" }}>
              npx camoufox-browser
            </code>
          </div>
        </div>
      ) : (
        <button onClick={onNew} style={btnStyle(T.gold, { padding:"6px 18px", fontSize:"0.72rem" })}>
          + Open Stealth Session
        </button>
      )}
      <div style={{ marginTop:20, fontSize:"0.58rem", color:T.textDim, lineHeight:2 }}>
        Browse access: ALL agents \u00b7 Primary: KOFI \u00b7 MEI \u00b7 TUNDE
      </div>
    </div>
  );
}

// Main export
export default function BrowserPanel({
  daemonUrl    = "http://localhost:11434",
  defaultAgent = "KOFI",
  onExtract,
  embedded     = false,
  initialUrl   = "",
  externalSessionId,
}: BrowserPanelProps): React.ReactElement {

  const [sessions,     setSessions]     = useState<BrowserSession[]>([]);
  const [activeId,     setActiveId]     = useState<string | null>(null);
  const [tab,          setTab]          = useState<PanelTab>("view");
  const [urlBar,       setUrlBar]       = useState(initialUrl);
  const [urlFocused,   setUrlFocused]   = useState(false);
  const [searchQ,      setSearchQ]      = useState("");
  const [searchEngine, setSearchEngine] = useState<SearchEngine>("google");
  const [typeText,     setTypeText]     = useState("");
  const [selectedRef,  setSelectedRef]  = useState("");
  const [agentChoice,  setAgentChoice]  = useState(defaultAgent);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("unknown");
  const [loading,      setLoading]      = useState(false);
  const [collapsed,    setCollapsed]    = useState(false);
  const [logLines,     setLogLines]     = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const active = useMemo(
    () => sessions.find(s => s.id === activeId) ?? null,
    [sessions, activeId],
  );

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLogLines(prev => [...prev.slice(-100), `${ts}  ${msg}`]);
    setTimeout(() => logRef.current?.scrollTo({ top: 9999, behavior: "smooth" }), 40);
  }, []);

  const patchSession = useCallback((id: string, patch: Partial<BrowserSession>) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  // Ping Camoufox server via daemon proxy
  const pingServer = useCallback(async () => {
    try {
      const r = await fetch(`${daemonUrl}/api/browse/sessions`);
      if (r.ok) {
        setServerStatus("online");
        const data = await r.json().catch(() => ({}));
        if (Array.isArray(data.sessions)) {
          setSessions(prev => {
            const existing = new Set(prev.map(s => s.id));
            const incoming = (data.sessions as BrowserSession[]).filter(s => !existing.has(s.id));
            return [...prev, ...incoming];
          });
        }
      } else { setServerStatus("offline"); }
    } catch { setServerStatus("offline"); }
  }, [daemonUrl]);

  useEffect(() => {
    pingServer();
    const iv = setInterval(pingServer, 20_000);
    return () => clearInterval(iv);
  }, [pingServer]);

  // Attach session created by agent signal
  useEffect(() => {
    if (!externalSessionId) return;
    if (sessions.some(s => s.id === externalSessionId)) { setActiveId(externalSessionId); return; }
    (async () => {
      try {
        const r = await fetch(`${daemonUrl}/api/browse/snapshot?sessionId=${externalSessionId}`);
        if (!r.ok) return;
        const d = await r.json();
        const s: BrowserSession = {
          id: externalSessionId, agent: d.agent ?? "ARCHON",
          url: d.url ?? "", title: d.title ?? "Agent Session",
          status: "ready", startedAt: Date.now(),
          snapshot: d.snapshot, screenshot: d.screenshot, history: [],
        };
        setSessions(prev => [s, ...prev]);
        setActiveId(externalSessionId);
        addLog(`Agent session attached: ${externalSessionId.slice(0, 8)}`);
      } catch (e) { addLog(`Failed to attach session: ${e}`); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSessionId]);

  const createSession = useCallback(async (agent = agentChoice): Promise<string | null> => {
    if (serverStatus !== "online") { addLog("Camoufox offline — run: npx camoufox-browser"); return null; }
    try {
      setLoading(true);
      addLog(`Creating session for ${agent}...`);
      const r = await fetch(`${daemonUrl}/api/browse/new`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent }),
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      const s: BrowserSession = {
        id: d.sessionId, agent, url: "", title: "New Session",
        status: "idle", startedAt: Date.now(), history: [],
      };
      setSessions(prev => [s, ...prev]);
      setActiveId(d.sessionId);
      addLog(`Session ${(d.sessionId as string).slice(0, 8)} ready`);
      return d.sessionId as string;
    } catch (e) { addLog(`Session creation failed: ${e}`); return null; }
    finally { setLoading(false); }
  }, [daemonUrl, agentChoice, serverStatus, addLog]);

  const navigate = useCallback(async (rawUrl: string, sid?: string) => {
    const url = normalizeUrl(rawUrl);
    if (!url) return;
    const sessionId = sid ?? activeId ?? await createSession();
    if (!sessionId) return;
    patchSession(sessionId, { status: "loading", url });
    setLoading(true);
    addLog(`Navigate -> ${url}`);
    try {
      const r = await fetch(`${daemonUrl}/api/browse/navigate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, url }),
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      patchSession(sessionId, {
        status: "ready", url: d.url ?? url, title: d.title ?? url,
        snapshot: d.snapshot, screenshot: d.screenshot,
        history: [
          { url: d.url ?? url, title: d.title ?? url, ts: Date.now() },
          ...(sessions.find(s => s.id === sessionId)?.history ?? []).slice(0, 49),
        ],
      });
      setUrlBar(d.url ?? url);
      addLog(`Loaded: ${d.title ?? url}`);
      setTab("view");
    } catch (e) { patchSession(sessionId, { status: "error" }); addLog(`Navigation failed: ${e}`); }
    finally { setLoading(false); }
  }, [activeId, daemonUrl, sessions, createSession, patchSession, addLog]);

  const doAction = useCallback(async (type: string, ref?: string, text?: string) => {
    if (!activeId) return;
    setLoading(true);
    addLog(`${type}${ref ? ` [${ref}]` : ""}${text ? ` "${text.slice(0,30)}"` : ""}`);
    try {
      const r = await fetch(`${daemonUrl}/api/browse/action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeId, type, ref, text }),
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      patchSession(activeId, { snapshot: d.snapshot, screenshot: d.screenshot,
        url: d.url ?? active?.url, title: d.title ?? active?.title });
      if (type === "extract" && d.text) {
        onExtract?.(d.text, active?.url ?? "", active?.agent ?? "");
        addLog(`Extracted ${d.text.length} chars -> agent`);
      } else { addLog(`${type} done`); }
    } catch (e) { addLog(`${type} failed: ${e}`); }
    finally { setLoading(false); }
  }, [activeId, daemonUrl, active, onExtract, patchSession, addLog]);

  const refreshSnap = useCallback(async () => {
    if (!activeId) return;
    setLoading(true);
    try {
      const r = await fetch(`${daemonUrl}/api/browse/snapshot?sessionId=${activeId}`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      patchSession(activeId, { snapshot: d.snapshot, screenshot: d.screenshot,
        url: d.url ?? active?.url, title: d.title ?? active?.title });
      addLog("Snapshot refreshed");
    } catch (e) { addLog(`Snapshot failed: ${e}`); }
    finally { setLoading(false); }
  }, [activeId, daemonUrl, active, patchSession, addLog]);

  const closeSession = useCallback(async (id: string) => {
    try {
      await fetch(`${daemonUrl}/api/browse/session`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      });
    } catch (_e) { /* ignore */ }
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
    addLog(`Session ${id.slice(0, 8)} closed`);
  }, [activeId, daemonUrl, addLog]);

  if (collapsed) {
    return (
      <div onClick={() => setCollapsed(false)} style={{
        display:"flex", alignItems:"center", gap:8, background:T.surface,
        border:`1px solid ${T.goldBorder}`, borderRadius:6, padding:"5px 12px",
        cursor:"pointer", width: embedded ? "100%" : 640,
      }}>
        <span style={{ color:T.gold, fontSize:"0.75rem" }}>\u25c8</span>
        <span style={{ ...mono, color:T.textMuted, fontSize:"0.65rem" }}>STEALTH BROWSER</span>
        <ServerDot status={serverStatus}/>
        <span style={{ ...mono, color:T.textDim, fontSize:"0.6rem" }}>
          {sessions.length} session{sessions.length!==1?"s":""}
          {active ? ` \u00b7 ${active.url.slice(0,40)}` : ""}
        </span>
        <span style={{ marginLeft:"auto", color:T.goldDim, fontSize:"0.6rem" }}>\u25b8</span>
      </div>
    );
  }

  return (
    <div style={{ width: embedded ? "100%" : 700, display:"flex", flexDirection:"column",
      background:T.surface, border:`1px solid ${T.goldBorder}`, borderRadius:8, overflow:"hidden", ...mono }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px",
        background:T.surface2, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <span style={{ color:T.gold, fontSize:"0.7rem", letterSpacing:"0.15em" }}>\u25c8</span>
        <span style={{ color:T.gold, fontSize:"0.65rem", letterSpacing:"0.14em", textTransform:"uppercase" }}>Stealth Browser</span>
        <ServerDot status={serverStatus}/>
        <span style={{ color:T.textDim, fontSize:"0.58rem" }}>Camoufox v135 \u00b7 C++ masking</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:6, alignItems:"center" }}>
          <select value={agentChoice} onChange={e => setAgentChoice(e.target.value)}
            style={{ background:T.surface3, border:`1px solid ${T.border}`,
              color: AGENTS[agentChoice]?.color ?? T.text, borderRadius:4, padding:"2px 6px", fontSize:"0.62rem", cursor:"pointer", ...mono }}>
            {Object.entries(AGENTS).map(([id]) => <option key={id} value={id}>{id}</option>)}
          </select>
          <button onClick={() => createSession()} disabled={loading || serverStatus!=="online"} style={btnStyle(T.green)}>+ Session</button>
          <button onClick={() => setCollapsed(true)} style={btnStyle(T.textDim)}>\u25be</button>
        </div>
      </div>

      {/* Session tabs */}
      {sessions.length > 0 && (
        <div style={{ display:"flex", background:T.black, borderBottom:`1px solid ${T.border}`, overflowX:"auto", flexShrink:0 }}>
          {sessions.map(s => {
            const ag = AGENTS[s.agent]; const act = s.id === activeId;
            return (
              <div key={s.id} onClick={() => { setActiveId(s.id); setUrlBar(s.url); }}
                style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px",
                  borderRight:`1px solid ${T.border}`,
                  borderBottom: act ? `2px solid ${ag?.color ?? T.gold}` : "2px solid transparent",
                  background: act ? T.surface : "transparent", cursor:"pointer", minWidth:0, maxWidth:180, flexShrink:0 }}>
                <span style={{ color: ag?.color ?? T.gold, fontSize:"0.6rem" }}>\u25c8</span>
                <span style={{ color: ag?.color ?? T.textMuted, fontSize:"0.58rem" }}>{s.agent}</span>
                <span style={{ color:T.textMuted, fontSize:"0.56rem", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:80 }}>{s.title || "idle"}</span>
                <SessionDot status={s.status}/>
                <button onClick={e => { e.stopPropagation(); closeSession(s.id); }}
                  style={{ background:"transparent", border:"none", color:T.textDim, cursor:"pointer", fontSize:"0.65rem", lineHeight:1, padding:"0 2px" }}>\u00d7</button>
              </div>
            );
          })}
        </div>
      )}

      {/* URL bar */}
      <div style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 8px",
        background:T.surface2, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <button onClick={() => doAction("back")}    disabled={!active} style={navBtn}>\u25c0</button>
        <button onClick={() => doAction("forward")} disabled={!active} style={navBtn}>\u25b6</button>
        <button onClick={() => doAction("reload")}  disabled={!active} style={navBtn}>\u21bb</button>
        <div style={{ flex:1, display:"flex", alignItems:"center", background:T.black,
          border:`1px solid ${urlFocused ? T.gold : T.border}`, borderRadius:4, padding:"0 8px", gap:5 }}>
          <span style={{ color: active?.status==="loading" ? T.gold : T.textDim, fontSize:"0.6rem" }}>
            {active?.status==="loading" ? "\u27F3" : "\uD83C\uDF10"}
          </span>
          <input
            value={urlFocused ? urlBar : (active?.url || urlBar || "")}
            onChange={e => setUrlBar(e.target.value)}
            onFocus={() => { setUrlFocused(true); setUrlBar(active?.url ?? ""); }}
            onBlur={() => setUrlFocused(false)}
            onKeyDown={e => {
              if (e.key==="Enter") navigate(urlBar);
              if (e.key==="Escape") { setUrlBar(active?.url ?? ""); setUrlFocused(false); }
            }}
            placeholder="URL or search..."
            style={{ flex:1, background:"transparent", border:"none", outline:"none",
              color:T.text, fontSize:"0.68rem", padding:"5px 0", ...mono }}
          />
        </div>
        <button onClick={() => navigate(urlBar)} disabled={loading || !urlBar.trim()} style={btnStyle(T.gold)}>\u2192</button>
        <button onClick={refreshSnap} disabled={!active || loading} style={btnStyle(T.teal)} title="Refresh accessibility snapshot">\u2299 snap</button>
      </div>

      {/* Panel tabs */}
      <div style={{ display:"flex", background:T.black, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        {([["view","View"],["tree","AX Tree"],["history","History"],["sessions",`Sessions (${sessions.length})`]] as [PanelTab,string][]).map(([t,label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background:"transparent", border:"none",
            borderBottom:`2px solid ${tab===t ? T.gold : "transparent"}`,
            color: tab===t ? T.gold : T.textMuted,
            padding:"5px 12px", fontSize:"0.62rem", letterSpacing:"0.08em", cursor:"pointer", ...mono,
          }}>{label}</button>
        ))}
        {loading && <span style={{ marginLeft:"auto", padding:"5px 10px", color:T.gold, fontSize:"0.6rem" }}>loading...</span>}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", minHeight:340 }}>

        {tab==="view" && (
          <div style={{ flex:1, overflowY:"auto", background:T.black, display:"flex", flexDirection:"column" }}>
            {!active && <EmptyState onNew={() => createSession()} serverStatus={serverStatus}/>}
            {active?.status==="loading" && (
              <div style={{ padding:24, textAlign:"center", color:T.gold, fontSize:"0.72rem" }}>
                <div style={{ fontSize:"1.6rem", marginBottom:8 }}>\u27F3</div>{active.url}
              </div>
            )}
            {active?.screenshot && (
              <img src={`data:image/png;base64,${active.screenshot}`} alt="page" style={{ width:"100%", display:"block" }}/>
            )}
            {active && !active.screenshot && active.status==="ready" && (
              <div style={{ padding:20, textAlign:"center", color:T.textMuted, fontSize:"0.65rem" }}>
                No screenshot — click \u2299 snap or verify daemon /api/browse/snapshot
              </div>
            )}
            {active?.status==="error" && (
              <div style={{ padding:20, textAlign:"center", color:T.red, fontSize:"0.65rem" }}>
                Navigation failed — check daemon logs
              </div>
            )}
            {active && (
              <div style={{ padding:"7px 10px", background:T.surface2, borderTop:`1px solid ${T.border}`,
                display:"flex", gap:6, alignItems:"center", flexShrink:0, marginTop:"auto" }}>
                {selectedRef && (
                  <span style={{ ...mono, fontSize:"0.6rem", color:T.teal,
                    border:`1px solid ${T.border}`, borderRadius:3, padding:"1px 5px", flexShrink:0 }}>
                    [{selectedRef}]
                  </span>
                )}
                <input value={typeText} onChange={e => setTypeText(e.target.value)}
                  onKeyDown={e => e.key==="Enter" && doAction("type", selectedRef||undefined, typeText)}
                  placeholder={selectedRef ? `Type into [${selectedRef}]...` : "Select from AX Tree, then type"}
                  style={{ flex:1, background:T.black, border:`1px solid ${T.border}`,
                    borderRadius:4, color:T.text, fontSize:"0.65rem", padding:"4px 8px", outline:"none", ...mono }}/>
                <button onClick={() => doAction("click", selectedRef||undefined)} disabled={!selectedRef||loading} style={btnStyle(T.teal)}>click</button>
                <button onClick={() => doAction("type", selectedRef||undefined, typeText)} disabled={!typeText||loading} style={btnStyle(T.blue)}>type</button>
                <button onClick={() => doAction("extract")} disabled={!active||loading} style={btnStyle(T.gold)} title="Extract page text -> agent">
                  \u2b06 extract
                </button>
              </div>
            )}
          </div>
        )}

        {tab==="tree" && (
          <div style={{ flex:1, overflowY:"auto", background:T.black, padding:8 }}>
            {!active?.snapshot
              ? <div style={{ color:T.textMuted, fontSize:"0.65rem", padding:12 }}>No snapshot. Navigate then click \u2299 snap.</div>
              : <TreeNode node={active.snapshot} depth={0} onSelect={(ref,name) => { setSelectedRef(ref); addLog(`Selected [${ref}]: ${name}`); setTab("view"); }}/>
            }
          </div>
        )}

        {tab==="history" && (
          <div style={{ flex:1, overflowY:"auto", background:T.black }}>
            {(!active || active.history.length===0)
              ? <div style={{ color:T.textMuted, fontSize:"0.65rem", padding:12 }}>No history.</div>
              : active.history.map((h, i) => (
                <div key={i} onClick={() => navigate(h.url)}
                  onMouseEnter={e => (e.currentTarget.style.background=T.surface2)}
                  onMouseLeave={e => (e.currentTarget.style.background="transparent")}
                  style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px",
                    borderBottom:`1px solid ${T.border}`, cursor:"pointer" }}>
                  <span style={{ color:T.textDim, fontSize:"0.56rem", width:18, textAlign:"right", flexShrink:0 }}>{i+1}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:"0.65rem", color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.title}</div>
                    <div style={{ fontSize:"0.57rem", color:T.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.url}</div>
                  </div>
                  <span style={{ color:T.textDim, fontSize:"0.56rem", flexShrink:0 }}>{timeSince(h.ts)}</span>
                </div>
              ))
            }
          </div>
        )}

        {tab==="sessions" && (
          <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"7px 10px", borderBottom:`1px solid ${T.border}`,
              background:T.surface2, display:"flex", gap:6 }}>
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                onKeyDown={e => e.key==="Enter" && searchQ.trim() && navigate(searchUrl(searchQ, searchEngine))}
                placeholder="Quick web search..."
                style={{ flex:1, background:T.black, border:`1px solid ${T.border}`,
                  borderRadius:4, color:T.text, fontSize:"0.65rem", padding:"4px 8px", outline:"none", ...mono }}/>
              <select value={searchEngine} onChange={e => setSearchEngine(e.target.value as SearchEngine)}
                style={{ background:T.surface3, border:`1px solid ${T.border}`,
                  color:T.text, borderRadius:4, padding:"3px 6px", fontSize:"0.62rem", cursor:"pointer" }}>
                <option value="google">Google</option>
                <option value="bing">Bing</option>
                <option value="duckduckgo">DDG</option>
              </select>
              <button onClick={() => searchQ.trim() && navigate(searchUrl(searchQ, searchEngine))}
                disabled={!searchQ.trim()||loading} style={btnStyle(T.gold)}>\uD83D\uDD0D</button>
            </div>
            <div style={{ flex:1, overflowY:"auto", background:T.black }}>
              {sessions.length===0
                ? <div style={{ color:T.textMuted, fontSize:"0.65rem", padding:16 }}>No sessions. Click + Session.</div>
                : sessions.map(s => {
                  const ag = AGENTS[s.agent]; const act = s.id===activeId;
                  return (
                    <div key={s.id}
                      onClick={() => { setActiveId(s.id); setUrlBar(s.url); setTab("view"); }}
                      onMouseEnter={e => !act && (e.currentTarget.style.background=T.surface2)}
                      onMouseLeave={e => !act && (e.currentTarget.style.background="transparent")}
                      style={{ padding:"8px 10px", borderBottom:`1px solid ${T.border}`,
                        borderLeft: act ? `3px solid ${ag?.color ?? T.gold}` : "3px solid transparent",
                        background: act ? T.surface2 : "transparent", cursor:"pointer" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ color: ag?.color ?? T.gold, fontSize:"0.62rem" }}>\u25c8</span>
                        <span style={{ color: ag?.color ?? T.text, fontSize:"0.62rem", fontWeight:600 }}>{s.agent}</span>
                        <span style={{ color:T.textMuted, fontSize:"0.58rem" }}>{s.id.slice(0,10)}</span>
                        <SessionDot status={s.status}/>
                        <span style={{ marginLeft:"auto", color:T.textDim, fontSize:"0.56rem" }}>{timeSince(s.startedAt)}</span>
                        <button onClick={e => { e.stopPropagation(); closeSession(s.id); }}
                          style={{ background:"transparent", border:"none", color:T.red, cursor:"pointer", fontSize:"0.65rem" }}>\u00d7</button>
                      </div>
                      <div style={{ marginLeft:20, fontSize:"0.59rem", color:T.textMuted, marginTop:2,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {s.url || "idle"}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>
        )}
      </div>

      {/* Action log */}
      <div ref={logRef} style={{ height:72, overflowY:"auto", background:"#040404",
        borderTop:`1px solid ${T.border}`, padding:"4px 10px", flexShrink:0 }}>
        {logLines.length===0
          ? <span style={{ color:T.textDim, fontSize:"0.58rem" }}>\u25c8 Action log</span>
          : logLines.map((l, i) => (
            <div key={i} style={{ fontSize:"0.6rem", ...mono, lineHeight:1.65,
              color: l.includes("failed")||l.includes("offline") ? T.red
                   : l.includes("Loaded")||l.includes("ready")||l.includes("done")||l.includes("Extracted") ? T.green
                   : l.includes("Navigate")||l.includes("Snapshot") ? T.teal
                   : T.textMuted }}>
              {l}
            </div>
          ))
        }
      </div>
    </div>
  );
}
