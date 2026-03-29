/**
 * ═══════════════════════════════════════════════════════════════════
 *  CODE STUDIO — xDragon Sovereign IDE
 *
 *  Modes:
 *    AI     — Agent coding assistant (output TOP, prompt BOTTOM)
 *    IDE    — Monaco editor with file tree, terminal, draggable panels
 *    BLUEPRINT — Process Economics (Sprint/Kanban/Pipeline/Ceremonies)
 *    GIT    — GitFort + GitHub import/export
 *
 *  PLACE AT: xdragon/app/ui/app/src/components/CodeStudio.tsx
 *  IMPORT IN: CreativePlayground.tsx
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useState, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import GitFort from '@/components/GitFort';
import { SovereignVault } from '@/lib/sovereign-vault';
import { parseJsonlFromResponse } from '@/util/jsonl-parsing';
import { getOllamaUrl, ARCHON_BACKEND_URL } from '@/lib/config';

// ── Design tokens ──────────────────────────────────────────────────
const T = {
  gold:'#c9a84c', goldDim:'#6b5820', goldBorder:'#3a3020',
  black:'#080808', surface:'#0f0f0f', surface2:'#161616', surface3:'#202020',
  border:'#282420', text:'#f0ead8', textMuted:'#7a7060', textDim:'#3a3530',
  green:'#4a9a6a', red:'#c05040', teal:'#5ab0c8', blue:'#4a8aba',
  purple:'#9a7ab0', orange:'#d4805a', sage:'#8aaa60',
};
const mono: React.CSSProperties = { fontFamily:'"Menlo","Monaco","Consolas","Courier New",monospace' };

// ── Types ─────────────────────────────────────────────────────────
type StudioMode = 'ai' | 'ide' | 'blueprint' | 'git';
type BpView = 'sprint' | 'kanban' | 'pipeline' | 'ceremonies';
type KanbanCol = 'backlog' | 'todo' | 'doing' | 'review' | 'done';

export interface StudioTab { id: string; name: string; content: string; lang: string; modified: boolean; }

interface KanbanCard {
  id: string; title: string; desc: string; agent: string;
  priority: 'critical'|'high'|'normal'|'low'; col: KanbanCol;
  storyPoints: number; venture?: string;
}

interface SprintData {
  id: string; name: string; goal: string;
  startDate: string; endDate: string;
  velocity: number; totalPoints: number; completedPoints: number;
}

interface PipelineStage {
  id: string; name: string; desc: string; agent: string;
  color: string; status: 'complete'|'active'|'pending';
  kpis: string[]; ventures: string[];
}

interface Ceremony {
  id: string; type: 'standup'|'planning'|'retro'|'demo';
  date: string; notes: string; agent: string; venture: string;
}

interface FileNode {
  id: string; name: string; type: 'file'|'folder';
  lang?: string; content?: string; children?: FileNode[];
  expanded?: boolean;
}

export interface CodeStudioProps {
  openTabs: StudioTab[];
  activeTabId: string | null;
  onOpenTab: (tab: StudioTab) => void;
  onUpdateContent: (id: string, content: string) => void;
  onCloseTab: (id: string) => void;
  setActiveTabId: (id: string | null) => void;
  activeAgentId: string;
  setActiveAgentId: (id: string) => void;
  isHealthy: boolean;
  selectedModel: string;
  temperature: number;
  setTemperature: (v: number) => void;
}

// ── Drag-to-resize hook ────────────────────────────────────────────
function useResize(initial: number, min: number, max: number, dir: 'h'|'v') {
  const [size, setSize] = useState(initial);
  const state = useRef<{startPos:number; startSize:number}|null>(null);
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    state.current = { startPos: dir==='h' ? e.clientX : e.clientY, startSize: size };
    const onMove = (ev: MouseEvent) => {
      if (!state.current) return;
      const delta = (dir==='h' ? ev.clientX : ev.clientY) - state.current.startPos;
      setSize(Math.max(min, Math.min(max, state.current.startSize + (dir==='v' ? -delta : delta))));
    };
    const onUp = () => { state.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [size, min, max, dir]);
  return { size, onMouseDown };
}

// ── Language detection ─────────────────────────────────────────────
function detectLang(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ({ ts:'typescript', tsx:'typescript', js:'javascript', jsx:'javascript', py:'python', json:'json', md:'markdown', css:'css', html:'html', yml:'yaml', yaml:'yaml', toml:'ini', sh:'shell', rs:'rust', go:'go', sql:'sql', env:'ini' } as Record<string,string>)[ext] || 'plaintext';
}

// ── File icon ─────────────────────────────────────────────────────
function fileIcon(name: string, isFolder: boolean, expanded?: boolean): string {
  if (isFolder) return expanded ? '📂' : '📁';
  const ext = name.split('.').pop()?.toLowerCase();
  return ({ ts:'🔷', tsx:'⚛️', js:'🟨', py:'🐍', json:'📋', md:'📝', css:'🎨', html:'🌐', toml:'⚙️', yml:'⚙️', env:'🔐', sh:'💻', sql:'🗄️' } as Record<string,string>)[ext||''] || '📄';
}

// ── Process Economics data ─────────────────────────────────────────
const PIPELINE_STAGES: PipelineStage[] = [
  { id:'ideate',   name:'Ideation',    desc:'Concept generation and opportunity identification', agent:'ARCHON',   color:T.gold,   status:'complete', kpis:['Ideas generated','Feasibility score','TAM estimate'], ventures:['All'] },
  { id:'validate', name:'Validation',  desc:'Market fit research and competitive analysis',     agent:'KOFI',     color:T.blue,   status:'complete', kpis:['Market size','Competitor gaps','Revenue model'], ventures:['GeniePay','GenieID'] },
  { id:'design',   name:'Design',      desc:'Brand system, product design, user flows',         agent:'ARIA',     color:T.purple, status:'active',  kpis:['Design system coverage','User flow completion','Brand assets'], ventures:['All'] },
  { id:'build',    name:'Build',       desc:'Engineering implementation and infrastructure',     agent:'AYO',      color:T.teal,   status:'active',  kpis:['Sprint velocity','Test coverage','Deploy frequency'], ventures:['xDragon','Archon'] },
  { id:'launch',   name:'Launch',      desc:'Go-to-market execution and user acquisition',      agent:'KENDRA',   color:T.orange, status:'pending', kpis:['CAC','Conversion rate','Launch day users'], ventures:['GeniePay'] },
  { id:'revenue',  name:'Revenue',     desc:'Monetisation, pricing and financial operations',   agent:'KOFI',     color:T.green,  status:'pending', kpis:['MRR','LTV:CAC','Gross margin'], ventures:['All'] },
  { id:'scale',    name:'Scale',       desc:'Infrastructure scaling and market expansion',       agent:'AYO',      color:T.sage,   status:'pending', kpis:['Uptime','Latency p99','Active users'], ventures:['All'] },
];

const CEREMONY_TEMPLATES = {
  standup: `DAILY STANDUP\nDate: ${new Date().toLocaleDateString('en-GB')}\n\nYesterday:\n- \n\nToday:\n- \n\nBlockers:\n- `,
  planning: `SPRINT PLANNING\nDate: ${new Date().toLocaleDateString('en-GB')}\n\nSprint Goal:\n\nAcceptance Criteria:\n1. \n2. \n\nCapacity:\nEstimated Points: \nRisk:\n`,
  retro: `SPRINT RETROSPECTIVE\nDate: ${new Date().toLocaleDateString('en-GB')}\n\nWent Well:\n- \n\nNeeds Improvement:\n- \n\nAction Items:\n1. \n\nVelocity: `,
  demo: `SPRINT DEMO\nDate: ${new Date().toLocaleDateString('en-GB')}\n\nFeatures Demonstrated:\n1. \n\nStakeholder Feedback:\n- \n\nNext Sprint Preview:\n- `,
};

const DEFAULT_KANBAN: KanbanCard[] = [
  { id:'k1', title:'Archon WebSocket endpoint', desc:'Build /ws/xdragon tunnel', agent:'AYO', priority:'critical', col:'doing', storyPoints:8, venture:'Archon' },
  { id:'k2', title:'Railway deployment', desc:'Migrate from Render, configure MongoDB', agent:'AYO', priority:'critical', col:'todo', storyPoints:5, venture:'Archon' },
  { id:'k3', title:'HyperSpace node registration', desc:'Register xDragon as P2P research node', agent:'AYO', priority:'high', col:'backlog', storyPoints:13, venture:'xDragon' },
  { id:'k4', title:'KENDRA GTM plan', desc:'GeniePay go-to-market for Nigeria launch', agent:'KENDRA', priority:'high', col:'todo', storyPoints:8, venture:'GeniePay' },
  { id:'k5', title:'Supabase vault_entries table', desc:'Create pgvector schema for Sovereign Vault', agent:'AYO', priority:'high', col:'review', storyPoints:3, venture:'Archon' },
  { id:'k6', title:'Penpot self-hosting', desc:'Deploy Penpot for ARIA design work', agent:'AYO', priority:'normal', col:'backlog', storyPoints:5, venture:'xDragon' },
  { id:'k7', title:'MEI BI dashboard', desc:'KPI dashboard for GeniePay metrics', agent:'MEI', priority:'normal', col:'backlog', storyPoints:8, venture:'GeniePay' },
  { id:'k8', title:'TUNDE compliance matrix', desc:'Nigeria/Ghana/Kenya regulatory review', agent:'TUNDE', priority:'high', col:'doing', storyPoints:5, venture:'GeniePay' },
  { id:'k9', title:'Byterover MCP integration', desc:'Connect knowledge graph to agent tools', agent:'MODEBOLA', priority:'high', col:'backlog', storyPoints:8, venture:'Archon' },
  { id:'k10', title:'Ideogram creative pipeline', desc:'Auto-generate brand assets via Ideogram API', agent:'ARIA', priority:'normal', col:'backlog', storyPoints:5, venture:'xDragon' },
];

const DEFAULT_SPRINT: SprintData = {
  id:'s1', name:'Sprint 4 — Archon Integration',
  goal:'Complete the Archon-xDragon tunnel and deploy to Railway',
  startDate:'2026-03-15', endDate:'2026-03-28',
  velocity:34, totalPoints:52, completedPoints:18,
};

// ── Default file tree ──────────────────────────────────────────────
const DEFAULT_TREE: FileNode[] = [
  { id:'src', name:'src', type:'folder', expanded:true, children:[
    { id:'src/components', name:'components', type:'folder', expanded:true, children:[
      { id:'f1', name:'CreativePlayground.tsx', type:'file', lang:'typescript', content:'// CreativePlayground — main app shell' },
      { id:'f2', name:'CodeStudio.tsx', type:'file', lang:'typescript', content:'// CodeStudio — sovereign IDE' },
      { id:'f3', name:'ServicesModule.tsx', type:'file', lang:'typescript', content:'// ServicesModule — infrastructure map' },
      { id:'f4', name:'PenpotPanel.tsx', type:'file', lang:'typescript', content:'// PenpotPanel — design studio integration' },
    ]},
    { id:'src/lib', name:'lib', type:'folder', expanded:false, children:[
      { id:'f5', name:'config.ts', type:'file', lang:'typescript', content:'// Centralised config — OLLAMA_URL etc.' },
      { id:'f6', name:'archon-tunnel.ts', type:'file', lang:'typescript', content:'// Archon WebSocket tunnel' },
      { id:'f7', name:'sovereign-vault.ts', type:'file', lang:'typescript', content:'// Sovereign Vault DB layer' },
    ]},
    { id:'src/hooks', name:'hooks', type:'folder', expanded:false, children:[
      { id:'f8', name:'useHealth.ts', type:'file', lang:'typescript', content:'// useHealth — Ollama health polling' },
    ]},
  ]},
  { id:'railway.toml', name:'railway.toml', type:'file', lang:'ini', content:'# Railway deployment config' },
  { id:'package.json', name:'package.json', type:'file', lang:'json', content:'{\n  "name": "xdragon-studio"\n}' },
];

// ── Global Styles Overrides ───────────────────────────────────────
const IDE_STYLES = `
  .ide-row:hover .file-actions { opacity: 1 !important; }
  .ide-row:hover { background: ${T.surface3} !important; }
  .ide-active-row { background: ${T.surface2} !important; border-left: 2px solid ${T.gold} !important; }
  .ide-scrollbar::-webkit-scrollbar { width: 10px; height: 10px; }
  .ide-scrollbar::-webkit-scrollbar-track { background: ${T.black}; }
  .ide-scrollbar::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 5px; border: 2px solid ${T.black}; }
  .ide-scrollbar::-webkit-scrollbar-thumb:hover { background: ${T.textDim}; }
`;
interface ContextMenuState { x:number; y:number; node:FileNode|null; }

function FileTree({ nodes, activeId, onOpen, onToggle, onDelete, depth=0 }: {
  nodes: FileNode[]; activeId: string|null;
  onOpen: (n: FileNode) => void; onToggle: (id: string) => void;
  onDelete: (id: string, name: string) => void; depth?: number;
}) {
  const [ctx, setCtx] = React.useState<ContextMenuState>({ x:0, y:0, node:null });

  const handleRightClick = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault(); e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, node });
  };

  const closeCtx = () => setCtx(c => ({ ...c, node: null }));

  React.useEffect(() => {
    if (ctx.node) {
      const close = () => closeCtx();
      window.addEventListener('click', close);
      return () => window.removeEventListener('click', close);
    }
  }, [ctx.node]);

  return (
    <>
      {ctx.node && (
        <div style={{ position:'fixed', left:ctx.x, top:ctx.y, zIndex:9999,
          background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4,
          padding:'4px 0', minWidth:160, boxShadow:'0 4px 16px rgba(0,0,0,0.5)' }}
          onClick={e => e.stopPropagation()}>
          {ctx.node.type === 'file' && (
            <div onClick={() => { onOpen(ctx.node!); closeCtx(); }}
              style={{ padding:'6px 14px', ...mono, fontSize:'0.62rem', color:T.text, cursor:'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background=T.surface3}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}>
              ↗ Open in editor
            </div>
          )}
          {ctx.node.type === 'folder' && (
            <div onClick={() => { onToggle(ctx.node!.id); closeCtx(); }}
              style={{ padding:'6px 14px', ...mono, fontSize:'0.62rem', color:T.text, cursor:'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background=T.surface3}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}>
              {ctx.node.expanded ? '▾ Collapse' : '▸ Expand'}
            </div>
          )}
          <div style={{ height:1, background:T.border, margin:'3px 0' }} />
          <div onClick={() => {
              if (window.confirm(`Delete ${ctx.node!.name}?`)) {
                onDelete(ctx.node!.id, ctx.node!.name);
              }
              closeCtx();
            }}
            style={{ padding:'6px 14px', ...mono, fontSize:'0.62rem', color:T.red, cursor:'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background=T.surface3}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}>
            ✕ Delete
          </div>
        </div>
      )}
      {nodes.map(node => (
        <div key={node.id}>
          <div
            onClick={() => node.type==='folder' ? onToggle(node.id) : onOpen(node)}
            onContextMenu={e => handleRightClick(e, node)}
            className={`ide-row ${activeId===node.id ? 'ide-active-row' : ''}`}
            style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 12px',
              paddingLeft: 12 + depth*14, cursor:'pointer', position: 'relative'
            }}
          >
            <span style={{fontSize:'0.7rem', flexShrink:0, marginRight: 4}}>{fileIcon(node.name, node.type==='folder', node.expanded)}</span>
            <span style={{...mono, fontSize:'0.62rem', color: activeId===node.id ? T.text : T.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex: 1}}>
              {node.name}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              {node.type==='file' && (
                <span style={{...mono, fontSize:'0.48rem', color:T.textDim, opacity: 0.6}}>
                  {detectLang(node.name).substring(0,3).toUpperCase()}
                </span>
              )}
              <div style={{ display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.2s' }} className="file-actions">
                <button title="Delete" onClick={(e) => { 
                  e.stopPropagation(); 
                  if (node.type === 'folder') {
                    if(confirm(`Permanently delete folder '${node.name}' and all its contents?`)) onDelete(node.id, node.name);
                  } else {
                    onDelete(node.id, node.name);
                  }
                }} style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', fontSize: '0.8rem', padding: '0 4px', display: 'flex', alignItems: 'center' }}>
                  🗑️
                </button>
              </div>
            </div>
          </div>
          {node.type==='folder' && node.expanded && node.children && (
            <FileTree nodes={node.children} activeId={activeId} onOpen={onOpen} onToggle={onToggle} onDelete={onDelete} depth={depth+1} />
          )}
        </div>
      ))}
    </>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function CodeStudio({
  openTabs, activeTabId, onOpenTab, onUpdateContent, onCloseTab, setActiveTabId,
  activeAgentId, setActiveAgentId, isHealthy, selectedModel, temperature, setTemperature,
}: CodeStudioProps) {
  const [mode, setMode]               = useState<StudioMode>('ai');
  const [bpView, setBpView]           = useState<BpView>('kanban');
  const [prompt, setPrompt]           = useState('');
  const [output, setOutput]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string|null>(null);
  const [fileTree, setFileTree]       = useState<FileNode[]>(DEFAULT_TREE);
  const [kanban, setKanban]           = useState<KanbanCard[]>(DEFAULT_KANBAN);
  const [sprint, _setSprint]           = useState<SprintData>(DEFAULT_SPRINT);
  const [ceremonies, setCeremonies]   = useState<Ceremony[]>([]);
  const [termOutput, setTermOutput]   = useState<string[]>(['$ archon-daemon connected — port 11434', '$ vite dev — port 5173', '$ ready...']);
  const [termInput, setTermInput]     = useState('');
  const [activeTermTab, setActiveTermTab] = useState<'terminal'|'output'|'problems'|'lint'>('terminal');
  const [importModal, setImportModal] = useState(false);
  const [ghImportUrl, setGhImportUrl] = useState('');
  const [ghImportStatus, setGhImportStatus] = useState<{msg:string; type:'idle'|'loading'|'ok'|'error'}>({msg:'', type:'idle'});
  const [searchQuery, setSearchQuery] = useState('');
  const [quickOpen, setQuickOpen] = useState({isOpen:false, query:''});
  const [previewWidth, setPreviewWidth] = useState('100%');
  const [sysBrowser, setSysBrowser] = useState<{isOpen:boolean; path:string; items:any[]}>({isOpen:false, path:'/', items:[]});
  const [projectScripts, setProjectScripts] = useState<string[]>([]);
  const [detectedType, setDetectedType] = useState<'node'|'python'|'static'|'unknown'>('unknown');
  const [pipelineStatus, setPipelineStatus] = useState<'idle'|'running'|'success'|'fail'>('idle');
  const abortRef = useRef<AbortController|null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Draggable panels
  const explorer = useResize(240, 180, 500, 'h');
  const terminal = useResize(180, 80, 600, 'v');

  const [activeActivity, setActiveActivity] = useState<'workspace'|'preview'|'git'|'ai'|'settings'>('workspace');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'workspace'|'preview'>('workspace');
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isTerminalVisible, setIsTerminalVisible] = useState(true);
  const [activeProjects, setActiveProjects] = useState<string[]>(JSON.parse(localStorage.getItem('active_projects') || '["/xdragon"]'));
  const [termSessions, setTermSessions] = useState<{id:string; name:string; cwd:string}[]>([{id:'default', name:'bash', cwd:'/xdragon'}]);
  const [activeSessionId, setActiveSessionId] = useState('default');

  const activeSession = termSessions.find(s => s.id === activeSessionId) || termSessions[0];
  const termCwd = activeSession.cwd;

  const setTermCwd = (newCwd: string) => {
    setTermSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, cwd: newCwd } : s));
  };

  const [problems, setProblems] = useState<{file:string; line:number; msg:string; type:'error'|'warn'}[]>([]);
  const [linterProblems, setLinterProblems] = useState<{file:string; line:number; msg:string; type:'error'|'warn'}[]>([]);
  const abortTermRef = useRef<AbortController | null>(null);

  const monacoEditorRef = useRef<any>(null);

  // ── AI Execute ─────────────────────────────────────────────────
  const handleExecute = useCallback(async (overridePrompt?: string) => {
    const p = overridePrompt || prompt;
    if (!p.trim() || loading) return;
    setLoading(true); setOutput(''); setError(null);
    const ctrl = new AbortController(); abortRef.current = ctrl;
    let cur = '';
    const AGENT_PROMPTS: Record<string,string> = {
      AYO: 'You are Ayo Hastruup, CTO. Output production-ready TypeScript only — full error handling, no TODOs. Wrap code in ```typescript blocks with filename as first comment.',
      ARCHON: 'You are The Archon, Digital CEO. Synthesise architecture, orchestrate agents. Be authoritative and precise.',
      MODEBOLA: 'You are Modebola, Chief of Staff. Produce structured plans, documentation, and cross-functional decisions.',
      KOFI: 'You are Kofi, Chief Economist. Produce financial models, market analysis, and economic briefs.',
      MEI: 'You are Mei, Chief BI Officer. Build KPI dashboards, cohort analyses, and data-driven reports.',
      ARIA: 'You are Aria, Chief Creative Officer. Design brand systems, visual identities, and creative frameworks.',
      KENDRA: 'You are Kendra, Chief Growth Officer. Produce GTM plans, campaigns, user flows, and conversion strategies.',
      TUNDE: 'You are Tunde, Chief Legal Counsel. Provide structured legal analysis with applicable law references.',
    };
    const sys = AGENT_PROMPTS[activeAgentId] || AGENT_PROMPTS.AYO;
    try {
      const res = await fetch(`${getOllamaUrl()}/api/chat`, {
        method:'POST', headers:{'Content-Type':'application/json'}, signal: ctrl.signal,
        body: JSON.stringify({ model:selectedModel, stream:true, options:{temperature},
          messages:[{role:'system',content:sys},{role:'user',content:p}] }),
      });
      for await (const chunk of parseJsonlFromResponse<{message?:{content:string};done?:boolean}>(res)) {
        if (chunk.message?.content) { cur += chunk.message.content; setOutput(cur); }
        if (chunk.done) break;
      }
      if (cur.length > 100) {
        SovereignVault.store({ title:`${activeAgentId} · ${p.substring(0,60)}`, category:'codebase',
          content:cur, agentId:activeAgentId, tags:[activeAgentId,'code','generated'] }).catch(()=>{});
      }
    } catch(e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') setError(e.message);
    } finally { setLoading(false); abortRef.current=null; }
  }, [prompt, loading, activeAgentId, selectedModel, temperature]);

  // ── Import file(s) from disk ──────────────────────────────────
  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const content = String(ev.target?.result || '');
        const tab: StudioTab = { id:`import-${Date.now()}-${file.name}`, name:file.name, content, lang:detectLang(file.name), modified:false };
        onOpenTab(tab);
        setActiveTabId(tab.id);
        setMode('ide');
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  }, [onOpenTab, setActiveTabId]);

  // ── Import entire folder from disk ────────────────────────────
  const handleImportFolder = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Filter to supported source file types only
    const supported = files.filter(f => /\.(ts|tsx|js|jsx|py|json|md|css|html|toml|yml|yaml|sh|sql|env)$/.test(f.name));
    if (supported.length === 0) { alert('No supported source files found in this folder.'); return; }
    supported.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = ev => {
        const content = String(ev.target?.result || '');
        const id = `folder-${Date.now()}-${idx}-${file.name}`;
        const tab: StudioTab = { id, name:file.name, content, lang:detectLang(file.name), modified:false };
        onOpenTab(tab);
        if (idx === 0) { setActiveTabId(id); }
      };
      reader.readAsText(file);
    });
    setMode('ide');
    e.target.value = '';
  }, [onOpenTab, setActiveTabId]);

  // ── Save file to disk via Archon backend ──────────────────────
  const handleSaveFile = useCallback(async () => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (!tab) return;
    try {
      setTermOutput(p => [...p, `$ save ${tab.name}`]);
      const res = await fetch(`${ARCHON_BACKEND_URL}/api/execute/write`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-archon-gateway-key': localStorage.getItem('archon_gateway_key') || ''
        },
        body: JSON.stringify({ file_path: tab.id, content: tab.content })
      });
      const data = await res.json();
      if (data.success) {
        setTermOutput(p => [...p, `✓ Saved ${tab.name} to disk.`]);
        onUpdateContent(tab.id, tab.content); // Mark as not modified? (Need a clear way to sync modified state)
      } else {
        setTermOutput(p => [...p, `✗ Save failed: ${data.error || 'Unknown error'}`]);
      }
    } catch (e) {
      setTermOutput(p => [...p, `✗ Network Error on save: ${String(e)}`]);
    }
  }, [openTabs, activeTabId, onUpdateContent]);

  // ── Export all open files as ZIP-like JSON archive ─────────────
  const handleExportAll = useCallback(() => {
    const archive = JSON.stringify({ exportedAt:new Date().toISOString(), files: openTabs.map(t=>({name:t.name,content:t.content,lang:t.lang})) }, null, 2);
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([archive], {type:'application/json'})),
      download: `xdragon-workspace-${Date.now()}.json`,
    });
    a.click(); URL.revokeObjectURL(a.href);
  }, [openTabs]);

  // ── Clone from GitHub ──────────────────────────────────────────
  const handleGitHubImport = useCallback(async () => {
    const url = ghImportUrl.trim();
    if (!url) return;
    // Strip trailing .git and extract owner/repo
    const clean = url.replace(/\.git$/, '');
    const match = clean.match(/github\.com\/([^/\s]+)\/([^/\s]+)/);
    if (!match) { setGhImportStatus({msg:'Invalid GitHub URL — use: https://github.com/owner/repo', type:'error'}); return; }
    const [, owner, repo] = match;

    // Get PAT — check localStorage first (saved by GitFort settings)
    const pat = localStorage.getItem('github_pat') || '';
    if (!pat) {
      setGhImportStatus({msg:'No GitHub token found. Go to Settings → Agent Model Assignment and configure your GitHub PAT, or paste it in GitFort → Config tab.', type:'error'});
      return;
    }

    setGhImportStatus({msg:`Fetching file tree from ${owner}/${repo}...`, type:'loading'});

    const headers = { Authorization:`token ${pat}`, Accept:'application/vnd.github.v3+json' };

    try {
      // Try main first, then master, then HEAD
      let treeData: {tree?: {type:string;path:string}[]; message?: string} = {};
      for (const ref of ['main', 'master', 'HEAD']) {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`, { headers });
        treeData = await res.json();
        if (!treeData.message) break; // success
      }

      if (treeData.message) {
        setGhImportStatus({msg:`GitHub error: ${treeData.message}. Check the repo URL and that your PAT has 'repo' scope.`, type:'error'});
        return;
      }

      const sourceFiles = (treeData.tree || [])
        .filter((f:{type:string;path:string}) => f.type==='blob' && /\.(ts|tsx|js|jsx|py|json|md|css|html|toml|yml|yaml|env|sh|sql)$/.test(f.path))
        .slice(0, 20);

      if (sourceFiles.length === 0) {
        setGhImportStatus({msg:'No supported source files found (ts/tsx/js/py/json/md/css/html — max 20).', type:'error'});
        return;
      }

      setGhImportStatus({msg:`Importing ${sourceFiles.length} files...`, type:'loading'});

      let loaded = 0;
      for (const file of sourceFiles) {
        const fRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`, { headers });
        if (!fRes.ok) continue;
        const fData = await fRes.json();
        if (!fData.content) continue;
        const content = atob(fData.content.replace(/\n/g, ''));
        const tab: StudioTab = {
          id: `gh-${file.path}-${Date.now()}`,
          name: file.path.split('/').pop()!,
          content, lang: detectLang(file.path), modified: false,
        };
        onOpenTab(tab);
        loaded++;
        setGhImportStatus({msg:`Importing... ${loaded}/${sourceFiles.length}`, type:'loading'});
      }

      setGhImportStatus({msg:`✓ Imported ${loaded} files from ${owner}/${repo}`, type:'ok'});
      setTimeout(() => { setImportModal(false); setGhImportUrl(''); setGhImportStatus({msg:'',type:'idle'}); setMode('ide'); }, 1500);

    } catch(e: unknown) {
      setGhImportStatus({msg:`Network error: ${e instanceof Error ? e.message : String(e)}`, type:'error'});
    }
  }, [ghImportUrl, onOpenTab]);

  // ── File tree toggle ───────────────────────────────────────────
  const toggleFolder = useCallback((id: string) => {
    const toggle = (nodes: FileNode[]): FileNode[] =>
      nodes.map(n => n.id===id ? {...n, expanded:!n.expanded} : {...n, children:n.children?toggle(n.children):undefined});
    setFileTree(toggle);
  }, []);

  const deleteFromTree = useCallback(async (id: string, _name: string) => {
    try {
      const res = await fetch(`${ARCHON_BACKEND_URL}/api/execute/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-archon-gateway-key': localStorage.getItem('archon_gateway_key') || ''
        },
        body: JSON.stringify({ command: `rm -rf "${id}"` })
      });
      if (res.ok) {
        setFileTree(nodes => {
          const remove = (ns: FileNode[]): FileNode[] =>
            ns.filter(n => n.id !== id).map(n => ({...n, children: n.children ? remove(n.children) : undefined}));
          return remove(nodes);
        });
        onCloseTab(id);
      }
    } catch (e) { console.error('Delete failed', e); }
  }, [onCloseTab]);

  const refreshFileTree = useCallback(async (dir = '') => {
    try {
      const projectsToFetch = dir ? [dir] : activeProjects;
      let newNodes: FileNode[] = dir ? [] : [];

      for (const p of projectsToFetch) {
        const res = await fetch(`${ARCHON_BACKEND_URL}/api/execute/files?dir=${encodeURIComponent(p)}`, {
          headers: { 'x-archon-gateway-key': localStorage.getItem('archon_gateway_key') || '' }
        });
        const data = await res.json();
        if (data.success) {
          const convert = (fs: any[]): FileNode[] => fs.map(f => ({
            id: f.path, name: f.name, type: f.type === 'directory' ? 'folder' : 'file',
            lang: detectLang(f.name), expanded: false
          }));
          
          if (!dir) {
            newNodes = [...newNodes, ...convert(data.files)];
          } else {
            const update = (nodes: FileNode[]): FileNode[] => nodes.map(n => {
              if (n.id === dir) return { ...n, children: convert(data.files), expanded: true };
              if (n.children) return { ...n, children: update(n.children) };
              return n;
            });
            setFileTree(update);
            return;
          }
        }
      }
      if (!dir) setFileTree(newNodes);
    } catch (e) { console.error('Tree fetch failed', e); }
  }, [activeProjects]);

  React.useEffect(() => {
    const detect = () => {
      let type: any = 'unknown';
      let scripts: string[] = [];
      const scan = (nodes: FileNode[]) => {
        for (const n of nodes) {
          if (n.name === 'package.json') { type = 'node'; scripts = ['npm start', 'npm test', 'npm run dev']; }
          else if (n.name === 'main.py' || n.name === 'app.py' || n.name === 'manage.py') { type = 'python'; scripts = [`python ${n.name}`]; }
          else if (n.name === 'index.html' && type === 'unknown') { type = 'static'; }
          if (n.children) scan(n.children);
        }
      };
      scan(fileTree);
      setDetectedType(type);
      setProjectScripts(scripts);
    };
    detect();
  }, [fileTree]);

  React.useEffect(() => { refreshFileTree(); }, [refreshFileTree, activeProjects]);

  const handleOpenFile = useCallback(async (node: FileNode) => {
    if (node.type === 'folder') {
      if (!node.children) refreshFileTree(node.id);
      else toggleFolder(node.id);
      return;
    }
    try {
      const res = await fetch(`${ARCHON_BACKEND_URL}/api/execute/read?file_path=${encodeURIComponent(node.id)}`, {
        headers: { 'x-archon-gateway-key': localStorage.getItem('archon_gateway_key') || '' }
      });
      const data = await res.json();
      if (data.success) {
        const tab: StudioTab = { id: node.id, name: node.name, content: data.content, lang: node.lang || 'plaintext', modified: false };
        onOpenTab(tab);
        setActiveTabId(tab.id);
      }
    } catch (e) { console.error('Read failed', e); }
  }, [refreshFileTree, toggleFolder, onOpenTab, setActiveTabId]);

  const handleNewFile = useCallback(() => {
    const name = window.prompt('File name (e.g. MyComponent.tsx):')?.trim();
    if (!name) return;
    const tab: StudioTab = { id:`new-${Date.now()}`, name, content:`// ${name}\n`, lang:detectLang(name), modified:true };
    onOpenTab(tab);
    setActiveTabId(tab.id);
    setMode('ide');
  }, [onOpenTab, setActiveTabId]);

  const handleNewFolder = useCallback(async () => {
    const name = window.prompt('Folder name (relative to workspace root):')?.trim();
    if (!name) return;
    try {
      const res = await fetch(`${ARCHON_BACKEND_URL}/api/execute/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-archon-gateway-key': localStorage.getItem('archon_gateway_key') || '' },
        body: JSON.stringify({ command: `mkdir -p "${name}"` })
      });
      if (res.ok) {
        refreshFileTree();
        setTermOutput(p => [...p, `$ mkdir -p ${name} (success)`]);
      }
    } catch (e) { console.error('Folder creation failed', e); }
  }, [refreshFileTree]);

  const handleBrowse = useCallback(async (path: string) => {
    try {
      const res = await fetch(`${ARCHON_BACKEND_URL}/api/execute/files?dir=${encodeURIComponent(path)}`, {
        headers: { 'x-archon-gateway-key': localStorage.getItem('archon_gateway_key') || '' }
      });
      const data = await res.json();
      if (data.success) {
        setSysBrowser(s => ({ ...s, path, items: data.files || [] }));
      }
    } catch (e) { console.error('Browse failed', e); }
  }, []);

  const handleAddProjectToWorkspace = useCallback(() => {
    setSysBrowser({ isOpen:true, path: activeProjects[0] || '/', items:[] });
    handleBrowse(activeProjects[0] || '/');
  }, [activeProjects, handleBrowse]);

  const handleSaveWorkspace = useCallback(() => {
    localStorage.setItem('active_projects', JSON.stringify(activeProjects));
    alert('Workspace paths saved to local storage.');
  }, [activeProjects]);

  const triggerMonacoAction = useCallback((id: string) => {
    if (monacoEditorRef.current) {
      monacoEditorRef.current.trigger('menu', id);
      monacoEditorRef.current.focus();
    }
  }, []);

  const saveToDisk = async (tabId: string) => {
    const tab = openTabs.find(t => t.id === tabId);
    if (!tab) return;
    try {
      setPipelineStatus('running');
      const gatewayKey = localStorage.getItem('archon_gateway_key') || '';
      const res = await fetch('http://localhost:3005/api/execute/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Archon-Gateway-Key': gatewayKey },
        body: JSON.stringify({ file_path: tab.name, content: tab.content }),
      });
      if (res.ok) {
        setPipelineStatus('success');
        setTermOutput(p => [...p, `✓ Saved ${tab.name} to disk.`]);
      } else {
        throw new Error(`Server returned ${res.status}`);
      }
    } catch (err) {
      setPipelineStatus('fail');
      setTermOutput(p => [...p, `✖ Failed to save ${tab.name}: ${err}`]);
    }
  };

  const handleNewTerminal = useCallback(() => {
    const id = `term-${Date.now()}`;
    setTermSessions(p => [...p, { id, name: 'bash', cwd: termCwd }]);
    setActiveSessionId(id);
    setActiveTermTab('terminal');
    setIsTerminalVisible(true);
  }, [termCwd]);

  const executeShell = useCallback(async (cmd: string) => {
    const c = cmd.trim();
    if (!c) return;
    setTermOutput(p => [...p, `$ ${c}`]);
    setPipelineStatus('running');
    const ctrl = new AbortController();
    abortTermRef.current = ctrl;
    try {
      const res = await fetch(`${ARCHON_BACKEND_URL}/api/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-archon-gateway-key': localStorage.getItem('archon_gateway_key') || ''
        },
        signal: ctrl.signal,
        body: JSON.stringify({ command: c, cwd: termCwd })
      });
      const data = await res.json();
      if (data.stdout) {
        setTermOutput(p => [...p, data.stdout]);
        if (c.includes('--format json')) {
          try {
            const clean = data.stdout.substring(data.stdout.indexOf('['));
            const parsed = JSON.parse(clean);
            const found = parsed.flatMap((f:any) => (f.messages||[]).map((m:any)=>({
              file: f.filePath.split(/[/\\]/).pop(), line: m.line, msg: m.message, type: m.severity===2?'error':'warn'
            })));
            setLinterProblems(found);
            if(found.length > 0) setActiveTermTab('problems');
          } catch(e) { console.warn('JSON parse failed', e); }
        }
      }
      if (data.stderr) {
        setTermOutput(p => [...p, `Error: ${data.stderr}`]);
        setPipelineStatus('fail');
      } else {
        setPipelineStatus('success');
      }
      if (data.newCwd) setTermCwd(data.newCwd);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setTermOutput(p => [...p, `Network Error: ${String(e)}`]);
      setPipelineStatus('fail');
    } finally {
      if (abortTermRef.current === ctrl) abortTermRef.current = null;
    }
  }, [termCwd]);

  const handleTermCmd = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const cmd = termInput.trim();
    setTermInput('');
    if (cmd === 'clear' || cmd === 'cls') { setTermOutput([]); return; }
    executeShell(cmd);
  }, [termInput, executeShell]);

  // ── Problem Scanner ───────────────────────────────────────────
  React.useEffect(() => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (!tab) { setProblems([]); return; }
    const lines = tab.content.split('\n');
    const detected: {file:string; line:number; msg:string; type:'error'|'warn'}[] = [];
    lines.forEach((l, i) => {
      if (l.includes('TODO') || l.includes('FIXME')) {
        detected.push({ file: tab.name, line: i + 1, msg: l.trim(), type: 'warn' });
      }
      // Simple syntax hint (e.g. adjacent JSX elem pattern if looking for common IDE bugs)
      if (l.includes('<>') && !tab.content.includes('</>')) {
        // detected.push({ file: tab.name, line: i + 1, msg: 'Possible unclosed fragment', type: 'error' });
      }
    });
    setProblems([...detected, ...linterProblems]);
  }, [activeTabId, openTabs, linterProblems]);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const res = await fetch(`${ARCHON_BACKEND_URL}/api/execute/search?q=${encodeURIComponent(q)}`, {
        headers: { 'x-archon-gateway-key': localStorage.getItem('archon_gateway_key') || '' }
      });
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.results);
      }
    } catch (e) { console.error('Search failed', e); }
    finally { setIsSearching(false); }
  }, []);


  // ── UI Components ──────────────────────────────────────────────

  const [activeDropdown, setActiveDropdown] = useState<string|null>(null);

  const renderTopMenu = () => {
    const menus: Record<string, { label: string; action?: () => void; shortcut?: string; divider?: boolean }[]> = {
      'File': [
        { label: 'New Text File', action: handleNewFile, shortcut: 'Ctrl+N' },
        { label: 'New File...', action: handleNewFile },
        { label: 'New Folder...', action: handleNewFolder },
        { label: '', divider: true },
        { label: 'Save to Disk (Sync)', action: () => activeTabId && saveToDisk(activeTabId), shortcut: 'Ctrl+S' },
        { label: 'Add Folder to Workspace...', action: handleAddProjectToWorkspace },
        { label: 'Save Workspace As...', action: handleSaveWorkspace },
        { label: '', divider: true },
        { label: 'Export All (Archive)', action: handleExportAll },
        { label: '', divider: true },
        { label: 'Import Files...', action: () => { handleImportFile({target:{files:null}} as any); } },
        { label: 'Import Folder...', action: () => { handleImportFolder({target:{files:null}} as any); } },
      ],
      'Edit': [
        { label: 'Undo', action: () => triggerMonacoAction('undo'), shortcut: 'Ctrl+Z' },
        { label: 'Redo', action: () => triggerMonacoAction('redo'), shortcut: 'Ctrl+Y' },
        { label: '', divider: true },
        { label: 'Cut', action: () => triggerMonacoAction('editor.action.clipboardCutAction'), shortcut: 'Ctrl+X' },
        { label: 'Copy', action: () => triggerMonacoAction('editor.action.clipboardCopyAction'), shortcut: 'Ctrl+C' },
        { label: 'Paste', action: () => triggerMonacoAction('editor.action.clipboardPasteAction'), shortcut: 'Ctrl+V' },
        { label: '', divider: true },
        { label: 'Find', action: () => triggerMonacoAction('actions.find'), shortcut: 'Ctrl+F' },
        { label: 'Replace', action: () => triggerMonacoAction('editor.action.startFindReplaceAction'), shortcut: 'Ctrl+H' },
      ],
      'Selection': [
        { label: 'Select All', action: () => triggerMonacoAction('editor.action.selectAll'), shortcut: 'Ctrl+A' },
        { label: 'Expand Selection', action: () => triggerMonacoAction('editor.action.smartSelect.expand'), shortcut: 'Shift+Alt+Right' },
        { label: 'Shrink Selection', action: () => triggerMonacoAction('editor.action.smartSelect.shrink'), shortcut: 'Shift+Alt+Left' },
      ],
      'View': [
        { label: isSidebarVisible ? 'Hide Sidebar' : 'Show Sidebar', action: () => setIsSidebarVisible(!isSidebarVisible), shortcut: 'Ctrl+B' },
        { label: isTerminalVisible ? 'Hide Terminal' : 'Show Terminal', action: () => setIsTerminalVisible(!isTerminalVisible), shortcut: 'Ctrl+`' },
        { label: 'Reset Layout', action: () => { explorer.onMouseDown({ clientX: 240 } as any); terminal.onMouseDown({ clientY: 180 } as any); } },
      ],
      'Go': [
        { label: 'Go to File...', action: () => setQuickOpen({isOpen:true, query:''}), shortcut: 'Ctrl+P' },
        { label: 'Go to Symbol...', action: () => triggerMonacoAction('editor.action.gotoSymbol'), shortcut: 'Ctrl+Shift+O' },
        { label: 'Go to Line...', action: () => triggerMonacoAction('workbench.action.gotoLine'), shortcut: 'Ctrl+G' },
      ],
      'Run': [
        { label: projectScripts[0] ? `Run: ${projectScripts[0]}` : 'Run Project', action: () => projectScripts[0] && executeShell(projectScripts[0]), shortcut: 'F5' },
        { label: 'Run Without Debugging', action: () => projectScripts[0] ? executeShell(projectScripts[0]) : alert('No run script detected.'), shortcut: 'Ctrl+F5' },
        { label: 'Stop', action: () => { abortTermRef.current?.abort(); setTermOutput(p => [...p, '^C (Process Stopped)']); }, shortcut: 'Shift+F5' },
        { label: '', divider: true },
        ...projectScripts.slice(1).map(s => ({ label: `Run: ${s}`, action: () => executeShell(s) })),
      ],
      'Terminal': [
        { label: 'New Terminal', action: handleNewTerminal, shortcut: 'Ctrl+Shift+`' },
        { label: 'Clear Terminal', action: () => { setTermOutput([]); setTermInput(''); }, shortcut: 'Ctrl+L' },
      ],
      'Help': [
        { label: 'Welcome', action: () => alert('Welcome to xDragon Sovereign IDE') },
        { label: 'Documentation', action: () => window.open('https://github.com/TheLionKing7/xdragon', '_blank') },
        { label: 'About', action: () => alert('xDragon Sovereign IDE v1.2\nSovereign Dev Ecosystem') },
      ]
    };

    return (
      <div style={{ height: 35, background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 14, flexShrink: 0, zIndex: 1000, position: 'relative' }}>
        <div style={{ color: T.gold, fontSize: '0.9rem', fontWeight: 'bold' }}>⬡</div>
        {Object.keys(menus).map(m => (
          <div key={m} style={{ position: 'relative' }}>
            <div style={{ ...mono, fontSize: '0.64rem', color: activeDropdown === m ? T.text : T.textMuted, cursor: 'pointer', padding: '4px 8px', borderRadius: 4, background: activeDropdown === m ? T.surface3 : 'transparent' }}
              onClick={() => setActiveDropdown(activeDropdown === m ? null : m)}
              onMouseEnter={() => { if(activeDropdown) setActiveDropdown(m); }}>
              {m}
            </div>
            {activeDropdown === m && (
              <div style={{ position: 'absolute', top: 32, left: 0, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '4px 0', minWidth: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 1001 }}>
                {menus[m].map((item, i) => (
                  item.divider ? (
                    <div key={i} style={{ height: 1, background: T.border, margin: '4px 0' }} />
                  ) : (
                    <div key={i} onClick={() => { item.action?.(); setActiveDropdown(null); }}
                      style={{ padding: '6px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = T.surface3}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <span style={{ ...mono, fontSize: '0.62rem', color: T.text }}>{item.label}</span>
                      {item.shortcut && <span style={{ ...mono, fontSize: '0.52rem', color: T.textDim, marginLeft: 12 }}>{item.shortcut}</span>}
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        ))}
        {activeDropdown && <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setActiveDropdown(null)} />}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ ...mono, fontSize: '0.6rem', color: T.textMuted, background: T.surface2, padding: '3px 24px', borderRadius: 4, border: `1px solid ${T.border}` }}>
            {activeTabId ? openTabs.find(t=>t.id===activeTabId)?.name : 'Archon Workspace'} - Code Studio
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ ...mono, fontSize: '0.55rem', color: pipelineStatus === 'success' ? T.green : pipelineStatus === 'fail' ? T.red : T.textDim, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.45rem' }}>{pipelineStatus === 'running' ? '◌' : '●'}</span>
            {pipelineStatus === 'running' ? 'BUILDING' : pipelineStatus === 'idle' ? 'STANDBY' : pipelineStatus.toUpperCase()}
          </div>
          <div style={{ ...mono, fontSize: '0.55rem', color: T.textDim, letterSpacing: '0.1em' }}>
            {detectedType.toUpperCase()} IDE v1.2
          </div>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: isHealthy ? T.green : T.red, boxShadow: isHealthy ? `0 0 8px ${T.green}44` : 'none' }} />
        </div>
      </div>
    );
  };

  const renderActivityBar = () => (
    <div style={{ width: 50, background: T.black, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, gap: 24, flexShrink: 0 }}>
      {[
        { id: 'workspace', icon: '📁', label: 'Workspace' },
        { id: 'preview', icon: '🌐', label: 'Preview' },
        { id: 'git', icon: '⬡', label: 'Source Control' },
        { id: 'ai', icon: '◈', label: 'AI Studio' },
        { id: 'settings', icon: '⚙', label: 'Settings' },
      ].map(item => (
        <div key={item.id} onClick={() => {
          setActiveActivity(item.id as any);
          if (item.id === 'ai') setMode('ai');
          else if (item.id === 'git') setMode('git');
          else setMode('ide');
        }}
          style={{ fontSize: '1.25rem', cursor: 'pointer', opacity: activeActivity === item.id ? 1 : 0.4, 
            borderLeft: `2px solid ${activeActivity === item.id ? T.gold : 'transparent'}`, 
            paddingLeft: activeActivity === item.id ? 0 : 2, 
            color: activeActivity === item.id ? T.gold : T.textMuted,
            width: '100%', textAlign: 'center', transition: 'all 0.2s' }}
          title={item.label}>
          {item.icon}
        </div>
      ))}
    </div>
  );

  // ── Kanban move ────────────────────────────────────────────────
  const moveCard = useCallback((id: string, direction: 'left'|'right') => {
    const cols: KanbanCol[] = ['backlog','todo','doing','review','done'];
    setKanban(cards => cards.map(c => {
      if (c.id !== id) return c;
      const idx = cols.indexOf(c.col);
      const next = cols[direction==='right' ? Math.min(idx+1,4) : Math.max(idx-1,0)];
      return {...c, col:next};
    }));
  }, []);

  // ── Add ceremony ───────────────────────────────────────────────
  const addCeremony = useCallback((type: keyof typeof CEREMONY_TEMPLATES) => {
    const c: Ceremony = {
      id: `c-${Date.now()}`, type, agent: activeAgentId,
      date: new Date().toLocaleDateString('en-GB'),
      notes: CEREMONY_TEMPLATES[type], venture: 'Archon Nexus',
    };
    setCeremonies(p => [c, ...p]);
  }, [activeAgentId]);

  // ── Shared styles ──────────────────────────────────────────────
  const btn = (active=false, color=T.gold): React.CSSProperties => ({
    ...mono, fontSize:'0.56rem', padding:'4px 10px', borderRadius:3, cursor:'pointer',
    background: active ? color+'22' : 'transparent',
    border:`1px solid ${active ? color : T.border}`,
    color: active ? color : T.textMuted,
  });
  const pill = (color: string): React.CSSProperties => ({
    ...mono, fontSize:'0.5rem', padding:'1px 7px', borderRadius:10, border:`1px solid ${color}44`,
    background:`${color}18`, color,
  });
  const inputSt: React.CSSProperties = {
    ...mono, background:T.surface, border:`1px solid ${T.border}`, color:T.text,
    fontSize:'0.64rem', padding:'6px 10px', borderRadius:3, outline:'none', width:'100%',
  };

  // Priority colors
  const prioColor = (p: KanbanCard['priority']): string =>
    ({critical:T.red, high:T.orange, normal:T.gold, low:T.textMuted})[p];

  // ── Mode strip ─────────────────────────────────────────────────
  const renderModeStrip = () => (
    <div style={{flexShrink:0, height:34, background:T.surface, borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', padding:'0 12px', gap:12, justifyContent:'space-between'}}>
      <div style={{display:'flex', gap:8}}>
        {([['ai','◈ AI',T.gold],['ide','◉ IDE',T.teal],['blueprint','⬡ BLUEPRINT',T.purple],['git','⊕ GIT',T.green]] as const).map(([id,label,color]) => (
          <button key={id} onClick={() => setMode(id)}
            style={{...mono, fontSize:'0.54rem', padding:'2px 8px', background:'transparent', border:'none',
              borderBottom:`2px solid ${mode===id ? color : 'transparent'}`,
              color: mode===id ? color : T.textMuted, cursor:'pointer'}}>
            {label}
          </button>
        ))}
      </div>
      <div style={{display:'flex', gap:6, alignItems:'center'}}>
        <button onClick={handleNewFile} style={btn(false, T.gold)} title="New file">+ New</button>
        <button onClick={() => {
          const tab = openTabs.find(t => t.id === activeTabId);
          if (tab) {
             setTermOutput(p => [...p, `$ node ${tab.name}`]);
             handleTermCmd({ key: 'Enter', target: { value: `node ${tab.name}` } } as any);
          }
        }} style={btn(false, T.green)} title="Run current file">▶ Run</button>
        <button onClick={() => setImportModal(true)} style={btn(false, T.green)} title="Clone from GitHub">⊕ GitHub</button>
      </div>
    </div>
  );

  // ── AI MODE ────────────────────────────────────────────────────
  const renderAI = () => (
    <div style={{flex:1, display:'flex', overflow:'hidden'}}>
      {/* Main AI workspace */}
      <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
        {/* OUTPUT — top */}
        <div ref={outputRef} style={{flex:1, overflowY:'auto', padding:'14px 16px', background:T.surface2, borderBottom:`1px solid ${T.border}`}}>
          {error && <div style={{...pill(T.red), display:'inline-block', marginBottom:10}}>✗ {error}</div>}
          {!output && !loading && (
            <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12}}>
              <div style={{color:T.gold, fontSize:'1.4rem'}}>◈</div>
              <div style={{...mono, fontSize:'0.7rem', color:T.textMuted}}>AYO is ready — describe what to build</div>
              <div style={{...mono, fontSize:'0.58rem', color:T.textDim}}>Output appears here · Auto-saved to Sovereign Vault</div>
            </div>
          )}
          {loading && !output && <div style={{...mono, fontSize:'0.65rem', color:T.gold}}>◌ Generating...</div>}
          {output && (
            <pre style={{...mono, fontSize:'0.68rem', lineHeight:1.8, color:T.text, whiteSpace:'pre-wrap', margin:0}}>
              {output}
            </pre>
          )}
          {output && !loading && (
            <div style={{display:'flex', gap:8, marginTop:12, flexWrap:'wrap'}}>
              <button onClick={() => {
                const match = output.match(/```[\w]*\n?([\s\S]*?)```/);
                const code = match?.[1] || output;
                const name = output.match(/\/\/ (.+\.tsx?)/)?.[1] || `generated-${Date.now()}.ts`;
                onOpenTab({id:`gen-${Date.now()}`, name, content:code, lang:detectLang(name), modified:true});
                setActiveTabId(`gen-${Date.now()-1}`); setMode('ide');
              }} style={btn(false,T.teal)}>→ Open in IDE</button>
              <button onClick={() => SovereignVault.store({title:prompt.substring(0,60), category:'codebase', content:output, agentId:activeAgentId, tags:[activeAgentId]}).then(()=>{})} style={btn(false,T.sage)}>◈ Save to Vault</button>
              <button onClick={() => navigator.clipboard.writeText(output)} style={btn()}>⎘ Copy</button>
              <button onClick={() => {setOutput(''); setPrompt('');}} style={btn()}>✕ Clear</button>
            </div>
          )}
        </div>

        {/* PROMPT — bottom */}
        <div style={{flexShrink:0, padding:'10px 14px', borderTop:`1px solid ${T.border}`, background:T.black}}>
          {/* Quick actions */}
          <div style={{display:'flex', gap:5, flexWrap:'wrap', marginBottom:8}}>
            {[
              ['Generate Component', 'Generate a production-ready React TypeScript component:\n\nComponent name:\nProps:\nBehavior:\n\nRequirements: inline styles only, monospace font, xDragon design tokens.'],
              ['Architect System',   'Design a system architecture:\n\nSystem:\nRequirements:\nConstraints:\n\nOutput: component diagram, data flow, technology decisions, key interfaces.'],
              ['Write Tests',        'Write comprehensive tests:\n\nFile/function to test:\nTest framework: vitest\n\nCover: happy path, edge cases, error states.'],
              ['Refactor',           'Refactor this code for production quality:\n\nCode to refactor:\n\nGoals: performance, type safety, readability, error handling.'],
              ['Review & Audit',     'Code review and security audit:\n\nCode:\n\nCheck: security, performance, TypeScript correctness, edge cases.'],
              ['Write Docs',         'Write technical documentation:\n\nCode/system to document:\n\nInclude: overview, API reference, usage examples, deployment notes.'],
              ['Railway Config',     'Generate Railway deployment configuration for:\n\nApp type:\nServices:\nEnv vars needed:\n\nOutput: railway.toml + environment variable list.'],
              ['MongoDB Schema',     'Design MongoDB schema for:\n\nData model:\nAccess patterns:\n\nOutput: collection definitions, indexes, TypeScript interfaces.'],
            ].map(([label, tmpl]) => (
              <button key={label as string} onClick={() => setPrompt(tmpl as string)}
                style={{...mono, fontSize:'0.52rem', padding:'3px 8px', background:T.surface3, border:`1px solid ${T.border}`, color:T.textMuted, cursor:'pointer', borderRadius:3}}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color=T.gold; (e.currentTarget as HTMLElement).style.borderColor=T.goldDim; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color=T.textMuted; (e.currentTarget as HTMLElement).style.borderColor=T.border; }}>
                {label as string}
              </button>
            ))}
          </div>

          {/* Agent selector */}
          <div style={{display:'flex', gap:8, marginBottom:8, alignItems:'center'}}>
            <select value={activeAgentId} onChange={e => setActiveAgentId(e.target.value)}
              style={{background:T.surface2, border:`1px solid ${T.border}`, color:T.text, ...mono, fontSize:'0.6rem', padding:'3px 8px', borderRadius:3, outline:'none'}}>
              <option value="AYO">AYO — CTO (Code)</option>
              <option value="ARCHON">ARCHON — CEO (Architecture)</option>
              <option value="MODEBOLA">MODEBOLA — CoS (Documentation)</option>
            </select>
            <div style={{display:'flex', alignItems:'center', gap:6, marginLeft:'auto', ...mono, fontSize:'0.58rem', color:T.textMuted}}>
              <span>Temp: <span style={{color:T.gold}}>{temperature.toFixed(1)}</span></span>
              <input type="range" min="0" max="1" step="0.05" value={temperature}
                onChange={e => setTemperature(parseFloat(e.target.value))}
                style={{width:80, accentColor:T.gold}} />
            </div>
          </div>

          {/* Prompt textarea */}
          <div style={{display:'flex', gap:8}}>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="Describe what to build, review, or architect..."
              onKeyDown={e => { if(e.key==='Enter' && e.metaKey) handleExecute(); }}
              style={{flex:1, ...inputSt, minHeight:72, resize:'vertical'}} />
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              <button onClick={() => handleExecute()} disabled={!isHealthy||loading}
                style={{...btn(true,T.gold), padding:'8px 14px', fontSize:'0.64rem', opacity:(!isHealthy||loading)?0.5:1}}>
                {loading ? '◌' : '▶'}
              </button>
              <button onClick={() => { abortRef.current?.abort(); setLoading(false); }} disabled={!loading}
                style={{...btn(false,T.red), padding:'8px 10px', opacity:!loading?0.4:1}}>■</button>
            </div>
          </div>
          <div style={{...mono, fontSize:'0.5rem', color:T.textDim, marginTop:4}}>⌘↵ to execute · Output auto-saved to Sovereign Vault when &gt;100 chars</div>
        </div>
      </div>
    </div>
  );

  // ── IDE MODE ───────────────────────────────────────────────────
  const renderIDE = () => (
    <div style={{flex:1, display:'flex', overflow:'hidden', background: T.black}}>
      {renderActivityBar()}

      {/* Sidebar Panel */}
      {isSidebarVisible && (
        <React.Fragment>
          <div style={{width:explorer.size, flexShrink:0, borderRight:`1px solid ${T.border}`, background:T.surface, display:'flex', flexDirection:'column'}}>
            {/* Code Search Header */}
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}`, background: T.surface2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: '0.9rem', color: T.gold }}>🔍</span>
                <span style={{ ...mono, fontSize: '0.68rem', color: T.text, fontWeight: 700, letterSpacing: '0.1em' }}>CODE SEARCH</span>
              </div>
              <input
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); handleSearch(e.target.value); if(e.target.value) setActiveSidebarTab('search'); }}
                placeholder="Search symbols, text, files..."
                style={{ ...inputSt, fontSize: '0.62rem', background: T.black, border: `1px solid ${T.goldDim}` }}
              />
            </div>

            {/* Workspace / Preview Sub-tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, height: 32 }}>
              <button onClick={() => setActiveSidebarTab('workspace')}
                style={{ flex: 1, background: activeSidebarTab === 'workspace' ? T.surface3 : 'transparent', border: 'none', 
                  color: activeSidebarTab === 'workspace' ? T.gold : T.textMuted, cursor: 'pointer', ...mono, fontSize: '0.55rem',
                  borderBottom: activeSidebarTab === 'workspace' ? `2px solid ${T.gold}` : 'none' }}>
                WORKSPACE
              </button>
              <button onClick={() => setActiveSidebarTab('preview')}
                style={{ flex: 1, background: activeSidebarTab === 'preview' ? T.surface3 : 'transparent', border: 'none', 
                  color: activeSidebarTab === 'preview' ? T.gold : T.textMuted, cursor: 'pointer', ...mono, fontSize: '0.55rem',
                  borderBottom: activeSidebarTab === 'preview' ? `2px solid ${T.gold}` : 'none' }}>
                PREVIEW
              </button>
            </div>

            {activeSidebarTab === 'workspace' ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}44`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.surface2 }}>
                  <span style={{ ...mono, fontSize: '0.52rem', color: T.textDim, fontWeight: 'bold' }}>PROJECTS</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={handleNewFile} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: '0.8rem' }} title="New File">+</button>
                    <button onClick={handleNewFolder} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: '0.8rem' }} title="New Folder">📁</button>
                    <button onClick={() => refreshFileTree()} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: '0.8rem' }} title="Refresh">↻</button>
                  </div>
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
                  {activeProjects.map(pPath => (
                    <div key={pPath}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: T.surface3, borderTop: `1px solid ${T.border}22`, borderBottom: `1px solid ${T.border}22`, marginTop: pPath === activeProjects[0] ? 0 : 8 }}>
                        <span style={{ fontSize: '0.7rem' }}>📦</span>
                        <span style={{ ...mono, fontSize: '0.62rem', color: T.teal, fontWeight: 'bold' }}>{pPath.split('/').pop() || pPath}</span>
                      </div>
                      <FileTree nodes={fileTree.filter(n => n.id.startsWith(pPath))} activeId={activeTabId}
                        onOpen={handleOpenFile} onToggle={toggleFolder} onDelete={deleteFromTree} />
                    </div>
                  ))}
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: T.surface3, borderTop: `1px solid ${T.border}22`, borderBottom: `1px solid ${T.border}22`, marginTop: 12 }}>
                    <span style={{ fontSize: '0.7rem' }}>🛡️</span>
                    <span style={{ ...mono, fontSize: '0.62rem', color: T.purple, fontWeight: 'bold' }}>archon-nexus</span>
                  </div>
                  <div style={{ padding: '8px 24px', ...mono, fontSize: '0.56rem', color: T.textDim, fontStyle: 'italic' }}>
                    (Linked project - connect to sync)
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', ...mono, fontSize: '0.52rem', color: T.textDim, background: T.surface2, display: 'flex', justifyContent: 'space-between' }}>
                  <span>LITE BROWSER</span>
                  <span style={{ color: T.green }}>LIVE</span>
                </div>
                <div style={{ padding: '8px 10px', background: T.surface, borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input defaultValue="http://localhost:3000" style={{ ...inputSt, fontSize: '0.54rem', padding: '3px 8px', flex: 1 }} />
                  <div style={{ display: 'flex', gap: 2 }}>
                    {([['📱','375px'],['tablet','768px'],['🖥️','100%']] as const).map(([icon, width]) => (
                      <button key={width} onClick={() => setPreviewWidth(width)}
                        style={{ ...btn(previewWidth===width, T.teal), padding: '2px 6px' }}>{icon}</button>
                    ))}
                  </div>
                  <button style={btn(false, T.teal)}>↻</button>
                </div>
                <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', background: T.black, padding: 10 }}>
                  <div style={{ width: previewWidth, maxWidth: '100%', height: '100%', background: '#fff', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: '0.64rem', flexDirection: 'column', gap: 12, transition: 'width 0.3s', overflow: 'hidden' }}>
                    <div style={{ fontSize: '1.5rem' }}>🌐</div>
                    <div style={{ textAlign: 'center', padding: '0 20px' }}>
                      Previewing DevOps & App Instance.<br/>
                      <span style={{ color: T.textMuted, fontSize: '0.54rem' }}>{previewWidth === '100%' ? 'Desktop View' : `Mobile View (${previewWidth})`}</span>
                    </div>
                    <button onClick={() => window.open('http://localhost:3000', '_blank')} style={{ ...btn(true, T.teal), padding: '4px 12px', borderRadius: 4 }}>
                      Open in New Tab
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div onMouseDown={explorer.onMouseDown} style={{width:2, background:T.border, cursor:'col-resize', flexShrink:0}} />
        </React.Fragment>
      )}

      {/* Editor + terminal container */}
      <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
        {/* Tab bar */}
        <div style={{display:'flex', background:T.surface, borderBottom:`1px solid ${T.border}`, overflowX:'auto', flexShrink:0, height:34, alignItems:'center'}}>
          {openTabs.map(t => (
            <div key={t.id} onClick={() => setActiveTabId(t.id)}
              style={{display:'flex', alignItems:'center', gap:5, padding:'0 12px', height:34, cursor:'pointer', flexShrink:0,
                borderRight:`1px solid ${T.border}`,
                background:activeTabId===t.id?T.black:T.surface,
                borderTop:`2px solid ${activeTabId===t.id?T.gold:'transparent'}`}}>
              <span style={{fontSize:'0.65rem'}}>{fileIcon(t.name,false)}</span>
              <span style={{...mono, fontSize:'0.6rem', color:activeTabId===t.id?T.text:T.textMuted}}>{t.name}</span>
              {t.id.startsWith('arch-') && <span title="Agent Generated - unsynced" style={{ color: T.gold, fontSize: '0.45rem', marginLeft: 4 }}>●</span>}
              <span onClick={e=>{e.stopPropagation(); onCloseTab(t.id);}} style={{color:T.textDim, fontSize:'0.75rem', marginLeft:6, cursor:'pointer'}}>×</span>
            </div>
          ))}
          {openTabs.length===0 && <span style={{...mono, fontSize:'0.58rem', color:T.textDim, padding:'0 12px'}}>No open files — import or create a new file</span>}
        </div>

        <div style={{flex:1, background:T.black, display: 'flex', flexDirection: 'column', overflow:'hidden'}}>
          {activeTabId && (
            <div style={{ height: 26, background: T.surface2, borderBottom: `1px solid ${T.border}44`, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6 }}>
              <span style={{ fontSize: '0.6rem', color: T.textDim }}>{activeProjects[0]?.split('/').pop() || 'work'}</span>
              <span style={{ fontSize: '0.6rem', color: T.textDim }}>›</span>
              <span style={{ ...mono, fontSize: '0.58rem', color: T.gold }}>{openTabs.find(t=>t.id===activeTabId)?.name || '' }</span>
            </div>
          )}
          {activeTabId ? (
            <Editor height="100%"
              language={openTabs.find(t=>t.id===activeTabId)?.lang||'plaintext'}
              value={openTabs.find(t=>t.id===activeTabId)?.content||''}
              theme="vs-dark"
              onMount={(editor) => { monacoEditorRef.current = editor; }}
              onChange={val => onUpdateContent(activeTabId, val||'')}
              options={{
                fontSize: 13,
                fontFamily: '"Menlo","Monaco","Consolas","Courier New",monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                glyphMargin: true,
                folding: true,
                lineDecorationsWidth: 10,
                lineNumbersMinChars: 3,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
              }}
            />
          ) : (
            <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:16}}>
              <div style={{color:T.teal, fontSize:'2rem'}}>◉</div>
              <div style={{...mono, fontSize:'0.72rem', color:T.textMuted}}>No file open</div>
              <div style={{display:'flex', gap:8}}>
                <button onClick={() => fileInputRef.current?.click()} style={btn(false,T.teal)}>⬆ Import files</button>
                <button onClick={() => folderInputRef.current?.click()} style={btn(false,T.blue)}>⬆ Import folder</button>
                <button onClick={handleNewFile} style={btn(false,T.gold)}>+ New file</button>
                <button onClick={() => setMode('ai')} style={btn(false,T.purple)}>◈ Generate with AI</button>
              </div>
            </div>
          )}
        </div>

        {/* Terminal panel */}
        {isTerminalVisible && (
          <React.Fragment>
            <div onMouseDown={terminal.onMouseDown} style={{height:4, background:T.border, cursor:'row-resize', flexShrink:0, transition:'background 0.15s'}}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background=T.teal}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background=T.border} />
            <div style={{height:terminal.size, flexShrink:0, background:T.black, display:'flex', flexDirection:'column', borderTop:`1px solid ${T.border}`}}>
              <div style={{display:'flex', background:T.surface2, flexShrink:0, borderBottom:`1px solid ${T.border}`, alignItems:'center'}}>
                {(['terminal','output','problems','lint'] as const).map(t => (
                  <button key={t} onClick={() => setActiveTermTab(t)}
                    style={{...mono, fontSize:'0.56rem', padding:'4px 12px', background:'transparent', border:'none',
                      borderBottom:`2px solid ${activeTermTab===t?T.teal:'transparent'}`,
                      color:activeTermTab===t?T.teal:T.textMuted, cursor:'pointer', textTransform:'uppercase', letterSpacing:'0.08em'}}>
                    {t} {t==='problems' && problems.length > 0 && <span style={{color:T.red, fontSize:'0.5rem'}}>({problems.length})</span>}
                    {t==='lint' && pipelineStatus === 'running' && <span style={{color:T.gold, fontSize:'0.5rem'}}> (Scanning...)</span>}
                  </button>
                ))}
                
                {activeTermTab === 'terminal' && (
                  <div style={{ display: 'flex', gap: 2, marginLeft: 12, borderLeft: `1px solid ${T.border}`, paddingLeft: 12 }}>
                    {termSessions.map((s, idx) => (
                      <button key={idx} onClick={() => setActiveSessionId(s.id)}
                        style={{ ...mono, fontSize: '0.5rem', padding: '2px 8px', borderRadius: 2, border: 'none',
                          background: activeSessionId === s.id ? T.surface3 : 'transparent',
                          color: activeSessionId === s.id ? T.gold : T.textDim, cursor: 'pointer' }}>
                        bash{idx > 0 ? ` (${idx+1})` : ''}
                      </button>
                    ))}
                    <button onClick={handleNewTerminal} style={{ ...btn(), padding: '0 6px', fontSize: '0.6rem' }} title="New Session">+</button>
                  </div>
                )}

                <div style={{marginLeft:'auto', display:'flex', gap:6, paddingRight:8, alignItems: 'center'}}>
                  <div style={{...mono, fontSize:'0.5rem', marginRight: 8, color: pipelineStatus==='success' ? T.green : pipelineStatus==='fail' ? T.red : T.textDim}}>
                    {pipelineStatus==='running' ? '● RUNNING' : pipelineStatus==='success' ? '✓ SUCCESS' : pipelineStatus==='fail' ? '✖ FAIL' : 'IDLE'}
                  </div>
                  <button onClick={() => {
                    const tab = openTabs.find(t => t.id === activeTabId);
                    if (tab) executeShell(`node ${tab.name}`);
                  }} style={{ ...btn(), color: T.green, borderColor: `${T.green}44` }} title="Run Active File">▶</button>
                  <button onClick={() => { abortTermRef.current?.abort(); setTermOutput(p => [...p, '^C (Process Killed)']); }} style={{ ...btn(), color: T.red, borderColor: `${T.red}44` }} title="Kill Process">■</button>
                  <button onClick={() => setTermOutput([])} style={btn()} title="Clear Console">✕</button>
                </div>
              </div>
              {activeTermTab==='terminal' && (
                <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
                  <div style={{flex:1, overflowY:'auto', padding:'6px 10px', ...mono, fontSize:'0.62rem'}}>
                    {termOutput.map((l,i) => <div key={i} style={{color:l.startsWith('$ ✗')?T.red:l.startsWith('$ ✓')?T.green:l.startsWith('$')?T.teal:T.textMuted, lineHeight:1.8}}>{l}</div>)}
                  </div>
                  <div style={{display:'flex', alignItems:'center', padding:'4px 10px', borderTop:`1px solid ${T.border}`, background:T.surface}}>
                    <span style={{color:T.green, ...mono, fontSize:'0.58rem', marginRight:4, flexShrink:0}}>{termCwd.split('/').pop() || '~'}$</span>
                    <input value={termInput} onChange={e=>setTermInput(e.target.value)} onKeyDown={handleTermCmd}
                      placeholder="Type a command... (help for list)" style={{flex:1, background:'transparent', border:'none', color:T.text, ...mono, fontSize:'0.62rem', outline:'none'}} />
                  </div>
                </div>
              )}
              {activeTermTab==='output' && (
                <div style={{flex:1, padding:'8px 10px', ...mono, fontSize:'0.62rem', color:T.textMuted, overflowY:'auto'}}>
                  <div style={{color:T.green}}>✓ TypeScript compiled — 0 errors</div>
                  <div style={{color:T.green}}>✓ Vite HMR running on port 5173</div>
                  <div>Bundle: {openTabs.length} modules open</div>
                </div>
              )}
              {activeTermTab==='problems' && (
                <div style={{flex:1, padding:'8px 10px', ...mono, fontSize:'0.62rem', overflowY:'auto'}}>
                  {problems.length === 0 ? (
                    <div style={{color:T.green}}>✓ No problems detected in open files.</div>
                  ) : (
                    problems.map((p,i) => (
                      <div key={i} style={{marginBottom:4, color:p.type==='error'?T.red:T.gold}}>
                        {p.type==='error'?'✖':'⚠'} {p.file}:{p.line} — {p.msg}
                      </div>
                    ))
                  )}
                </div>
              )}
              {activeTermTab==='lint' && (
                <div style={{flex:1, padding:'8px 10px', ...mono, fontSize:'0.62rem', overflowY:'auto'}}>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
                    <div style={{color:T.gold}}>◈ ESLint / Linter Diagnostics</div>
                    <button onClick={() => executeShell('npx eslint . --format json')} style={btn(false, T.teal)}>Scan Workspace</button>
                  </div>
                  <div style={{color:T.textDim}}>Click 'Scan Workspace' to run integrated linting via Archon Executor.</div>
                </div>
              )}
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );

  // ── BLUEPRINT MODE ─────────────────────────────────────────────
  const renderBlueprint = () => (
    <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
      {/* Blueprint sub-nav */}
      <div style={{flexShrink:0, padding:'0 16px', background:T.surface2, borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:0, height:38}}>
        {[
          [['sprint','◈ Sprint Board',T.gold],['kanban','⬡ Kanban Flow',T.teal],['pipeline','⊕ Innovation Pipeline',T.purple],['ceremonies','◎ Ceremonies',T.sage]].map(([id,label,color]) => (
            <button key={id} onClick={() => setBpView(id)}
              style={{...mono, fontSize:'0.58rem', padding:'0 14px', height:38, background:'transparent', border:'none',
                borderBottom:`2px solid ${bpView===id?color:'transparent'}`,
                color:bpView===id?color:T.textMuted, cursor:'pointer'}}>
              {label}
            </button>
          )),
          <div key="economics" style={{marginLeft:'auto', ...mono, fontSize:'0.54rem', color:T.textDim}}>
            Process Economics Framework · Archon Nexus
          </div>
        ]}
      </div>

      <div style={{flex:1, overflow:'hidden', display:'flex', flexDirection:'column'}}>

        {/* SPRINT BOARD */}
        {bpView==='sprint' && (
          <div style={{flex:1, overflowY:'auto', padding:20}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20}}>
              <div>
                <div style={{...mono, fontSize:'0.7rem', fontWeight:700, color:T.gold, letterSpacing:'0.12em'}}>{sprint.name.toUpperCase()}</div>
                <div style={{...mono, fontSize:'0.6rem', color:T.textMuted, marginTop:3}}>{sprint.goal}</div>
                <div style={{...mono, fontSize:'0.54rem', color:T.textDim, marginTop:2}}>{sprint.startDate} → {sprint.endDate}</div>
              </div>
              <div style={{display:'flex', gap:16}}>
                {[
                  [sprint.completedPoints, sprint.totalPoints, 'PROGRESS', T.green],
                  [sprint.velocity, 34, 'VELOCITY', T.blue],
                  [kanban.filter(c=>c.col==='done').length, kanban.length, 'DONE', T.teal],
                ].map(([val, total, label, color]) => (
                  <div key={label as string} style={{textAlign:'center', minWidth:60}}>
                    <div style={{...mono, fontSize:'0.9rem', fontWeight:700, color:color as string}}>{val}/{total}</div>
                    <div style={{...mono, fontSize:'0.46rem', color:T.textDim, letterSpacing:'0.12em'}}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Sprint burndown bar */}
            <div style={{marginBottom:20}}>
              <div style={{...mono, fontSize:'0.52rem', color:T.textMuted, marginBottom:4, display:'flex', justifyContent:'space-between'}}>
                <span>BURNDOWN</span><span style={{color:T.gold}}>{Math.round(sprint.completedPoints/sprint.totalPoints*100)}% complete</span>
              </div>
              <div style={{height:8, background:T.surface3, borderRadius:4}}>
                <div style={{height:'100%', borderRadius:4, background:T.green, width:`${sprint.completedPoints/sprint.totalPoints*100}%`, transition:'width 0.4s'}} />
              </div>
            </div>
            {/* Sprint cards grouped by agent */}
            {(['AYO','ARCHON','KENDRA','KOFI','MEI','ARIA','TUNDE','MODEBOLA'] as const).map(agent => {
              const agentCards = kanban.filter(c => c.agent===agent);
              if (!agentCards.length) return null;
              return (
                <div key={agent} style={{marginBottom:16}}>
                  <div style={{...mono, fontSize:'0.54rem', color:T.textMuted, letterSpacing:'0.14em', marginBottom:6}}>{agent}</div>
                  <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:8}}>
                    {agentCards.map(card => (
                      <div key={card.id} style={{background:T.surface2, border:`1px solid ${prioColor(card.priority)}33`, borderRadius:4, padding:'8px 10px'}}>
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                          <span style={pill(prioColor(card.priority))}>{card.priority}</span>
                          <span style={pill(card.col==='done'?T.green:card.col==='doing'?T.teal:T.textDim)}>{card.col}</span>
                        </div>
                        <div style={{...mono, fontSize:'0.64rem', color:T.text, marginBottom:3, fontWeight:600}}>{card.title}</div>
                        <div style={{...mono, fontSize:'0.56rem', color:T.textMuted, lineHeight:1.5}}>{card.desc}</div>
                        <div style={{...mono, fontSize:'0.5rem', color:T.textDim, marginTop:6}}>{card.storyPoints}pts · {card.venture}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* KANBAN FLOW */}
        {bpView==='kanban' && (
          <div style={{flex:1, overflow:'hidden', display:'flex', flexDirection:'column'}}>
            <div style={{padding:'8px 16px', flexShrink:0, borderBottom:`1px solid ${T.border}`, display:'flex', gap:8, alignItems:'center'}}>
              <button onClick={() => {
                const title = window.prompt('Card title:'); if(!title) return;
                const desc = window.prompt('Description:') || '';
                setKanban(p => [...p, {id:`k${Date.now()}`,title,desc,agent:activeAgentId,priority:'normal',col:'backlog',storyPoints:3}]);
              }} style={btn(false,T.gold)}>+ Add Card</button>
              <div style={{...mono, fontSize:'0.56rem', color:T.textDim, marginLeft:'auto'}}>
                {kanban.filter(c=>c.col==='done').length}/{kanban.length} done · Click arrows to move cards
              </div>
            </div>
            <div style={{flex:1, display:'flex', gap:0, overflow:'hidden'}}>
              {(['backlog','todo','doing','review','done'] as KanbanCol[]).map(col => {
                const colCards = kanban.filter(c=>c.col===col);
                const colColors: Record<KanbanCol,string> = {backlog:T.textDim, todo:T.blue, doing:T.teal, review:T.orange, done:T.green};
                const colLabels: Record<KanbanCol,string> = {backlog:'Backlog', todo:'Todo', doing:'In Progress', review:'Review', done:'Done'};
                return (
                  <div key={col} style={{flex:1, borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column', minWidth:0}}>
                    <div style={{padding:'6px 10px', background:T.surface2, borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', justifyContent:'space-between'}}>
                      <span style={{...mono, fontSize:'0.56rem', color:colColors[col], fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase'}}>{colLabels[col]}</span>
                      <span style={pill(colColors[col])}>{colCards.length}</span>
                    </div>
                    <div style={{flex:1, overflowY:'auto', padding:6, display:'flex', flexDirection:'column', gap:6}}>
                      {colCards.map(card => (
                        <div key={card.id} style={{background:T.surface2, border:`1px solid ${prioColor(card.priority)}33`, borderRadius:4, padding:'7px 9px'}}>
                          <div style={{display:'flex', gap:4, marginBottom:4}}>
                            <span style={pill(prioColor(card.priority))}>{card.priority[0].toUpperCase()}</span>
                            <span style={{...mono, fontSize:'0.5rem', color:T.textDim}}>{card.agent}</span>
                          </div>
                          <div style={{...mono, fontSize:'0.6rem', color:T.text, marginBottom:3, lineHeight:1.4, fontWeight:600}}>{card.title}</div>
                          <div style={{...mono, fontSize:'0.54rem', color:T.textMuted, lineHeight:1.4, marginBottom:4}}>{card.desc}</div>
                          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <span style={{...mono, fontSize:'0.48rem', color:T.textDim}}>{card.storyPoints}pts</span>
                            <div style={{display:'flex', gap:4}}>
                              {col!=='backlog' && <button onClick={()=>moveCard(card.id,'left')} style={{...mono,fontSize:'0.6rem',background:'none',border:`1px solid ${T.border}`,color:T.textDim,cursor:'pointer',borderRadius:2,padding:'1px 5px'}}>←</button>}
                              {col!=='done' && <button onClick={()=>moveCard(card.id,'right')} style={{...mono,fontSize:'0.6rem',background:'none',border:`1px solid ${T.border}`,color:T.textDim,cursor:'pointer',borderRadius:2,padding:'1px 5px'}}>→</button>}
                            </div>
                          </div>
                        </div>
                      ))}
                      {colCards.length===0 && <div style={{...mono,fontSize:'0.56rem',color:T.textDim,textAlign:'center',padding:'20px 0'}}>Empty</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* INNOVATION PIPELINE */}
        {bpView==='pipeline' && (
          <div style={{flex:1, overflowY:'auto', padding:20}}>
            <div style={{...mono, fontSize:'0.56rem', color:T.textMuted, marginBottom:16, lineHeight:1.8}}>
              Process Economics Framework — Every stage is a value-generating operation with measurable KPIs, assigned agents, and clear exit criteria. Grounded innovation: nothing moves forward without validated metrics.
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:12}}>
              {PIPELINE_STAGES.map((stage, idx) => (
                <div key={stage.id} style={{display:'flex', gap:16, alignItems:'flex-start'}}>
                  {/* Stage connector */}
                  <div style={{display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0}}>
                    <div style={{width:36, height:36, borderRadius:'50%', border:`2px solid ${stage.color}`, display:'flex', alignItems:'center', justifyContent:'center',
                      background: stage.status==='complete'?stage.color:stage.status==='active'?`${stage.color}22`:T.surface2}}>
                      <span style={{color:stage.status==='complete'?T.black:stage.color, fontSize:'0.65rem', fontWeight:700}}>{idx+1}</span>
                    </div>
                    {idx < PIPELINE_STAGES.length-1 && <div style={{width:2, height:30, background:`${stage.color}40`, marginTop:2}}/>}
                  </div>
                  {/* Stage card */}
                  <div style={{flex:1, background:T.surface2, border:`1px solid ${stage.status==='active'?stage.color:T.border}`, borderRadius:6, padding:'12px 14px'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8}}>
                      <div>
                        <div style={{...mono, fontSize:'0.7rem', fontWeight:700, color:stage.color, letterSpacing:'0.1em'}}>{stage.name.toUpperCase()}</div>
                        <div style={{...mono, fontSize:'0.6rem', color:T.textMuted, marginTop:2}}>{stage.desc}</div>
                      </div>
                      <div style={{display:'flex', gap:6, alignItems:'center'}}>
                        <span style={pill(stage.status==='complete'?T.green:stage.status==='active'?T.teal:T.textDim)}>
                          {stage.status}
                        </span>
                        <span style={pill(stage.color)}>{stage.agent}</span>
                      </div>
                    </div>
                    <div style={{display:'flex', gap:12, marginTop:8}}>
                      <div>
                        <div style={{...mono, fontSize:'0.5rem', color:T.textDim, letterSpacing:'0.14em', marginBottom:4}}>KPIs</div>
                        <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
                          {stage.kpis.map(k => <span key={k} style={{...mono, fontSize:'0.52rem', padding:'1px 6px', background:T.surface3, border:`1px solid ${T.border}`, borderRadius:2, color:T.textMuted}}>{k}</span>)}
                        </div>
                      </div>
                      <div>
                        <div style={{...mono, fontSize:'0.5rem', color:T.textDim, letterSpacing:'0.14em', marginBottom:4}}>VENTURES</div>
                        <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
                          {stage.ventures.map(v => <span key={v} style={pill(stage.color)}>{v}</span>)}
                        </div>
                      </div>
                    </div>
                    <div style={{marginTop:10}}>
                      <button onClick={() => { setPrompt(`Execute ${stage.name} phase for Archon Nexus.\n\nAgent: ${stage.agent}\nKPIs to achieve: ${stage.kpis.join(', ')}\nVentures: ${stage.ventures.join(', ')}\n\nProvide:\n1. Specific action items\n2. Success metrics\n3. Timeline estimate\n4. Dependencies`); setMode('ai'); }}
                        style={{...btn(false,stage.color), fontSize:'0.54rem'}}>
                        ▶ Brief {stage.agent}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CEREMONIES */}
        {bpView==='ceremonies' && (
          <div style={{flex:1, display:'flex', overflow:'hidden'}}>
            <div style={{width:200, flexShrink:0, borderRight:`1px solid ${T.border}`, padding:14, display:'flex', flexDirection:'column', gap:8}}>
              <div style={{...mono, fontSize:'0.52rem', color:T.textDim, letterSpacing:'0.14em', marginBottom:4}}>NEW CEREMONY</div>
              {([['standup','◎ Daily Standup',T.green],['planning','◈ Sprint Planning',T.blue],['retro','↩ Retrospective',T.orange],['demo','⊕ Sprint Demo',T.purple]] as const).map(([type,label,color]) => (
                <button key={type} onClick={() => addCeremony(type)}
                  style={{...btn(false,color), textAlign:'left', padding:'7px 10px', fontSize:'0.6rem'}}>
                  {label}
                </button>
              ))}
              <div style={{marginTop:'auto', ...mono, fontSize:'0.52rem', color:T.textDim, lineHeight:1.7}}>
                Ceremonies are the heartbeat of sovereign operations.<br/>
                Each ceremony is logged, AI-assisted, and saved to Vault.
              </div>
            </div>
            <div style={{flex:1, overflowY:'auto', padding:14}}>
              {ceremonies.length===0 && (
                <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:8}}>
                  <div style={{color:T.sage, fontSize:'1.5rem'}}>◎</div>
                  <div style={{...mono, fontSize:'0.68rem', color:T.textMuted}}>No ceremonies logged yet</div>
                  <div style={{...mono, fontSize:'0.58rem', color:T.textDim}}>Run a standup, planning, retro, or demo from the left panel</div>
                </div>
              )}
              {ceremonies.map(c => {
                const typeColor = {standup:T.green, planning:T.blue, retro:T.orange, demo:T.purple}[c.type];
                return (
                  <div key={c.id} style={{background:T.surface2, border:`1px solid ${typeColor}33`, borderRadius:6, padding:'12px 14px', marginBottom:12}}>
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
                      <div>
                        <span style={pill(typeColor)}>{c.type.toUpperCase()}</span>
                        <span style={{...mono, fontSize:'0.54rem', color:T.textDim, marginLeft:8}}>{c.date} · {c.venture}</span>
                      </div>
                      <button onClick={() => { setPrompt(c.notes); setMode('ai'); }} style={btn(false,typeColor)}>▶ Brief {c.agent}</button>
                    </div>
                    <textarea value={c.notes} onChange={e => setCeremonies(cs => cs.map(x => x.id===c.id?{...x,notes:e.target.value}:x))}
                      style={{...inputSt, minHeight:100, resize:'vertical'}} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // renderGit was removed as it's now inlined or handled via renderActivityBar transitions

  // ── GitHub Import Modal ────────────────────────────────────────
  const renderImportModal = () => (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}}
      onClick={() => { if (ghImportStatus.type !== 'loading') setImportModal(false); }}>
      <div style={{background:T.surface2, border:`1px solid ${T.goldBorder}`, borderRadius:8, padding:24, minWidth:440, maxWidth:520}}
        onClick={e => e.stopPropagation()}>
        <div style={{...mono, fontSize:'0.72rem', color:T.green, fontWeight:700, marginBottom:10}}>⊕ Import from GitHub</div>
        <div style={{...mono, fontSize:'0.58rem', color:T.textMuted, marginBottom:14, lineHeight:1.7}}>
          Paste a public or private GitHub repo URL.<br/>
          Imports up to 20 source files (.ts .tsx .js .py .json .md etc).<br/>
          <span style={{color:T.gold}}>Requires a GitHub PAT</span> saved in GitFort → Config tab (localStorage key: <code style={{color:T.teal}}>github_pat</code>).
        </div>
        <input value={ghImportUrl} onChange={e => { setGhImportUrl(e.target.value); setGhImportStatus({msg:'',type:'idle'}); }}
          placeholder="https://github.com/vectorize-io/hindsight"
          style={{...inputSt, marginBottom:10}}
          onKeyDown={e => e.key==='Enter' && ghImportStatus.type!=='loading' && handleGitHubImport()} />

        {/* Live status message */}
        {ghImportStatus.msg && (
          <div style={{...mono, fontSize:'0.58rem', padding:'7px 10px', borderRadius:4, marginBottom:12,
            background: ghImportStatus.type==='error' ? `${T.red}18` : ghImportStatus.type==='ok' ? `${T.green}18` : `${T.teal}18`,
            border: `1px solid ${ghImportStatus.type==='error' ? T.red : ghImportStatus.type==='ok' ? T.green : T.teal}44`,
            color: ghImportStatus.type==='error' ? T.red : ghImportStatus.type==='ok' ? T.green : T.teal,
            lineHeight: 1.6,
          }}>
            {ghImportStatus.type==='loading' && '◌ '}{ghImportStatus.msg}
          </div>
        )}

        <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
          <button onClick={() => { setImportModal(false); setGhImportStatus({msg:'',type:'idle'}); }}
            disabled={ghImportStatus.type==='loading'}
            style={{...btn(), opacity: ghImportStatus.type==='loading' ? 0.4 : 1}}>Cancel</button>
          <button onClick={handleGitHubImport}
            disabled={!ghImportUrl.trim() || ghImportStatus.type==='loading'}
            style={{...btn(true,T.green), opacity: (!ghImportUrl.trim() || ghImportStatus.type==='loading') ? 0.5 : 1}}>
            {ghImportStatus.type==='loading' ? '◌ Importing...' : '⊕ Clone & Import'}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Browse System Directory Modal ─────────────────────────────
  const renderSysBrowser = () => (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}}
      onClick={() => setSysBrowser(s => ({...s, isOpen:false}))}>
      <div style={{background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:24, minWidth:500, maxWidth:700, maxHeight:'80vh', display:'flex', flexDirection:'column'}}
        onClick={e => e.stopPropagation()}>
        <div style={{...mono, fontSize:'0.72rem', color:T.gold, fontWeight:700, marginBottom:16}}>📁 Browse System Workspace</div>
        
        <div style={{display:'flex', gap:6, marginBottom:12}}>
          <input value={sysBrowser.path} readOnly style={{...inputSt, flex:1, opacity:0.7, fontSize:'0.58rem'}} />
          <button onClick={() => {
            const up = sysBrowser.path.split('/').slice(0,-1).join('/') || '/';
            handleBrowse(up);
          }} style={btn()}>↑ Up</button>
        </div>

        <div style={{flex:1, overflowY:'auto', background:T.black, borderRadius:4, border:`1px solid ${T.border}`, marginBottom:16}} className="ide-scrollbar">
          {sysBrowser.items.length === 0 && <div style={{padding:20, textAlign:'center', ...mono, fontSize:'0.6rem', color:T.textDim}}>Empty or scanning...</div>}
          {sysBrowser.items.map((it:any) => (
            <div key={it.path} onClick={() => it.type==='directory' ? handleBrowse(it.path) : null}
              style={{padding:'8px 12px', borderBottom:`1px solid ${T.border}33`, cursor: it.type==='directory'?'pointer':'default', display:'flex', alignItems:'center', gap:8}}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background=T.surface3}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}>
              <span>{it.type==='directory'?'📁':'📄'}</span>
              <span style={{...mono, fontSize:'0.62rem', color: it.type==='directory'?T.teal:T.textMuted, flex:1}}>{it.name}</span>
              {it.type==='directory' && (
                <button onClick={(e) => {
                  e.stopPropagation();
                  if(!activeProjects.includes(it.path)) {
                    const updated = [...activeProjects, it.path];
                    setActiveProjects(updated);
                    localStorage.setItem('active_projects', JSON.stringify(updated));
                    setSysBrowser(s => ({...s, isOpen:false}));
                    refreshFileTree();
                  }
                }} style={{...btn(true, T.green), fontSize:'0.5rem'}}>Select Folder</button>
              )}
            </div>
          ))}
        </div>

        <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
          <button onClick={() => setSysBrowser(s => ({...s, isOpen:false}))} style={btn()}>Close</button>
        </div>
      </div>
    </div>
  );

  // ── Quick Open (Ctrl+P) ────────────────────────────────────────
  const renderQuickOpen = () => (
    <div style={{position:'fixed', top:60, left:'50%', transform:'translateX(-50%)', width:600, background:T.surface2, border:`1px solid ${T.gold}`, borderRadius:6, boxShadow:'0 10px 40px rgba(0,0,0,0.5)', zIndex:10000, padding:12}}
      onClick={e => e.stopPropagation()}>
      <input autoFocus placeholder="Search files by name..." value={quickOpen.query}
        onChange={e => setQuickOpen(s => ({...s, query:e.target.value}))}
        onKeyDown={e => {
          if (e.key === 'Escape') setQuickOpen({isOpen:false, query:''});
          if (e.key === 'Enter') {
            const match = fileTree.find(n => n.type==='file' && n.name.toLowerCase().includes(quickOpen.query.toLowerCase()));
            if (match) { handleOpenFile(match); setQuickOpen({isOpen:false, query:''}); }
          }
        }}
        style={{...inputSt, fontSize:'0.8rem', padding:'10px 16px', background:T.black}} />
      <div style={{marginTop:8, maxHeight:300, overflowY:'auto'}} className="ide-scrollbar">
        {fileTree.filter(n => n.type==='file' && n.name.toLowerCase().includes(quickOpen.query.toLowerCase())).slice(0,12).map(f => (
          <div key={f.id} onClick={() => { handleOpenFile(f); setQuickOpen({isOpen:false, query:''}); }}
            style={{padding:'8px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:8}}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background=T.surface3}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}>
            <span style={{fontSize:'0.8rem'}}>{fileIcon(f.name, false)}</span>
            <span style={{...mono, fontSize:'0.64rem', color:T.text}}>{f.name}</span>
            <span style={{...mono, fontSize:'0.5rem', color:T.textDim, marginLeft:'auto'}}>{f.id.split('/').slice(0,-1).join('/')}</span>
          </div>
        ))}
      </div>
    </div>
  );

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'p' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setQuickOpen(s => ({...s, isOpen:!s.isOpen})); }
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSaveFile(); }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  // ── Root render ────────────────────────────────────────────────
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', background:T.black, color:T.text, ...mono, overflow:'hidden' }}>
      {renderTopMenu()}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {renderModeStrip()}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {mode==='ai'        && renderAI()}
            {mode==='ide'       && renderIDE()}
            {mode==='blueprint' && renderBlueprint()}
            {mode==='git'       && (
              <div style={{flex:1, display:'flex', overflow:'hidden'}}>
                {renderActivityBar()}
                <div style={{flex:1, borderLeft:`1px solid ${T.border}`}}>
                  <GitFort openTabs={openTabs} onOpenFile={(f) => onOpenTab({...f, modified: false})} activeTabId={activeTabId} onUpdateContent={onUpdateContent} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {importModal && renderImportModal()}
      {sysBrowser.isOpen && renderSysBrowser()}
      {quickOpen.isOpen && renderQuickOpen()}
      <style>{IDE_STYLES}</style>
    </div>
  );
}