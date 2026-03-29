/**
 * ═══════════════════════════════════════════════════════════════════
 *  PENPOT INTEGRATION — Agent Design API
 *  ARIA Okonkwo-Santos · Chief Creative Officer
 *
 *  Penpot is the self-hosted open-source Figma alternative.
 *  Run locally: docker run -p 3449:3449 penpotapp/frontend
 *  Or use: https://design.penpot.app (free cloud)
 *
 *  This module:
 *  1. Penpot client (REST API wrapper)
 *  2. PenpotPanel React component — embedded iframe + toolbar
 *  3. Agent design helpers (ARIA creates pages, exports assets)
 *
 *  PLACE AT: xdragon/app/ui/app/src/components/PenpotPanel.tsx
 *
 *  Penpot API docs: https://help.penpot.app/technical-guide/developer/api/
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── Design tokens ──────────────────────────────────────────────────
const T = {
  gold: '#c9a84c', goldDim: '#6b5820', goldBorder: '#3a3020',
  black: '#080808', surface: '#0f0f0f', surface2: '#161616', surface3: '#202020',
  border: '#282420', text: '#f0ead8', textMuted: '#7a7060', textDim: '#3a3530',
  green: '#4a9a6a', red: '#c05040', teal: '#5ab0c8', blue: '#4a8aba',
  purple: '#9a7ab0', orange: '#d4805a', sage: '#8aaa60',
};
const mono: React.CSSProperties = { fontFamily: '"Menlo","Monaco","Consolas","Courier New",monospace' };
const ARIA = '#b04a9a';

// ── Config ────────────────────────────────────────────────────────
const PENPOT_CONFIG_KEY = 'archon_penpot_config';

interface PenpotConfig {
  baseUrl:  string;     // e.g. http://localhost:3449 or https://design.penpot.app
  token:    string;     // Penpot Personal Access Token
  teamId?:  string;
}

function getPenpotConfig(): PenpotConfig {
  try {
    const raw = localStorage.getItem(PENPOT_CONFIG_KEY);
    return raw ? JSON.parse(raw) : { baseUrl: 'http://localhost:3449', token: '' };
  } catch { return { baseUrl: 'http://localhost:3449', token: '' }; }
}

function savePenpotConfig(cfg: PenpotConfig): void {
  localStorage.setItem(PENPOT_CONFIG_KEY, JSON.stringify(cfg));
}

// ── Penpot REST API client ─────────────────────────────────────────

interface PenpotProject { id: string; name: string; teamId: string; }
interface PenpotFile    { id: string; name: string; projectId: string; modifiedAt: string; }
interface PenpotPage    { id: string; name: string; }

export const PenpotClient = {

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const cfg = getPenpotConfig();
    if (!cfg.token) throw new Error('Penpot token not configured');
    const res = await fetch(`${cfg.baseUrl}/api/rpc/command/${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${cfg.token}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Penpot API ${res.status}: ${err}`);
    }
    return res.json() as Promise<T>;
  },

  async getTeams(): Promise<{ id: string; name: string }[]> {
    return this.request('get-profile-teams');
  },

  async getProjects(teamId: string): Promise<PenpotProject[]> {
    return this.request(`get-projects?team-id=${teamId}`);
  },

  async getFiles(projectId: string): Promise<PenpotFile[]> {
    return this.request(`get-project-files?project-id=${projectId}`);
  },

  async createFile(projectId: string, name: string): Promise<PenpotFile> {
    return this.request('create-file', {
      method: 'POST',
      body: JSON.stringify({ 'project-id': projectId, name }),
    });
  },

  async getPages(fileId: string): Promise<PenpotPage[]> {
    const data = await this.request<{ pages: PenpotPage[] }>(`get-file?id=${fileId}`);
    return data.pages || [];
  },

  async createPage(fileId: string, name: string): Promise<string> {
    // Penpot uses websocket for mutations — this creates via the REST shape endpoint
    const result = await this.request<{ id: string }>('create-page', {
      method: 'POST',
      body: JSON.stringify({ 'file-id': fileId, name }),
    });
    return result.id;
  },

  /** Export a page as PNG/SVG/PDF */
  async exportPage(fileId: string, pageId: string, format: 'png' | 'svg' | 'pdf' = 'png'): Promise<string> {
    const cfg = getPenpotConfig();
    const url = `${cfg.baseUrl}/api/export?file-id=${fileId}&page-id=${pageId}&type=${format}`;
    const res = await fetch(url, { headers: { 'Authorization': `Token ${cfg.token}` } });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  /** Get the direct editor URL for a file */
  getEditorUrl(fileId: string, pageId?: string): string {
    const cfg = getPenpotConfig();
    let url = `${cfg.baseUrl}/view/${fileId}`;
    if (pageId) url += `?page-id=${pageId}`;
    return url;
  },

  async testConnection(): Promise<boolean> {
    try {
      await this.request('get-profile');
      return true;
    } catch { return false; }
  },
};

// ── Component ─────────────────────────────────────────────────────

interface PenpotPanelProps {
  onExport?: (url: string, filename: string) => void;
  onInject?: (fn: (prev: string) => string) => void;
}

export default function PenpotPanel({ onExport, onInject }: PenpotPanelProps) {
  const [config, setConfig]           = useState<PenpotConfig>(getPenpotConfig);
  const [panelTab, setPanelTab]       = useState<'design' | 'assets' | 'config'>('design');
  const [connected, setConnected]     = useState(false);
  const [checking, setChecking]       = useState(false);
  const [projects, setProjects]       = useState<PenpotProject[]>([]);
  const [files, setFiles]             = useState<PenpotFile[]>([]);
  const [selectedProjectId, setSelProjId] = useState<string>('');
  const [selectedFileId, setSelFileId]    = useState<string>('');
  const [iframeUrl, setIframeUrl]     = useState<string>('');
  const [agentLog, setAgentLog]       = useState<string[]>([]);

  // New file / page form
  const [newFileName, setNewFileName] = useState('');
  const [newPageName, setNewPageName] = useState('');
  const [creating, setCreating]       = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const log = useCallback((msg: string) => {
    setAgentLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 100));
  }, []);

  // Test connection
  const testConnection = useCallback(async () => {
    setChecking(true);
    try {
      const ok = await PenpotClient.testConnection();
      setConnected(ok);
      if (ok) {
        log('✓ Connected to Penpot');
        // Load teams → projects
        const teams = await PenpotClient.getTeams();
        if (teams.length > 0) {
          const teamId = teams[0].id;
          const projs = await PenpotClient.getProjects(teamId);
          setProjects(projs);
          if (projs.length > 0) {
            setSelProjId(projs[0].id);
            const fl = await PenpotClient.getFiles(projs[0].id);
            setFiles(fl);
          }
        }
      } else {
        log('✗ Could not connect to Penpot — check URL and token');
      }
    } catch (e) {
      setConnected(false);
      log(`✗ Connection error: ${String(e)}`);
    }
    setChecking(false);
  }, [log]);

  useEffect(() => {
    if (config.token) testConnection();
  }, []);

  const openFile = useCallback((fileId: string) => {
    setSelFileId(fileId);
    setIframeUrl(PenpotClient.getEditorUrl(fileId));
    log(`Opened file ${fileId} in editor`);
  }, [log]);

  const loadProjectFiles = useCallback(async (projectId: string) => {
    setSelProjId(projectId);
    try {
      const fl = await PenpotClient.getFiles(projectId);
      setFiles(fl);
    } catch (e) { log(`Error loading files: ${String(e)}`); }
  }, [log]);

  const createNewFile = useCallback(async () => {
    if (!newFileName.trim() || !selectedProjectId) return;
    setCreating(true);
    try {
      const file = await PenpotClient.createFile(selectedProjectId, newFileName.trim());
      setFiles(prev => [...prev, file]);
      setNewFileName('');
      openFile(file.id);
      log(`✓ Created file: ${file.name}`);
    } catch (e) { log(`✗ Create file failed: ${String(e)}`); }
    setCreating(false);
  }, [newFileName, selectedProjectId, openFile, log]);

  const createNewPage = useCallback(async () => {
    if (!newPageName.trim() || !selectedFileId) return;
    setCreating(true);
    try {
      const pageId = await PenpotClient.createPage(selectedFileId, newPageName.trim());
      const url = PenpotClient.getEditorUrl(selectedFileId, pageId);
      setIframeUrl(url);
      setNewPageName('');
      log(`✓ Created page: ${newPageName}`);
    } catch (e) { log(`✗ Create page failed: ${String(e)}`); }
    setCreating(false);
  }, [newPageName, selectedFileId, log]);

  const exportCurrentFile = useCallback(async (format: 'png' | 'svg' | 'pdf') => {
    if (!selectedFileId) return;
    try {
      const pages = await PenpotClient.getPages(selectedFileId);
      if (pages.length === 0) { log('No pages to export'); return; }
      const blobUrl = await PenpotClient.exportPage(selectedFileId, pages[0].id, format);
      const file = files.find(f => f.id === selectedFileId);
      onExport?.(blobUrl, `${file?.name || 'design'}.${format}`);
      log(`✓ Exported as ${format.toUpperCase()}`);
    } catch (e) { log(`✗ Export failed: ${String(e)}`); }
  }, [selectedFileId, files, onExport, log]);

  const injectDesignContext = useCallback(async () => {
    if (!selectedFileId) return;
    const file = files.find(f => f.id === selectedFileId);
    const pages = await PenpotClient.getPages(selectedFileId).catch(() => []);
    const ctx = `DESIGN CONTEXT\nFile: ${file?.name}\nPages: ${pages.map(p => p.name).join(', ')}\nPenpot URL: ${PenpotClient.getEditorUrl(selectedFileId)}\n\nPlease design the following:`;
    onInject?.(() => ctx);
    log('Design context injected into prompt');
  }, [selectedFileId, files, onInject, log]);

  const saveConfig = useCallback(() => {
    savePenpotConfig(config);
    testConnection();
  }, [config, testConnection]);

  // ── Shared styles ───────────────────────────────────────────────
  const tabBtn = (id: string): React.CSSProperties => ({
    ...mono, fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase',
    padding: '5px 10px', background: 'transparent', border: 'none',
    borderBottom: `2px solid ${panelTab === id ? ARIA : 'transparent'}`,
    color: panelTab === id ? ARIA : T.textMuted, cursor: 'pointer',
  });

  const btn = (color = T.gold, outline = false): React.CSSProperties => ({
    ...mono, fontSize: '0.56rem', padding: '3px 10px', borderRadius: 3, cursor: 'pointer',
    background: outline ? 'transparent' : color + '22', color: outline ? T.textMuted : color,
    border: `1px solid ${outline ? T.border : color + '55'}`,
  });

  const inputSt: React.CSSProperties = {
    ...mono, background: T.surface, border: `1px solid ${T.border}`,
    borderRadius: 3, color: T.text, fontSize: '0.62rem', padding: '4px 8px', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.surface, color: T.text }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px',
        background: T.surface3, borderBottom: `1px solid ${T.goldBorder}`, flexShrink: 0 }}>
        <span style={{ color: ARIA, fontSize: '0.8rem' }}>✦</span>
        <span style={{ ...mono, fontSize: '0.62rem', letterSpacing: '0.2em', color: ARIA, textTransform: 'uppercase', fontWeight: 700 }}>
          Penpot Design Studio
        </span>
        <span style={{ ...mono, fontSize: '0.54rem', color: T.textDim }}>ARIA Okonkwo-Santos · CCO</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...mono, fontSize: '0.52rem',
            color: connected ? T.green : T.red,
            border: `1px solid ${connected ? T.green : T.red}44`, borderRadius: 3, padding: '1px 6px' }}>
            {checking ? '◌ checking...' : connected ? '● connected' : '● offline'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, background: T.surface2, flexShrink: 0 }}>
        {(['design', 'assets', 'config'] as const).map(t => (
          <button key={t} style={tabBtn(t)} onClick={() => setPanelTab(t)}>
            {t === 'design' ? '✦ Design' : t === 'assets' ? '◈ Assets' : '⚙ Config'}
          </button>
        ))}
      </div>

      {/* ── DESIGN TAB ─────────────────────────────────────────────── */}
      {panelTab === 'design' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Left: project/file browser */}
          <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
              <div style={{ ...mono, fontSize: '0.52rem', color: T.textDim, letterSpacing: '0.16em', marginBottom: 5 }}>PROJECT</div>
              <select value={selectedProjectId} onChange={e => loadProjectFiles(e.target.value)}
                style={{ ...inputSt, width: '100%', marginBottom: 6 }}>
                <option value="">Select project...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <div style={{ display: 'flex', gap: 6 }}>
                <input value={newFileName} onChange={e => setNewFileName(e.target.value)}
                  placeholder="New file name..."
                  style={{ ...inputSt, flex: 1 }}
                  onKeyDown={e => e.key === 'Enter' && createNewFile()} />
                <button style={btn(ARIA)} onClick={createNewFile} disabled={creating}>+</button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
              {files.length === 0 && (
                <div style={{ padding: 14, textAlign: 'center', ...mono, fontSize: '0.58rem', color: T.textDim }}>
                  {connected ? 'No files — create one above' : 'Not connected to Penpot'}
                </div>
              )}
              {files.map(f => (
                <div key={f.id}
                  onClick={() => openFile(f.id)}
                  style={{ padding: '6px 12px', cursor: 'pointer',
                    background: selectedFileId === f.id ? T.surface2 : 'transparent',
                    borderLeft: `2px solid ${selectedFileId === f.id ? ARIA : 'transparent'}` }}>
                  <div style={{ ...mono, fontSize: '0.62rem', color: selectedFileId === f.id ? T.text : T.textMuted }}>{f.name}</div>
                  <div style={{ ...mono, fontSize: '0.52rem', color: T.textDim, marginTop: 2 }}>
                    {new Date(f.modifiedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions for selected file */}
            {selectedFileId && (
              <div style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 5 }}>
                  <input value={newPageName} onChange={e => setNewPageName(e.target.value)}
                    placeholder="New page name..." style={{ ...inputSt, flex: 1 }}
                    onKeyDown={e => e.key === 'Enter' && createNewPage()} />
                  <button style={btn(ARIA)} onClick={createNewPage} disabled={creating}>+</button>
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {(['png', 'svg', 'pdf'] as const).map(fmt => (
                    <button key={fmt} style={{ ...btn(T.teal, true), flex: 1 }} onClick={() => exportCurrentFile(fmt)}>
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button style={btn(T.purple, true)} onClick={injectDesignContext}>
                  ▶ Inject into Prompt
                </button>
              </div>
            )}
          </div>

          {/* Right: Penpot editor iframe */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.black }}>
            {iframeUrl ? (
              <iframe
                ref={iframeRef}
                src={iframeUrl}
                style={{ flex: 1, border: 'none', width: '100%', height: '100%' }}
                title="Penpot Editor"
                allow="clipboard-read; clipboard-write"
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <div style={{ color: ARIA, fontSize: '2rem' }}>✦</div>
                <div style={{ ...mono, fontSize: '0.68rem', color: T.textMuted }}>
                  {connected ? 'Select a file to open the editor' : 'Connect to Penpot in the Config tab'}
                </div>
                {!connected && (
                  <button style={btn(ARIA)} onClick={() => setPanelTab('config')}>Configure Penpot →</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ASSETS TAB ─────────────────────────────────────────────── */}
      {panelTab === 'assets' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          <div style={{ ...mono, fontSize: '0.6rem', color: ARIA, marginBottom: 12, letterSpacing: '0.15em' }}>
            ✦ BRAND ASSETS LIBRARY
          </div>
          <div style={{ ...mono, fontSize: '0.58rem', color: T.textMuted, lineHeight: 1.8 }}>
            Assets exported from Penpot files will appear here.<br />
            They are also stored automatically in the Sovereign Vault under the <span style={{ color: ARIA }}>design</span> and <span style={{ color: ARIA }}>brand</span> categories.<br /><br />
            Use the Design tab to open a file and click <strong style={{ color: T.teal }}>PNG / SVG / PDF</strong> to export.
          </div>
          {/* Agent log */}
          {agentLog.length > 0 && (
            <div style={{ marginTop: 16, background: T.black, padding: 12, borderRadius: 4, border: `1px solid ${T.border}` }}>
              <div style={{ ...mono, fontSize: '0.52rem', color: ARIA, marginBottom: 6 }}>ARIA AGENT LOG</div>
              {agentLog.map((l, i) => (
                <div key={i} style={{ ...mono, fontSize: '0.58rem', color: T.textMuted, lineHeight: 1.8 }}>{l}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CONFIG TAB ─────────────────────────────────────────────── */}
      {panelTab === 'config' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <div style={{ ...mono, fontSize: '0.6rem', color: ARIA, letterSpacing: '0.15em', marginBottom: 16 }}>
            ✦ PENPOT CONNECTION SETTINGS
          </div>

          {[
            { label: 'Penpot Base URL', key: 'baseUrl', placeholder: 'http://localhost:3449', hint: 'Self-hosted: docker run -p 3449:3449 penpotapp/frontend\nCloud: https://design.penpot.app' },
            { label: 'Personal Access Token', key: 'token', placeholder: 'eyJ... (from Penpot → Profile → Access Tokens)', hint: '' },
          ].map(field => (
            <div key={field.key} style={{ marginBottom: 14 }}>
              <label style={{ ...mono, fontSize: '0.56rem', color: T.textMuted, display: 'block', marginBottom: 4 }}>
                {field.label}
              </label>
              <input
                type={field.key === 'token' ? 'password' : 'text'}
                value={(config as unknown as Record<string, string>)[field.key] || ''}
                onChange={e => setConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                style={{ width: '100%', ...inputSt }}
              />
              {field.hint && (
                <div style={{ ...mono, fontSize: '0.54rem', color: T.textDim, marginTop: 4, lineHeight: 1.6 }}>{field.hint}</div>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button style={btn(ARIA)} onClick={saveConfig}>Save & Test Connection</button>
            <button style={btn(T.teal, true)} onClick={testConnection}>Test Only</button>
          </div>

          {/* Self-hosting guide */}
          <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: '12px 14px' }}>
            <div style={{ ...mono, fontSize: '0.58rem', color: ARIA, marginBottom: 8 }}>✦ Self-Hosting Penpot (Recommended)</div>
            <pre style={{ ...mono, fontSize: '0.56rem', color: T.textMuted, lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>
{`# Fastest way — single container
docker run -p 3449:3449 \\
  -p 3450:3450 \\
  penpotapp/frontend

# Then open: http://localhost:3449
# Create account → Profile → Access Tokens → Generate
# Paste token above.

# Full stack (recommended for production):
# https://penpot.app/self-host.html`}
            </pre>
          </div>

          {/* Agent capabilities */}
          <div style={{ marginTop: 14, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: '12px 14px' }}>
            <div style={{ ...mono, fontSize: '0.58rem', color: ARIA, marginBottom: 8 }}>✦ ARIA Design Capabilities</div>
            <div style={{ ...mono, fontSize: '0.56rem', color: T.textMuted, lineHeight: 1.9 }}>
              {[
                'Create design files and pages via Archon task dispatch',
                'Export assets (PNG/SVG/PDF) into Sovereign Vault',
                'Inject design context into AI prompt for copy/strategy',
                'Open specific files in the embedded Penpot editor',
                'Receive design briefs from KENDRA (Growth) and ARIA (Creative)',
              ].map((cap, i) => <div key={i}>✦ {cap}</div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agent helpers (used by archon-handlers.ts) ─────────────────────

export async function agentCreatePage(projectName: string, pageName: string): Promise<string> {
  const teams = await PenpotClient.getTeams();
  if (!teams.length) throw new Error('No Penpot teams found');
  const projects = await PenpotClient.getProjects(teams[0].id);
  const proj = projects.find(p => p.name === projectName) || projects[0];
  if (!proj) throw new Error('No Penpot project available');
  const files = await PenpotClient.getFiles(proj.id);
  let file = files.find(f => f.name === projectName);
  if (!file) file = await PenpotClient.createFile(proj.id, projectName);
  const pageId = await PenpotClient.createPage(file.id, pageName);
  return pageId;
}

export async function agentUpdateAsset(fileId: string, _data: unknown): Promise<void> {
  // Penpot mutations require websocket (RPC over WS)
  // Stub: log the intent — full WS implementation requires penpot-rpc protocol
  console.info(`[Penpot] Asset update queued for file ${fileId}`);
}