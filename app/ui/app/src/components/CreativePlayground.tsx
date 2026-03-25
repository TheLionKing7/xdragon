import React, { useState, useEffect, useRef, useCallback } from 'react';
import BrowserPanel from "@/components/BrowserPanel";
import LegalDesk from "@/components/LegalDesk";
import ServicesModule from "@/components/ServicesModule";
import IntegrationCanvas from "@/components/IntegrationCanvas";
import SecurityModule from "@/components/SecurityModule";
import PenpotPanel from "@/components/PenpotPanel";
import CodeStudio from "@/components/CodeStudio";
import { useHealth } from "@/hooks/useHealth";
import { parseJsonlFromResponse } from "@/util/jsonl-parsing";
import { SovereignVault } from "@/lib/sovereign-vault";
import { ArchonTunnel } from "@/lib/archon-tunnel";
import { registerAllHandlers } from "@/lib/archon-handlers";
import type { XDragonStore } from "@/lib/archon-handlers";
import { useMounted } from "@/hooks/useMounted";
import { ARCHON_BACKEND_URL } from "@/lib/config";

const OLLAMA_URL = "http://localhost:11434";

// ============================================================================
// DESIGN TOKENS
// ============================================================================
const T = {
  gold: '#c9a84c', goldDim: '#6b5820', goldBorder: '#3a3020',
  black: '#080808', surface: '#0f0f0f', surface2: '#161616', surface3: '#202020',
  border: '#282420', text: '#f0ead8', textMuted: '#7a7060', textDim: '#3a3530',
  green: '#4a9a6a', red: '#c05040', teal: '#5ab0c8', blue: '#4a8aba',
  purple: '#9a7ab0', orange: '#d4805a', sage: '#8aaa60',
};
const mono: React.CSSProperties = { fontFamily: '"Menlo","Monaco","Consolas","Courier New",monospace' };

const AGENTS: Record<string, { id: string; name: string; accent: string; role: string }> = {
  ARCHON:   { id: 'ARCHON',   name: 'The Archon',           accent: T.gold,   role: 'Digital CEO' },
  MODEBOLA: { id: 'MODEBOLA', name: 'Modebola Awolowo',     accent: T.purple, role: 'Chief of Staff' },
  AYO:      { id: 'AYO',      name: 'Ayo Hastruup',         accent: T.gold,   role: 'CTO' },
  KOFI:     { id: 'KOFI',     name: 'Kofi Perempe',         accent: T.blue,   role: 'Chief Economist' },
  MEI:      { id: 'MEI',      name: 'Mei Zhu-Adeyemi',      accent: T.teal,   role: 'Chief BI Officer' },
  ARIA:     { id: 'ARIA',     name: 'Aria Okonkwo-Santos',  accent: T.purple, role: 'Chief Creative Officer' },
  KENDRA:   { id: 'KENDRA',   name: 'Kendra Mwangi-Carter', accent: T.orange, role: 'Chief Growth Officer' },
  TUNDE:    { id: 'TUNDE',    name: 'Tunde Balogun',        accent: T.sage,   role: 'Chief Legal Counsel' },
};

const MODULES = [
  { id: 'code_studio',   name: 'Code Studio',     tagline: 'Development & Architecture', primary: 'AYO',      agents: ['AYO'] },
  { id: 'research_lab',  name: 'Research Lab',    tagline: 'Market Intelligence',        primary: 'KOFI',     agents: ['KOFI', 'MEI', 'TUNDE'] },
  { id: 'design_studio', name: 'Design Studio',   tagline: 'Brand & Creative',           primary: 'ARIA',     agents: ['ARIA', 'KENDRA'] },
  { id: 'integration',   name: 'Integration Hub', tagline: 'Project & Operations',       primary: 'MODEBOLA', agents: ['ARCHON', 'MODEBOLA', 'AYO'] },
  { id: 'services',      name: 'Services',         tagline: 'Infrastructure Ops',         primary: 'AYO',      agents: ['AYO', 'ARCHON'] },
  { id: 'security',      name: 'Security',         tagline: 'Sovereign Protection',       primary: 'ARCHON',   agents: ['ARCHON'] },
  { id: 'legal_desk',    name: 'Legal Desk',       tagline: 'Contracts & Compliance',     primary: 'TUNDE',    agents: ['TUNDE', 'MODEBOLA'] },
  { id: 'training',      name: 'Training Studio',  tagline: 'Agent Fine-tuning',          primary: 'ARCHON',   agents: ['ARCHON', 'AYO', 'KOFI'] },
];

const MODULE_ACCENTS: Record<string, string> = {
  code_studio: T.gold, research_lab: T.blue, design_studio: T.purple,
  integration: T.purple, services: T.green, security: T.red,
  legal_desk: T.sage, training: T.gold,
};

// ============================================================================
// TYPES
// ============================================================================
interface HistoryEntry { id: string; prompt: string; output: string; timestamp: number; agentId: string; }
interface CodeBlock    { type: 'code'; lang: string; content: string; filename?: string; }
interface TextBlock    { type: 'text'; content: string; }
interface CryptoAsset  { id: string; symbol: string; priceUsd: string; changePercent24Hr: string; }
interface NewsArticle  { title: string; source: { name: string }; url: string; publishedAt: string; }
interface BlueprintProject {
  id: string; name: string;
  phases: { name: string; status: 'done' | 'in-progress' | 'pending'; agent: string; desc: string }[];
}

const DEFAULT_BP_PROJECTS: BlueprintProject[] = ['GenieChain','GeniePay','GenieID','Archon Nexus','xDragon Studio'].map(n => ({
  id: n.toLowerCase().replace(/\s+/g,'-'), name: n,
  phases: [
    {name:'Idea',      status:'done',        agent:'ARCHON',   desc:'Concept generation'},
    {name:'Validate',  status:'done',        agent:'KOFI',     desc:'Market fit'},
    {name:'Planning',  status:'done',        agent:'MODEBOLA', desc:'Roadmap'},
    {name:'Design',    status:'done',        agent:'ARIA',     desc:'UI/UX'},
    {name:'Dev',       status:'in-progress', agent:'AYO',      desc:'Implementation'},
    {name:'Infra',     status:'pending',     agent:'AYO',      desc:'Deployment'},
    {name:'Test',      status:'pending',     agent:'AYO',      desc:'QA'},
    {name:'Launch',    status:'pending',     agent:'KENDRA',   desc:'Go to market'},
    {name:'Acquire',   status:'pending',     agent:'KENDRA',   desc:'User acq'},
    {name:'Revenue',   status:'pending',     agent:'KOFI',     desc:'Monetisation'},
    {name:'Analytics', status:'pending',     agent:'MEI',      desc:'Metrics'},
    {name:'Scale',     status:'pending',     agent:'AYO',      desc:'Scaling infra'},
  ],
}));

// ============================================================================
// xDragon logo — imported from assets
// Logo file: src/assets/xdragon-logo.png  (already placed by user)
// ============================================================================
import xDragonLogo from "@/assets/xdragon-logo.png";

const XDragonMark = ({ size = 34 }: { size?: number }) => (
  <img
    src={xDragonLogo}
    alt="xDragon"
    style={{ width: size, height: size, flexShrink: 0, objectFit: 'contain' }}
  />
);

// ============================================================================
// DRAG-TO-RESIZE — hook + handle component
// ============================================================================
function useResize(initial: number, min: number, max: number, dir: 'h' | 'v') {
  const [size, setSize] = useState(initial);
  const state = useRef<{ startPos: number; startSize: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    state.current = { startPos: dir === 'h' ? e.clientX : e.clientY, startSize: size };

    const onMove = (ev: MouseEvent) => {
      if (!state.current) return;
      const delta = (dir === 'h' ? ev.clientX : ev.clientY) - state.current.startPos;
      setSize(Math.max(min, Math.min(max, state.current.startSize + delta)));
    };
    const onUp = () => {
      state.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [size, min, max, dir]);

  return { size, setSize, onMouseDown };
}

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  dir?: 'h' | 'v';
}
const ResizeHandle = ({ onMouseDown, dir = 'h' }: ResizeHandleProps) => {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0,
        width:  dir === 'h' ? 4 : '100%',
        height: dir === 'v' ? 4 : '100%',
        background: hover ? T.gold : T.border,
        cursor: dir === 'h' ? 'col-resize' : 'row-resize',
        transition: 'background 0.15s',
        zIndex: 10,
      }}
    />
  );
};

// ============================================================================
// UTILITIES
// ============================================================================
function parseOutputBlocks(text: string): (TextBlock | CodeBlock)[] {
  const blocks: (TextBlock | CodeBlock)[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIdx = 0, match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) blocks.push({ type:'text', content: text.substring(lastIdx, match.index) });
    const lang = match[1] || 'text';
    const content = match[2];
    const firstLine = content.split('\n')[0];
    let filename: string | undefined;
    if (firstLine.includes('// ') || firstLine.includes('# '))
      filename = firstLine.replace(/(\/\/|#)\s*/,'').trim();
    blocks.push({ type:'code', lang, content, filename: filename || `snippet.${lang}` });
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) blocks.push({ type:'text', content: text.substring(lastIdx) });
  return blocks;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CreativePlayground() {
  // ── Core state ──────────────────────────────────────────────────────
  const [activeModuleId, setActiveModuleId] = useState('code_studio');
  const [activeAgentId,  setActiveAgentId]  = useState('AYO');
  const [prompt,         setPrompt]         = useState('');
  const [output,         setOutput]         = useState('');
  const [loading,        setLoading]        = useState(false);
  const [isStreaming,    setIsStreaming]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [abortCtrl,      setAbortCtrl]      = useState<AbortController | null>(null);

  // ── Model / daemon — health from hook, no inline polling ─────────────
  const { isHealthy } = useHealth();
  const [_models,       setModels]        = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [temperature,   setTemperature]   = useState(0.7);
  const [daemonStatus,  setDaemonStatus]  = useState<'online'|'offline'|'starting'>('offline');
  const outputRef = useRef<HTMLDivElement>(null);

  // ── UI state ────────────────────────────────────────────────────────
  const [history,     setHistory]     = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // ── Code Studio ──────────────────────────────────────────────────────
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [openTabs,    setOpenTabs]    = useState<{id:string;name:string;content:string;lang:string;modified:boolean}[]>([]);

  // ── Research Lab ─────────────────────────────────────────────────────
  const [cryptoPrices,    setCryptoPrices]    = useState<CryptoAsset[]>([]);
  const [memecoinPrices,  setMemecoinPrices]  = useState<CryptoAsset[]>([]);
  const [nftAssets,       setNftAssets]       = useState<any[]>([]);
  const [whaleWallets,    setWhaleWallets]    = useState<any[]>([]);
  const [fxRates,         setFxRates]         = useState<Record<string,number>>({});
  const [newsArticles,    setNewsArticles]    = useState<NewsArticle[]>([]);
  const [biData,          setBiData]          = useState<any>({ bonds: [], stocks: [], signals: [] });
  const [researchTab,     setResearchTab]     = useState<'browser'|'ai'|'terminal'>('browser');
  const [researchTermOutput, setResearchTermOutput] = useState<string[]>(['$ archon-research-node --active', '✓ Connected to global liquidity pool', '◌ Scanning memecoin sentiment...']);
  const [researchTermInput, setResearchTermInput]   = useState('');
  const [researchActiveTermTab, setResearchActiveTermTab] = useState<'terminal'|'problems'|'output'>('terminal');
  const [cryptoSubTab, setCryptoSubTab] = useState<'majors'|'memes'|'nfts'|'wallets'>('majors');
  const [biSubTab,     setBiSubTab]     = useState<'signals'|'stocks'|'bonds'>('signals');

  // ── Design Studio ────────────────────────────────────────────────────
  const [designTab, setDesignTab] = useState<'brand'|'moodboard'|'copy'|'penpot'>('brand');

  // ── Integration Hub ──────────────────────────────────────────────────
  const [blueprintProjects,  setBlueprintProjects]  = useState<BlueprintProject[]>([]);
  const [activeBpProjectId,  setActiveBpProjectId]  = useState<string|null>(null);
  const [integrationView,    setIntegrationView]    = useState<'canvas'|'blueprint'>('canvas');

  const [tunnelStatus, setTunnelStatus] = useState<string>('disconnected');
  // Refs give tunnel handlers stable access to latest React state without re-registering
  const storeRef = useRef<XDragonStore | null>(null);

  // ── Training Studio ──────────────────────────────────────────────────  
  const [trainingAgentId, setTrainingAgentId] = useState('AYO');  
  const [trainingTab,     setTrainingTab]     = useState<'finetune'|'eval'|'knowledge'|'persona'>('finetune');  
  const [tsExamples,      setTsExamples]      = useState<{id:string;input:string;output:string;ts:number}[]>([]);  
  const [tsKnowledge,     setTsKnowledge]     = useState<{id:string;title:string;text:string;ts:number}[]>([]);  
  const [tsExInput,       setTsExInput]       = useState('');  
  const [tsExOutput,      setTsExOutput]      = useState('');  
  const [tsKnTitle,       setTsKnTitle]       = useState('');  
  const [tsKnText,        setTsKnText]        = useState('');  
  const [tsPersonaName,   setTsPersonaName]   = useState('');  
  const [tsPersonaRole,   setTsPersonaRole]   = useState('');  
  const [tsPersonaStyle,  setTsPersonaStyle]  = useState('Direct, analytical, decisive.');  
  const [tsSysPrompt,     setTsSysPrompt]     = useState('');  
  const [tsSyncStatus,    setTsSyncStatus]    = useState<'idle'|'syncing'|'ok'|'error'>('idle');  
  const [tsSyncMsg,       setTsSyncMsg]       = useState('');  
  const [tsLoadingEx,     setTsLoadingEx]     = useState(false);

  useEffect(() => {  
    const ta = AGENTS[trainingAgentId];  
    setTsPersonaName(ta.name);  
    setTsPersonaRole(ta.role);  
    setTsSysPrompt(`You are ${ta.name}, ${ta.role} at Archon Nexus.`);  
    setTsLoadingEx(true);  
    SovereignVault.search(trainingAgentId, 'training', 100).then(entries => {  
      setTsExamples(entries.filter(e => e.tags.includes('example')).map(e => {  
        try { const d = JSON.parse(e.content); return { id: e.id, input: d.input, output: d.output, ts: e.createdAt }; }  
        catch { return null; }  
      }).filter(Boolean) as {id:string;input:string;output:string;ts:number}[]);  
      setTsKnowledge(entries.filter(e => e.tags.includes('knowledge')).map(e => ({ id: e.id, title: e.title, text: e.content, ts: e.createdAt })));  
      setTsLoadingEx(false);  
    });  
    const saved = localStorage.getItem(`archon_persona_${trainingAgentId}`);  
    if (saved) { try { const p = JSON.parse(saved); if (p.style) setTsPersonaStyle(p.style); if (p.systemPrompt) setTsSysPrompt(p.systemPrompt); } catch {} }  
  }, [trainingAgentId]);

  // ── Resize handles ────────────────────────────────────────────────────
  // sidebar width
  const sidebar  = useResize(220, 160, 320, 'h');
  // code studio: file explorer width
  useResize(180, 120, 320, 'h');
  // code studio: terminal height (dragged from top edge of terminal)
  useResize(180, 80, 400, 'v');
  // research lab: side panel width
  const researchSide = useResize(200, 140, 320, 'h');

  // ── Initialization ────────────────────────────────────────────────────
  useEffect(() => {
    const mod = MODULES.find(m => m.id === activeModuleId);
    if (mod) setActiveAgentId(mod.primary);
  }, [activeModuleId]);

  // ── Sync daemonStatus from useHealth hook ────────────────────────────
  useEffect(() => {
    setDaemonStatus(isHealthy ? 'online' : 'offline');
  }, [isHealthy]);

  useEffect(() => {
    const init = async () => {
      try {
        const r    = await fetch(`${OLLAMA_URL}/api/tags`);
        const data = await r.json();
        const m    = data.models?.map((m:{name:string}) => m.name.replace(/:latest$/,'')) ?? [];
        setModels(m);
        // Apply per-agent model from Settings if available
        const agentModels = JSON.parse(localStorage.getItem('archon_agent_models') || '{}');
        const preferred = agentModels['AYO'] || m[0] || '';
        if (preferred) setSelectedModel(preferred);
      } catch {}
      const stored = localStorage.getItem('archon_bp_projects');
      if (stored) {
        const p = JSON.parse(stored);
        setBlueprintProjects(p);
        setActiveBpProjectId(p[0]?.id ?? null);
      } else {
        setBlueprintProjects(DEFAULT_BP_PROJECTS);
        setActiveBpProjectId(DEFAULT_BP_PROJECTS[0].id);
      }
    };
    init();
  }, []);

  // ── Archon tunnel — initialize once, wire store via refs ─────────────
  useEffect(() => {
    const tunnel = ArchonTunnel.getInstance();

    // Build the XDragonStore that handlers use to reach React state
    const store: XDragonStore = {
      // Code Studio
      openTab:      (file) => { setOpenTabs(p => p.find(t=>t.id===file.id) ? p : [...p, {...file, modified:false}]); setActiveTabId(file.id); },
      setPrompt:    (text: string) => setPrompt(text),
      setOutput:    (text: string) => setOutput(text),
      switchModule: (mod)  => setActiveModuleId(mod),
      executePrompt: async (execPrompt, agentId) => {
        const agent = AGENTS[agentId] || AGENTS['ARCHON'];
        const sys = `You are ${agent.name}, ${agent.role} at Archon Nexus. Be precise and actionable.`;
        const res = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selectedModel, stream: false,
            messages: [{ role: 'system', content: sys }, { role: 'user', content: execPrompt }] }),
        });
        const data = await res.json();
        return data.message?.content || '';
      },

      // GitFort stubs — wired via events that GitFort.tsx listens to
      gitfortCommit: async (message, branch) => {
        window.dispatchEvent(new CustomEvent('gitfort:commit', { detail: { message, branch } }));
      },
      gitfortPush: async (branch) => {
        window.dispatchEvent(new CustomEvent('gitfort:push', { detail: { branch } }));
      },

      // Sovereign Vault
      vaultStore:    (entry) => SovereignVault.store(entry),
      vaultRetrieve: (id)    => SovereignVault.retrieve(id),
      vaultSearch:   (q, cat) => SovereignVault.search(q, cat),
      vaultIndex:    ()      => SovereignVault.index(),

      // Services
      pingAllServices: async () => {
        window.dispatchEvent(new CustomEvent('services:ping_all'));
      },
      generateReport: async (ventureId) => {
        const prompt = `Generate infrastructure audit for venture: ${ventureId}`;
        return store.executePrompt(prompt, 'ARCHON');
      },

      // Training — saves to vault and notifies Archon
      saveTrainingExample: async (agentId, input, output) => {
        await SovereignVault.store({
          title: `Training: ${agentId} — ${new Date().toISOString()}`,
          category: 'training', content: JSON.stringify({ input, output }),
          agentId, tags: [agentId, 'training', 'example'],
        });
      },
      syncTrainingToArchon: async (agentId) => {
        const key = localStorage.getItem('archon_gateway_key') || '';
        if (!key) return;
        await fetch('https://archon-nexus-api-production.up.railway.app/api/agents/' + agentId + '/training', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Archon-Gateway-Key': key },
          body: JSON.stringify({ agentId }),
        }).catch(() => {});
      },

      // Legal
      createLegalIssue: (title, jurisdiction, urgency) => {
        window.dispatchEvent(new CustomEvent('legal:create_issue', { detail: { title, jurisdiction, urgency } }));
      },

      // Penpot
      penpotCreatePage:  async (projectName, pageName) => {
        const { agentCreatePage } = await import('@/components/PenpotPanel');
        return agentCreatePage(projectName, pageName);
      },
      penpotUpdateAsset: async (fileId, data) => {
        const { agentUpdateAsset } = await import('@/components/PenpotPanel');
        return agentUpdateAsset(fileId, data);
      },

      // Navigation
      navigate: (path) => window.location.href = path,

      // State readers
      getActiveModule:     () => activeModuleId,
      getOpenTabs:         () => openTabs,
      getActiveTabContent: () => openTabs.find(t => t.id === activeTabId)?.content || '',
    };

    storeRef.current = store;
    registerAllHandlers(tunnel, store);

    // Watch tunnel status
    const unsubStatus = tunnel.onStatusChange(s => setTunnelStatus(s));

    // Tunnel connection is managed by ArchonTunnelProvider in __root.tsx
    // Just sync current status here
    setTunnelStatus(tunnel.status);

    return () => {
      unsubStatus();
      // Don't disconnect on unmount — tunnel should persist across re-renders
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mounted = useMounted();

  const fetchMarketData = useCallback(async () => {
    const gatewayKey = localStorage.getItem('archon_gateway_key');
    try {
      const res = await fetch(`${ARCHON_BACKEND_URL}/api/ai/market/feeds`, {
        headers: gatewayKey ? { 'X-Archon-Gateway-Key': gatewayKey } : {},
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const data = await res.json();
        
        // If the backend is running an older version that doesn't provide the new feeds, force fallback
        if (!data.memecoins || !data.bi) {
          throw new Error('Backend data is incomplete, triggering local fallback');
        }

        if (data.crypto)    setCryptoPrices(data.crypto);
        if (data.memecoins) setMemecoinPrices(data.memecoins);
        if (data.nfts)      setNftAssets(data.nfts);
        if (data.wallets)   setWhaleWallets(data.wallets);
        if (data.fx)        setFxRates(data.fx);
        if (data.news)      setNewsArticles(data.news);
        if (data.bi)        setBiData(data.bi);
        return; // Success
      }
    } catch (err) { /* fall through to fallback */ }

    // Fallback if backend is down — using Binance and other public APIs
    try {
      const symbols = ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","SHIBUSDT","PEPEUSDT","BONKUSDT","WIFUSDT","FLOKIUSDT"];
      const biSymbols = ["AAPL","MSFT","GOOGL","TSLA","^TNX","^TYX","GC=F","CL=F"];
      
      const [cRes, fRes, nRes, biRes, geckoRes] = await Promise.allSettled([
        fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(symbols)}`, { signal: AbortSignal.timeout(5000) }),
        fetch('https://v6.exchangerate-api.com/v6/739170e39e7a4ef723f3c60d/latest/USD', { signal: AbortSignal.timeout(5000) }),
        fetch('https://newsapi.org/v2/top-headlines?category=business&pageSize=15&country=us&apiKey=6998e582adbd4766aa2fb064ecac2fa1', { signal: AbortSignal.timeout(5000) }),
        fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${biSymbols.join(',')}`),
        fetch('https://api.coingecko.com/api/v3/search/trending')
      ]);

      if (cRes.status === 'fulfilled' && cRes.value.ok) {
        const cData = await cRes.value.json();
        if (Array.isArray(cData)) {
          const all = cData.map(c => ({
            id: c.symbol.toLowerCase().replace('usdt', ''),
            symbol: c.symbol.replace('USDT', ''),
            priceUsd: c.lastPrice,
            changePercent24Hr: c.priceChangePercent,
            state: parseFloat(c.priceChangePercent) > 5 ? 'bullish' : parseFloat(c.priceChangePercent) < -5 ? 'bearish' : 'trending'
          }));
          setCryptoPrices(all.filter(c => !['DOGE','SHIB','PEPE','BONK','WIF','FLOKI'].includes(c.symbol)));
          setMemecoinPrices(all.filter(c => ['DOGE','SHIB','PEPE','BONK','WIF','FLOKI'].includes(c.symbol)));
        }
      }
      if (fRes.status === 'fulfilled' && fRes.value.ok) {
        const fData = await fRes.value.json();
        if (fData.conversion_rates) setFxRates(fData.conversion_rates);
      }
      if (nRes.status === 'fulfilled' && nRes.value.ok) {
        const nData = await nRes.value.json();
        if (nData.articles) setNewsArticles(nData.articles);
      }

      const localBi = { bonds: [] as any[], stocks: [] as any[], signals: [] as any[] };
      if (biRes.status === 'fulfilled' && biRes.value.ok) {
        const d = await biRes.value.json();
        if (d.quoteResponse?.result) {
          localBi.stocks = d.quoteResponse.result.filter((r:any) => r.quoteType === 'EQUITY').map((s:any) => ({
            symbol: s.symbol, price: s.regularMarketPrice, change: s.regularMarketChangePercent, name: s.shortName
          }));
          localBi.bonds = d.quoteResponse.result.filter((r:any) => r.quoteType === 'INDEX' && r.symbol.includes('^')).map((b:any) => ({
            symbol: b.symbol === '^TNX' ? 'US10Y' : b.symbol === '^TYX' ? 'US30Y' : b.symbol,
            yield: b.regularMarketPrice, change: b.regularMarketChange
          }));
        }
      }
      
      localBi.signals = [
        { type: 'SEC Form 4', asset: 'NVDA', scent: 'Strong Buy', actor: 'Director', strength: 85, ts: new Date().toISOString() },
        { type: 'Options Sweep', asset: 'TSLA', scent: 'Bullish Hammer', actor: 'Institutional', strength: 92, ts: new Date().toISOString() },
        { type: 'Central Bank', asset: 'FED', scent: 'Hawkish Tilt', actor: 'Powell', strength: 78, ts: new Date().toISOString() }
      ];
      setBiData(localBi);

      if (geckoRes.status === 'fulfilled' && geckoRes.value.ok) {
        const gData = await geckoRes.value.json();
        if (gData.nfts) setNftAssets(gData.nfts.map((n:any) => ({ id: n.id, name: n.name, symbol: n.symbol, floorPriceEth: n.floor_price_in_native_currency, change24h: n.floor_price_24h_percentage_change, thumb: n.thumb })));
      }

      setWhaleWallets([
        { name: 'Whale 0x71C', address: '0x71C...392', balance: '14,203 ETH', activity: 'Accumulating SHIB', status: 'aggressive' },
        { name: 'Insider 0x1A2', address: '0x1A2...4F1', balance: '2,105 ETH', activity: 'Bridging to L2', status: 'cautious' },
        { name: 'Exchange Deposit', address: '0xBC4...110', balance: '85,000 ETH', activity: 'Inflow Spike', status: 'bullish' }
      ]);

    } catch (err) {
      console.warn('Market fallback fetch failed');
    }
  }, []);

  // Fetch initial market data from Archon
  useMounted(() => {
    fetchMarketData();
  });

  useEffect(() => {
    if (activeModuleId === 'research_lab') fetchMarketData();
  }, [activeModuleId, fetchMarketData]);

  // Real-time market streaming via Tunnel Broadcast
  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (!mounted.current) return;
      const data = e.detail;
      if (data.crypto)    setCryptoPrices(data.crypto);
      if (data.memecoins) setMemecoinPrices(data.memecoins);
      if (data.nfts)      setNftAssets(data.nfts);
      if (data.wallets)   setWhaleWallets(data.wallets);
      if (data.fx)        setFxRates(data.fx);
      if (data.news)      setNewsArticles(data.news);
      if (data.bi)        setBiData(data.bi);
    };
    window.addEventListener('archon:broadcast:market:update', handleUpdate);
    return () => window.removeEventListener('archon:broadcast:market:update', handleUpdate);
  }, [mounted]);

  const executeResearchShell = useCallback(async (cmd: string) => {
    const c = cmd.trim();
    if (!c) return;
    if (c === 'clear') { setResearchTermOutput([]); return; }
    setResearchTermOutput(p => [...p, `$ ${c}`]);
    
    try {
      const res = await fetch(`${ARCHON_BACKEND_URL}/api/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-archon-gateway-key': localStorage.getItem('archon_gateway_key') || ''
        },
        body: JSON.stringify({ command: c, cwd: '/xdragon/research' })
      });
      const data = await res.json();
      if (mounted.current) {
        if (data.stdout) setResearchTermOutput(p => [...p, data.stdout]);
        if (data.stderr) setResearchTermOutput(p => [...p, `Error: ${data.stderr}`]);
      }
    } catch (e) {
      if (mounted.current) setResearchTermOutput(p => [...p, `Network Error: ${String(e)}`]);
    }
  }, [mounted]);

  const handleResearchTermCmd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeResearchShell(researchTermInput);
      setResearchTermInput('');
    }
  };

  // ── Execute / Cancel ──────────────────────────────────────────────────
  const handleExecute = async (overridePrompt?: string) => {
    const execPrompt = overridePrompt || prompt;
    if (!execPrompt.trim() || loading) return;
    const agent = AGENTS[activeAgentId];

    // Agent-specific system prompts — per actual role
    const agentSysPrompts: Record<string, string> = {
      AYO:      'You are Ayo Hastruup, CTO at Archon Nexus. Output production-ready TypeScript/code only — full error handling, no TODOs, no pseudocode. When asked to generate a file, wrap code in a ```typescript or ```tsx block with the filename on the first comment line.',
      ARIA:     'You are Aria Okonkwo-Santos, Chief Creative Officer at Archon Nexus. You design brand systems, visual identities, and creative direction. Produce structured, opinionated creative frameworks. Reference specific design tokens, typography choices, and colour rationale.',
      KENDRA:   'You are Kendra Mwangi-Carter, Chief Growth Officer at Archon Nexus. You own product design strategy, go-to-market execution, marketing campaigns, user acquisition funnels, and commercial positioning. Produce actionable campaign briefs, GTM plans, user flow diagrams, and conversion copy.',
      MEI:      'You are Mei Zhu-Adeyemi, Chief BI Officer at Archon Nexus. You build market intelligence reports, KPI dashboards, competitive analyses, cohort models, and revenue analytics. Format outputs as structured data with tables, metrics hierarchies, and chart descriptions in Mermaid or ASCII where appropriate.',
      KOFI:     'You are Kofi Perempe, Chief Economist at Archon Nexus. You produce economic analysis, financial models, market entry assessments, and investment theses. Cite frameworks, use structured tables, and be quantitative.',
      TUNDE:    'You are Tunde Balogun, Chief Legal Counsel at Archon Nexus. Provide structured legal analysis with applicable legislation references (cite Act, Section, Year). Always include jurisdiction, risk level, and recommended action.',
      MODEBOLA: 'You are Modebola Awolowo, Chief of Staff at Archon Nexus. You synthesise strategy, manage cross-functional decisions, and produce GNDS-standard documentation. Be structured, precise, and authoritative.',
      ARCHON:   'You are The Archon, Digital CEO of Archon Nexus. You make sovereign decisions, orchestrate agents, and produce executive-level strategy. Be authoritative, concise, and visionary. Format all outputs as structured reports when applicable.',
    };

    const sys = agentSysPrompts[activeAgentId] || `You are ${agent.name}, ${agent.role} at Archon Nexus. Be precise and actionable.`;

    setLoading(true); setIsStreaming(true); setOutput(''); setError(null);
    const ctrl = new AbortController(); setAbortCtrl(ctrl);
    let cur = '';

    try {
      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel, stream: true,
          options: { temperature },
          messages: [{ role: 'system', content: sys }, { role: 'user', content: execPrompt }],
        }),
        signal: ctrl.signal,
      });

      // Use jsonl-parsing utility — no manual while-loop
      for await (const chunk of parseJsonlFromResponse<{ message?: { content: string }; done?: boolean }>(res)) {
        if (chunk.message?.content) {
          cur += chunk.message.content;
          setOutput(cur);
          if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
        if (chunk.done) break;
      }

      setHistory(p => [
        { id: Date.now().toString(), prompt: execPrompt, output: cur, timestamp: Date.now(), agentId: activeAgentId },
        ...p,
      ].slice(0, 50));

      // Auto-save significant outputs to Sovereign Vault
      if (cur.length > 200) {
        const category =
          activeModuleId === 'code_studio'   ? 'codebase'  :
          activeModuleId === 'research_lab'  ? 'research'  :
          activeModuleId === 'design_studio' ? 'design'    :
          activeModuleId === 'legal_desk'    ? 'legal'     : 'document';
        SovereignVault.store({
          title:    `${agent.id} · ${execPrompt.substring(0, 60)}`,
          category, content: cur,
          agentId:  activeAgentId,
          tags:     [activeAgentId, activeModuleId, category],
        }).catch(() => {});
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') setError(err.message);
    } finally { setLoading(false); setIsStreaming(false); setAbortCtrl(null); }
  };

  const handleCancel = () => { if (abortCtrl) abortCtrl.abort(); };

  const injectToPrompt = (text: string, title?: string) =>
    setPrompt(p => p ? `${p}\n\n[CONTEXT: ${title||'Injected'}]\n${text}` : `[CONTEXT: ${title||'Injected'}]\n${text}\n\n`);

  // ── Style helpers ─────────────────────────────────────────────────────
  const btnStyle = (primary=false, fontSize='0.64rem', stretch=false): React.CSSProperties => ({
    background: primary ? T.goldDim : 'transparent',
    color: primary ? T.text : T.textMuted,
    border: `1px solid ${primary ? T.gold : T.border}`,
    padding: '6px 12px', cursor: 'pointer', ...mono, fontSize,
    width: stretch ? '100%' : 'auto', flexShrink: 0,
  });
  const inputStyle: React.CSSProperties = {
    width: '100%', background: T.surface, border: `1px solid ${T.border}`,
    color: T.text, padding: '8px', ...mono, fontSize: '0.72rem', resize: 'vertical',
  };

  const activeModule = MODULES.find(m => m.id === activeModuleId)!;
  const activeAgent  = AGENTS[activeAgentId];

  // ============================================================================
  // SHARED OUTPUT BLOCK
  // ============================================================================

  const renderTrainingStudio = () => {
    const ta = AGENTS[trainingAgentId];

    const saveExample = async () => {
      if (!tsExInput.trim() || !tsExOutput.trim()) return;
      const id = await SovereignVault.store({ title: `${trainingAgentId} · ${new Date().toLocaleTimeString()}`, category: 'training', content: JSON.stringify({ input: tsExInput, output: tsExOutput }), agentId: trainingAgentId, tags: [trainingAgentId,'training','example'] });
      setTsExamples(p => [...p, { id, input: tsExInput, output: tsExOutput, ts: Date.now() }]);
      setTsExInput(''); setTsExOutput('');
    };

    const saveKnowledge = async () => {
      if (!tsKnText.trim()) return;
      const id = await SovereignVault.store({ title: tsKnTitle || `${trainingAgentId} knowledge`, category: 'training', content: tsKnText, agentId: trainingAgentId, tags: [trainingAgentId,'training','knowledge'] });
      setTsKnowledge(p => [...p, { id, title: tsKnTitle || 'Untitled', text: tsKnText, ts: Date.now() }]);
      setTsKnTitle(''); setTsKnText('');
    };

    const exportJSONL = () => {
      if (!tsExamples.length) return;
      const lines = tsExamples.map(e => JSON.stringify({ messages: [{ role:'system', content:tsSysPrompt }, { role:'user', content:e.input }, { role:'assistant', content:e.output }] })).join('\n');
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([lines], { type:'application/jsonl' })), download: `${trainingAgentId.toLowerCase()}-training-${Date.now()}.jsonl` });
      a.click(); URL.revokeObjectURL(a.href);
    };

    const importDataset = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async ev => {
        const text = String(ev.target?.result || '');
        for (const line of text.split('\n').filter(l => l.trim())) {
          try {
            const obj = JSON.parse(line);
            const inp = obj.messages?.find((m:{role:string}) => m.role==='user')?.content || obj.input || '';
            const out = obj.messages?.find((m:{role:string}) => m.role==='assistant')?.content || obj.output || '';
            if (!inp || !out) continue;
            const id = await SovereignVault.store({ title: `${trainingAgentId} import`, category:'training', content:JSON.stringify({input:inp,output:out}), agentId:trainingAgentId, tags:[trainingAgentId,'training','example','imported'] });
            setTsExamples(p => [...p, { id, input: inp, output: out, ts: Date.now() }]);
          } catch {}
        }
      };
      reader.readAsText(file); e.target.value = '';
    };

    const savePersona = () => {
      localStorage.setItem(`archon_persona_${trainingAgentId}`, JSON.stringify({ name:tsPersonaName, role:tsPersonaRole, style:tsPersonaStyle, systemPrompt:tsSysPrompt }));
    };

    const syncToArchon = async () => {
      setTsSyncStatus('syncing'); setTsSyncMsg('Syncing to Archon...');
      try {
        const key = localStorage.getItem('archon_gateway_key') || '';
        if (!key) { setTsSyncStatus('error'); setTsSyncMsg('No gateway key — set in Settings → Archon Bridge'); return; }
        const res = await fetch('https://archon-nexus-api-production.up.railway.app/api/agents/' + trainingAgentId + '/training', { method:'POST', headers:{'Content-Type':'application/json','X-Archon-Gateway-Key':key}, body:JSON.stringify({ agentId:trainingAgentId, examples:tsExamples.map(e=>({input:e.input,output:e.output})), persona:{name:tsPersonaName,role:tsPersonaRole,style:tsPersonaStyle,systemPrompt:tsSysPrompt} }) });
        setTsSyncStatus(res.ok ? 'ok' : 'error');
        setTsSyncMsg(res.ok ? `✓ ${tsExamples.length} examples synced` : `Archon ${res.status} — bridge may not be live`);
      } catch { setTsSyncStatus('error'); setTsSyncMsg(`Bridge pending — ${tsExamples.length} examples saved locally`); }
      setTimeout(() => { setTsSyncStatus('idle'); setTsSyncMsg(''); }, 4000);
    };

    const syncColor = ({idle:T.textDim, syncing:T.gold, ok:T.green, error:T.orange} as Record<string,string>)[tsSyncStatus];

    return (
      <div style={{display:'flex', flexDirection:'column', flex:1, overflow:'hidden'}}>
        <div style={{padding:'10px 16px', borderBottom:`1px solid ${T.border}`, background:T.surface2, flexShrink:0}}>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:10}}>
            {Object.keys(AGENTS).map(a => (
              <button key={a} onClick={() => setTrainingAgentId(a)}
                style={{...btnStyle(trainingAgentId===a), borderColor:trainingAgentId===a?AGENTS[a].accent:T.border, color:trainingAgentId===a?AGENTS[a].accent:T.textMuted, whiteSpace:'nowrap', fontSize:'0.58rem'}}>
                {a}
              </button>
            ))}
          </div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div style={{...mono, fontSize:'0.65rem', color:T.text}}>
              <span style={{color:ta.accent, fontWeight:700}}>{ta.id}</span> — {ta.name} · {ta.role}
              <span style={{...mono, fontSize:'0.54rem', color:T.textDim, marginLeft:12}}>{tsLoadingEx ? '◌ loading...' : `${tsExamples.length} examples · ${tsKnowledge.length} knowledge`}</span>
            </div>
            <div style={{display:'flex', gap:6, alignItems:'center'}}>
              {tsSyncMsg && <span style={{...mono, fontSize:'0.56rem', color:syncColor}}>{tsSyncMsg}</span>}
              <button onClick={syncToArchon} disabled={tsSyncStatus==='syncing'} style={{...btnStyle(false), borderColor:T.gold, color:T.gold, fontSize:'0.58rem', opacity:tsSyncStatus==='syncing'?0.6:1}}>
                {tsSyncStatus==='syncing'?'◌ Syncing...':' Sync to Archon'}
              </button>
            </div>
          </div>
        </div>
        <div style={{display:'flex', flex:1, overflow:'hidden'}}>
          <div style={{width:200, borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column', background:T.surface, flexShrink:0}}>
            <div style={{padding:'10px 12px', borderBottom:`1px solid ${T.border}`}}>
              <div style={{...mono, fontSize:'0.5rem', color:T.textDim, letterSpacing:'0.16em', marginBottom:8}}>DATASET</div>
              <div style={{display:'flex', flexDirection:'column', gap:5}}>
                <button onClick={exportJSONL} disabled={!tsExamples.length} style={{...btnStyle(false,'0.6rem',true), opacity:!tsExamples.length?0.4:1}}>Export JSONL ({tsExamples.length})</button>
                <label style={{...btnStyle(false,'0.6rem',true), textAlign:'center', cursor:'pointer'}}>Import Dataset<input type="file" accept=".jsonl,.json" onChange={importDataset} style={{display:'none'}} /></label>
                <button onClick={() => { if(window.confirm(`Delete all ${tsExamples.length} examples?`)) { tsExamples.forEach(e => SovereignVault.delete(e.id)); setTsExamples([]); } }} disabled={!tsExamples.length} style={{...btnStyle(false,'0.6rem',true), color:T.red, borderColor:`${T.red}44`, opacity:!tsExamples.length?0.3:1}}>Clear Memory</button>
              </div>
            </div>
            <div style={{padding:'10px 12px'}}>
              {(['finetune','eval','knowledge','persona'] as const).map(t => (
                <div key={t} onClick={() => setTrainingTab(t)} style={{padding:'6px 8px', cursor:'pointer', borderRadius:3, marginBottom:2, background:trainingTab===t?T.surface2:'transparent', borderLeft:`2px solid ${trainingTab===t?ta.accent:'transparent'}`}}>
                  <span style={{...mono, fontSize:'0.62rem', color:trainingTab===t?ta.accent:T.textMuted}}>
                    {t==='finetune'?'◈ Fine-tune':t==='eval'?'◎ Eval & Test':t==='knowledge'?'◉ Knowledge':'◆ Persona'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{flex:1, overflow:'hidden', display:'flex', flexDirection:'column', background:T.black}}>
            {trainingTab==='finetune' && (
              <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
                <div style={{padding:'8px 14px', borderBottom:`1px solid ${T.border}`, flexShrink:0}}>
                  <div style={{...mono, fontSize:'0.52rem', color:T.textMuted, marginBottom:4}}>SYSTEM PROMPT</div>
                  <textarea value={tsSysPrompt} onChange={e => setTsSysPrompt(e.target.value)} style={{...inputStyle, minHeight:44, fontSize:'0.62rem'}} />
                </div>
                <div style={{padding:'10px 14px', borderBottom:`1px solid ${T.border}`, flexShrink:0, background:T.surface2}}>
                  <div style={{...mono, fontSize:'0.52rem', color:T.gold, marginBottom:8}}>ADD TRAINING EXAMPLE</div>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8}}>
                    <div><div style={{...mono, fontSize:'0.5rem', color:T.textMuted, marginBottom:3}}>USER INPUT</div><textarea value={tsExInput} onChange={e => setTsExInput(e.target.value)} placeholder="What the user says..." style={{...inputStyle, minHeight:64, fontSize:'0.62rem'}} /></div>
                    <div><div style={{...mono, fontSize:'0.5rem', color:T.textMuted, marginBottom:3}}>EXPECTED OUTPUT</div><textarea value={tsExOutput} onChange={e => setTsExOutput(e.target.value)} placeholder={`How ${ta.id} should respond...`} style={{...inputStyle, minHeight:64, fontSize:'0.62rem'}} /></div>
                  </div>
                  <button onClick={saveExample} disabled={!tsExInput.trim()||!tsExOutput.trim()} style={{...btnStyle(true), fontSize:'0.6rem', opacity:(!tsExInput.trim()||!tsExOutput.trim())?0.5:1}}>+ Save Example</button>
                </div>
                <div style={{flex:1, overflowY:'auto', padding:'8px 14px'}}>
                  {!tsExamples.length && <div style={{padding:20, textAlign:'center', ...mono, fontSize:'0.62rem', color:T.textDim}}>No training examples yet.<br/>Add above or import a JSONL dataset.</div>}
                  {tsExamples.map((ex, i) => (
                    <div key={ex.id} style={{background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4, padding:'8px 10px', marginBottom:8}}>
                      <div style={{display:'flex', justifyContent:'space-between', marginBottom:6}}>
                        <span style={{...mono, fontSize:'0.52rem', color:T.textDim}}>#{i+1} · {new Date(ex.ts).toLocaleTimeString()}</span>
                        <button onClick={() => { SovereignVault.delete(ex.id); setTsExamples(p => p.filter(e=>e.id!==ex.id)); }} style={{background:'none', border:'none', color:T.red, cursor:'pointer', ...mono, fontSize:'0.6rem'}}>✕</button>
                      </div>
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
                        <div><div style={{...mono, fontSize:'0.5rem', color:T.textMuted, marginBottom:2}}>USER</div><div style={{...mono, fontSize:'0.6rem', color:T.text, lineHeight:1.6}}>{ex.input.substring(0,120)}{ex.input.length>120?'…':''}</div></div>
                        <div><div style={{...mono, fontSize:'0.5rem', color:ta.accent, marginBottom:2}}>{ta.id}</div><div style={{...mono, fontSize:'0.6rem', color:T.textMuted, lineHeight:1.6}}>{ex.output.substring(0,120)}{ex.output.length>120?'…':''}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {trainingTab==='eval' && (
              <div style={{flex:1, display:'flex', flexDirection:'column', padding:16, gap:12, overflow:'hidden'}}>
                <div style={{...mono, fontSize:'0.56rem', color:T.textMuted, lineHeight:1.7}}>Test {ta.name}'s current responses. Compare against expected output.</div>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={`Test prompt for ${ta.id}...`} style={{...inputStyle, minHeight:80, flexShrink:0}} />
                <div style={{display:'flex', gap:8, flexShrink:0}}>
                  <button onClick={() => { setActiveAgentId(ta.id); handleExecute(); }} disabled={!isHealthy||loading} style={btnStyle(true)}>Run Eval</button>
                  <button onClick={handleCancel} disabled={!loading} style={btnStyle()}>Cancel</button>
                </div>
                {renderOutputBlock()}
              </div>
            )}
            {trainingTab==='knowledge' && (
              <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
                <div style={{padding:'10px 14px', borderBottom:`1px solid ${T.border}`, flexShrink:0, background:T.surface2}}>
                  <div style={{...mono, fontSize:'0.52rem', color:T.gold, marginBottom:8}}>ADD TO {ta.id}'S RAG MEMORY</div>
                  <input value={tsKnTitle} onChange={e => setTsKnTitle(e.target.value)} placeholder="Title / source" style={{...inputStyle, marginBottom:6, fontSize:'0.62rem'}} />
                  <textarea value={tsKnText} onChange={e => setTsKnText(e.target.value)} placeholder="Paste knowledge text..." style={{...inputStyle, minHeight:80, fontSize:'0.62rem'}} />
                  <div style={{display:'flex', gap:8, marginTop:8}}>
                    <button onClick={saveKnowledge} disabled={!tsKnText.trim()} style={btnStyle(true)}>+ Save</button>
                  </div>
                </div>
                <div style={{flex:1, overflowY:'auto', padding:'8px 14px'}}>
                  {!tsKnowledge.length && <div style={{padding:20, textAlign:'center', ...mono, fontSize:'0.62rem', color:T.textDim}}>No knowledge entries yet.</div>}
                  {tsKnowledge.map((k, i) => (
                    <div key={k.id} style={{background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4, padding:'8px 10px', marginBottom:8}}>
                      <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                        <span style={{...mono, fontSize:'0.64rem', color:T.text, fontWeight:600}}>#{i+1} {k.title}</span>
                        <button onClick={() => { SovereignVault.delete(k.id); setTsKnowledge(p => p.filter(x=>x.id!==k.id)); }} style={{background:'none', border:'none', color:T.red, cursor:'pointer', ...mono, fontSize:'0.6rem'}}>✕</button>
                      </div>
                      <div style={{...mono, fontSize:'0.58rem', color:T.textMuted, lineHeight:1.6}}>{k.text.substring(0,200)}{k.text.length>200?'…':''}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {trainingTab==='persona' && (
              <div style={{flex:1, overflowY:'auto', padding:16}}>
                <div style={{display:'flex', flexDirection:'column', gap:12, maxWidth:460}}>
                  <div><label style={{...mono, fontSize:'0.54rem', color:T.textMuted, display:'block', marginBottom:3}}>Display Name</label><input value={tsPersonaName} onChange={e=>setTsPersonaName(e.target.value)} placeholder={ta.name} style={inputStyle} /></div>
                  <div><label style={{...mono, fontSize:'0.54rem', color:T.textMuted, display:'block', marginBottom:3}}>Role / Title</label><input value={tsPersonaRole} onChange={e=>setTsPersonaRole(e.target.value)} placeholder={ta.role} style={inputStyle} /></div>
                  <div><label style={{...mono, fontSize:'0.54rem', color:T.textMuted, display:'block', marginBottom:3}}>Communication Style</label><textarea value={tsPersonaStyle} onChange={e=>setTsPersonaStyle(e.target.value)} style={{...inputStyle, minHeight:64}} /></div>
                  <div><label style={{...mono, fontSize:'0.54rem', color:T.textMuted, display:'block', marginBottom:3}}>System Prompt Override</label><textarea value={tsSysPrompt} onChange={e=>setTsSysPrompt(e.target.value)} style={{...inputStyle, minHeight:100, fontSize:'0.62rem'}} /></div>
                  <div style={{display:'flex', gap:8}}>
                    <button onClick={savePersona} style={btnStyle(true)}>Save Persona</button>
                    <button onClick={() => { setTsPersonaName(ta.name); setTsPersonaRole(ta.role); setTsPersonaStyle('Direct, analytical, decisive.'); setTsSysPrompt(`You are ${ta.name}, ${ta.role} at Archon Nexus.`); }} style={btnStyle()}>Reset</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // SHARED OUTPUT BLOCK
  // ============================================================================
  const renderOutputBlock = () => (
    <div ref={outputRef} style={{ flex:1, overflowY:'auto', padding:'12px 16px', ...mono, fontSize:'0.72rem', lineHeight:1.7, color:T.text, background:T.surface2, borderRadius:4, display:'flex', flexDirection:'column' }}>
      {output ? parseOutputBlocks(output).map((block, i) => {
        if (block.type === 'text') return <span key={i} style={{whiteSpace:'pre-wrap'}}>{block.content}</span>;
        return (
          <div key={i} style={{margin:'12px 0', border:`1px solid ${T.border}`, borderRadius:4, overflow:'hidden', background:T.black}}>
            <div style={{padding:'4px 8px', background:T.surface3, borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div style={{display:'flex', gap:8, alignItems:'center'}}>
                <span style={{color:T.gold, fontSize:'0.6rem'}}>{block.lang}</span>
                <span style={{color:T.textMuted, fontSize:'0.6rem'}}>{block.filename}</span>
              </div>
              <div style={{display:'flex', gap:8}}>
                {activeModuleId === 'code_studio' && (
                  <button onClick={() => {
                    const id = Date.now().toString();
                    setOpenTabs(p => [...p, {id, name: block.filename||'snippet', content: block.content, lang: block.lang, modified:false}]);
                    setActiveTabId(id);
                  }} style={btnStyle(false,'0.55rem')}>Open in IDE</button>
                )}
                <button onClick={() => navigator.clipboard.writeText(block.content)} style={btnStyle(false,'0.55rem')}>Copy</button>
              </div>
            </div>
            <pre style={{margin:0, padding:'12px', overflowX:'auto', color:T.teal, fontSize:'0.68rem'}}>{block.content}</pre>
          </div>
        );
      }) : <span style={{color:T.textDim}}>{AGENTS[activeAgentId].name} is ready. Enter a prompt above.</span>}
      {isStreaming && <span style={{color:T.gold}}>▌</span>}
      {error    && <span style={{color:T.red, marginTop:8}}>Error: {error}</span>}
    </div>
  );

  // ============================================================================
  // MODULE RENDERERS
  // ============================================================================

  // ── Code Studio ─────────────────────────────────────────────────────
  // ── Code Studio — delegated to CodeStudio component ─────────────────
  const renderCodeStudio = () => (
    <CodeStudio
      openTabs={openTabs}
      activeTabId={activeTabId}
      onOpenTab={tab => { setOpenTabs(p => p.find(t=>t.id===tab.id) ? p : [...p, tab]); setActiveTabId(tab.id); }}
      onUpdateContent={(id, content) => setOpenTabs(tabs => tabs.map(t => t.id===id ? {...t, content, modified:true} : t))}
      onCloseTab={id => { setOpenTabs(tabs => tabs.filter(t=>t.id!==id)); if(activeTabId===id) setActiveTabId(openTabs.find(t=>t.id!==id)?.id ?? null); }}
      setActiveTabId={setActiveTabId}
      activeAgentId={activeAgentId}
      setActiveAgentId={setActiveAgentId}
      isHealthy={isHealthy}
      selectedModel={selectedModel}
      temperature={temperature}
      setTemperature={setTemperature}
    />
  );

  // ── Research Lab ────────────────────────────────────────────────────
  const renderResearchLab = () => {
    // Top Bar Sub-renderer
    const renderTopBar = () => (
      <div style={{flexShrink:0, height:130, borderBottom:`1px solid ${T.border}`, display:'flex', background: T.surface2}}>
        {/* LEFT: CRYPTO/NFT/WALLETS */}
        <div style={{flex:1, borderRight:`1px solid ${T.border}`, padding:12, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
          <div style={{...mono, fontSize:'0.55rem', color:T.gold, marginBottom:8, display:'flex', justifyContent:'space-between', alignItems: 'center'}}>
            <div style={{display: 'flex', gap: 12}}>
              {(['majors','memes','nfts','wallets'] as const).map(t => (
                <span key={t} onClick={() => setCryptoSubTab(t)} 
                  style={{cursor: 'pointer', color: cryptoSubTab===t?T.gold:T.textDim, borderBottom: cryptoSubTab===t?`1px solid ${T.gold}`:'none', paddingBottom: 2}}>
                  {t.toUpperCase()}
                </span>
              ))}
            </div>
            <span style={{cursor:'pointer', fontSize: '0.6rem'}} onClick={fetchMarketData}>↻ LIVE</span>
          </div>
          
          <div id="crypto-scroll-container" style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:8, flex: 1, overflowY: 'auto'}} className="ide-scrollbar">
            {cryptoSubTab === 'majors' && cryptoPrices.map(c => (
              <div key={c.id} style={{...mono, fontSize:'0.64rem', padding: '8px 10px', background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 3}}>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span style={{color:T.text, fontWeight: 'bold'}}>{c.symbol}</span>
                  <span style={{color:parseFloat(c.changePercent24Hr)>=0?T.green:T.red, fontSize:'0.5rem'}}>{parseFloat(c.changePercent24Hr)>=0?'+':''}{parseFloat(c.changePercent24Hr).toFixed(2)}%</span>
                </div>
                <div style={{color:T.textMuted, marginTop: 2}}>${parseFloat(c.priceUsd).toLocaleString()}</div>
              </div>
            ))}

            {cryptoSubTab === 'memes' && memecoinPrices.map(c => (
              <div key={c.id} style={{...mono, fontSize:'0.64rem', padding: '8px 10px', background: T.black, border: `1px solid ${c.state==='bullish'?T.greenDim:c.state==='bearish'?T.redDim:T.border}`, borderRadius: 3, position: 'relative'}}>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span style={{color:T.text}}>{c.symbol}</span>
                  <span style={{fontSize:'0.45rem', padding:'1px 3px', borderRadius:2, background:c.state==='bullish'?T.green:c.state==='bearish'?T.red:T.goldDim, color:T.black}}>
                    {c.state?.toUpperCase()}
                  </span>
                </div>
                <div style={{color:T.textDim, fontSize:'0.55rem', marginTop:4}}>${parseFloat(c.priceUsd).toFixed(8)}</div>
              </div>
            ))}

            {cryptoSubTab === 'nfts' && nftAssets.map(n => (
              <div key={n.id} style={{display: 'flex', gap: 8, padding: 6, background: T.surface3, borderRadius: 4, border: `1px solid ${T.border}`}}>
                <img src={n.thumb} style={{width: 24, height: 24, borderRadius: 2}} />
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{...mono, fontSize: '0.6rem', color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{n.name}</div>
                  <div style={{...mono, fontSize: '0.5rem', color: T.gold}}>{n.floorPriceEth?.toFixed(3)} ETH ({n.change24h?.toFixed(1)}%)</div>
                </div>
              </div>
            ))}

            {cryptoSubTab === 'wallets' && whaleWallets.map((w, i) => (
              <div key={i} style={{...mono, fontSize: '0.55rem', padding: 6, background: T.surface3, borderLeft: `2px solid ${w.status==='aggressive'?T.red:T.green}`, borderRadius: '0 3px 3px 0'}}>
                <div style={{color: T.text, fontWeight: 'bold'}}>{w.name}</div>
                <div style={{color: T.textDim, fontSize: '0.45rem'}}>{w.activity}</div>
              </div>
            ))}

            {(cryptoSubTab==='majors' ? cryptoPrices : cryptoSubTab==='memes' ? memecoinPrices : cryptoSubTab==='nfts' ? nftAssets : whaleWallets).length === 0 && 
              <div style={{...mono, fontSize: '0.55rem', color: T.textDim, gridColumn: 'span 3', textAlign: 'center', paddingTop: 10}}>Connecting to Liquidity Hub...</div>}
          </div>
        </div>

        {/* RIGHT: FOREX & MACRO */}
        <div style={{width:researchSide.size, padding:12, flexShrink:0, display: 'flex', flexDirection: 'column', background: T.surface3}}>
          <div style={{...mono, fontSize:'0.55rem', color:T.gold, marginBottom:8, letterSpacing: '0.1em'}}>GLOBAL FOREX (USD)</div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 10px', ...mono, fontSize:'0.64rem', flex: 1, overflowY: 'auto'}} className="ide-scrollbar">
            {['NGN','GHS','KES','ZAR','EUR','GBP','JPY','CNY','BRL','INR'].map(cur => (
              <div key={cur} style={{display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${T.border}44`, paddingBottom: 2}}>
                <span style={{color:T.textDim}}>{cur}</span> 
                <span style={{color:T.text}}>{fxRates[cur] ? fxRates[cur].toFixed(2) : '---'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );

    return (
      <div style={{display:'flex', flexDirection:'column', flex:1, overflow:'hidden', background: T.black}}>
        {renderTopBar()}

        {/* BLOOMBERG-STYLE LIVE SIGNALS / BI STREAM */}
        <div style={{flexShrink:0, height:180, borderBottom:`1px solid ${T.border}`, padding: '10px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: T.black}}>
          <div style={{...mono, fontSize:'0.55rem', color:T.gold, marginBottom:10, letterSpacing: '0.14em', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div style={{display: 'flex', gap: 15, alignItems: 'center'}}>
              <span>BUSINESS INTELLIGENCE STREAM</span>
              <div style={{display: 'flex', gap: 10}}>
                {(['signals','stocks','bonds'] as const).map(t => (
                  <span key={t} onClick={() => setBiSubTab(t)} style={{cursor: 'pointer', color: biSubTab===t?T.gold:T.textDim}}>
                    [{t.toUpperCase()}]
                  </span>
                ))}
              </div>
            </div>
            <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
              {biSubTab === 'stocks' && (
                <select style={{background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontSize: '0.5rem', ...mono, outline:'none'}}>
                  <option>US (NASDAQ/NYSE)</option>
                  <option>UK (LSE)</option>
                  <option>NG (NGX)</option>
                  <option>JP (TSE)</option>
                </select>
              )}
              <span style={{color: T.textDim, fontSize: '0.5rem'}}>LIVE RECAP • {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
          
          <div id="bi-scroll-container" style={{flex: 1, display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 10}} className="ide-scrollbar">
            {biSubTab === 'signals' && biData.signals.map((s:any, i:number) => (
              <div key={i} style={{minWidth: 240, background: T.surface2, borderLeft: `3px solid ${T.gold}`, padding: 10, borderRadius: '0 4px 4px 0'}}>
                <div style={{...mono, fontSize: '0.5rem', color: T.gold, marginBottom: 4}}>{s.type} • {s.actor}</div>
                <div style={{...mono, fontSize: '0.65rem', color: T.text, fontWeight: 'bold'}}>{s.asset}: {s.scent}</div>
                <div style={{marginTop: 6, width: '100%', height: 2, background: T.border, position: 'relative'}}>
                  <div style={{width: `${s.strength}%`, height: '100%', background: T.gold}} />
                </div>
                <div style={{...mono, fontSize: '0.45rem', color: T.textDim, marginTop: 4}}>SCENT STRENGTH: {s.strength}%</div>
              </div>
            ))}

            {biSubTab === 'stocks' && biData.stocks.map((s:any, i:number) => (
              <div key={i} style={{minWidth: 160, background: T.surface3, border: `1px solid ${T.border}`, padding: 8, borderRadius: 4}}>
                <div style={{...mono, fontSize: '0.6rem', color: T.text, fontWeight: 'bold'}}>{s.symbol}</div>
                <div style={{...mono, fontSize: '0.5rem', color: T.textDim}}>{s.name}</div>
                <div style={{...mono, fontSize: '0.7rem', color: s.change >= 0 ? T.green : T.red, marginTop: 4}}>${s.price.toFixed(2)} ({s.change.toFixed(2)}%)</div>
              </div>
            ))}

            {biSubTab === 'bonds' && biData.bonds.map((b:any, i:number) => (
              <div key={i} style={{minWidth: 140, background: T.surface3, border: `1px solid ${T.border}`, padding: 8, borderRadius: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                <div style={{...mono, fontSize: '0.55rem', color: T.textDim}}>{b.symbol}</div>
                <div style={{...mono, fontSize: '1rem', color: T.text, fontWeight: 'bold'}}>{b.yield.toFixed(3)}%</div>
                <div style={{...mono, fontSize: '0.5rem', color: b.change >= 0 ? T.green : T.red}}>{b.change >= 0 ? '+' : ''}{b.change.toFixed(4)}</div>
              </div>
            ))}

            {newsArticles.slice(0, 5).map((a,i) => (
              <div key={i} onClick={() => injectToPrompt(`Source: ${a.source.name}\nTitle: ${a.title}`,'News')}
                style={{minWidth: 260, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: 10, cursor: 'pointer'}}>
                <div style={{...mono, fontSize: '0.5rem', color: T.textDim, marginBottom: 4}}>{a.source.name} • {new Date(a.publishedAt).getHours()}:00</div>
                <div style={{...mono, fontSize: '0.62rem', color: T.text, height: 32, overflow: 'hidden'}}>{a.title}</div>
              </div>
            ))}
          </div>
        </div>

        {/* WORKSPACE AREA */}
        <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
          <div style={{display:'flex', background:T.surface2, borderBottom:`1px solid ${T.border}`, flexShrink:0, height: 38, alignItems: 'center', padding: '0 8px'}}>
            {(['browser','ai','terminal'] as const).map(t => (
              <button key={t} onClick={() => setResearchTab(t)}
                style={{height: '100%', padding:'0 16px', background: 'transparent', border: 'none', cursor:'pointer', ...mono, fontSize:'0.6rem', color:researchTab===t?T.gold:T.textMuted, borderBottom:`2px solid ${researchTab===t?T.gold:'transparent'}`, transition: 'all 0.2s'}}>
                {t.toUpperCase()} {t==='terminal' ? 'IDE' : t==='browser' ? 'SOURCE' : 'RESEARCH'}
              </button>
            ))}
            <div style={{flex:1}} />
            <div style={{display: 'flex', gap: 8, paddingRight: 8}}>
              <button onClick={() => setPrompt('Launch xOrbit simulation: initiate deep research and predictive analysis on current market trajectory...')} style={{...btnStyle(), fontSize: '0.5rem', color: T.purple}}>xORBIT ↑</button>
              <button onClick={() => setPrompt('Query MemSight persistent memory — retrieve relevant agent context, learned patterns, and experience facts for current session...')} style={{...btnStyle(), fontSize: '0.5rem', color: T.teal}}>MEMSIGHT ↓</button>
            </div>
          </div>
          
          <div style={{flex:1, overflow:'hidden', display:'flex', flexDirection:'column'}}>
            {researchTab==='browser' && (
              <BrowserPanel daemonUrl="http://localhost:3001" embedded={true} onExtract={(text,url) => {setResearchTab('ai'); injectToPrompt(text,url);}} />
            )}

            {researchTab==='ai' && (
              <div style={{flex:1, display:'flex', flexDirection:'column', padding:16, gap:12, overflow:'hidden', background: T.black}}>
                <div style={{display:'flex', gap:8, alignItems:'center', flexShrink:0}}>
                  <select value={activeAgentId} onChange={e => setActiveAgentId(e.target.value)}
                    style={{background:T.surface2, border:`1px solid ${T.border}`, color:T.text, padding:'4px 8px', ...mono, fontSize:'0.62rem', outline:'none', borderRadius:3}}>
                    <option value="MEI">MEI — Business Intelligence</option>
                    <option value="KOFI">KOFI — Economic Analysis</option>
                    <option value="TUNDE">TUNDE — Legal & Regulatory</option>
                  </select>
                  <span style={{...mono, fontSize:'0.54rem', color: activeAgentId==='MEI'?T.teal:activeAgentId==='KOFI'?T.blue:T.sage}}>
                    ◈ {activeAgentId==='MEI'?'KPIs · Cohorts · Data':'Macro · Models · Strategy'}
                  </span>
                </div>

                <div style={{display:'flex', gap:5, flexWrap:'wrap', flexShrink:0}}>
                  {(activeAgentId === 'MEI' ? [
                    ['BI Report', 'Generate metric report for...'], ['Cohort', 'Perform retention analysis...'], ['Comp Intel', 'Analyse competitors...']
                  ] : activeAgentId === 'KOFI' ? [
                    ['Market Entry', 'Assess entry strategy for...'], ['Fin Model', 'Build projection for...'], ['Econ Brief', 'Macro overview of...']
                  ] : [
                    ['Compliance', 'Compliance review for...'], ['Regulatory', 'Research legal landscape...']
                  ]).map(([label, tmpl]) => (
                    <button key={label as string} onClick={() => setPrompt(tmpl as string)}
                      style={{...mono, fontSize:'0.52rem', padding:'3px 8px', background:T.surface3, border:`1px solid ${T.border}`, color:T.textMuted, cursor:'pointer', borderRadius:3}}>
                      {label as string}
                    </button>
                  ))}
                </div>

                <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                  placeholder="Describe your research task..."
                  style={{...inputStyle, minHeight:80, flexShrink:0, background: T.surface2}} />
                
                <div style={{display:'flex', gap:8, flexShrink:0}}>
                  <button onClick={() => handleExecute()} disabled={!isHealthy||loading} style={btnStyle(true)}>▶ RESEARCH</button>
                  <button onClick={handleCancel} disabled={!loading} style={btnStyle()}>■ ABORT</button>
                </div>
                {renderOutputBlock()}
              </div>
            )}

            {researchTab==='terminal' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '0 12px', background: T.surface2, borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 32 }}>
                  <div style={{ display: 'flex', gap: 14, height: '100%', alignItems: 'center' }}>
                    {(['terminal', 'problems', 'output'] as const).map(t => (
                      <span key={t} onClick={() => setResearchActiveTermTab(t)}
                        style={{ ...mono, fontSize: '0.54rem', color: researchActiveTermTab === t ? T.gold : T.textDim, cursor: 'pointer', borderBottom: researchActiveTermTab===t?`1px solid ${T.gold}`:'none', height: '100%', display: 'flex', alignItems: 'center' }}>
                        {t.toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => executeResearchShell('npm run test')} style={{ ...btnStyle(), padding: '1px 6px', fontSize: '0.5rem', color: T.green }}>RUN TESTS</button>
                    <button onClick={() => setResearchTermOutput([])} style={{ ...btnStyle(), padding: '1px 6px', fontSize: '0.5rem' }}>CLEAR</button>
                    <button style={{ ...btnStyle(), padding: '1px 6px', fontSize: '0.5rem', color: T.red }}>KILL</button>
                  </div>
                </div>
                
                {researchActiveTermTab === 'terminal' && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ flex: 1, background: T.black, padding: '10px 14px', ...mono, fontSize: '0.62rem', overflowY: 'auto' }} className="ide-scrollbar">
                      {researchTermOutput.map((l, i) => (
                        <div key={i} style={{ color: l.startsWith('$') ? T.teal : T.textMuted, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{l}</div>
                      ))}
                    </div>
                    <div style={{ padding: '4px 12px', background: T.surface, borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center' }}>
                      <span style={{ color: T.green, marginRight: 8, ...mono, fontSize: '0.6rem' }}>research$</span>
                      <input 
                        value={researchTermInput}
                        onChange={e => setResearchTermInput(e.target.value)}
                        onKeyDown={handleResearchTermCmd}
                        style={{ background: 'transparent', border: 'none', color: T.text, outline: 'none', flex: 1, ...mono, fontSize: '0.62rem' }} 
                        placeholder="Enter command (e.g. node analyze-market.js)" 
                      />
                    </div>
                  </div>
                )}

                {researchActiveTermTab === 'problems' && (
                  <div style={{ flex: 1, background: T.black, padding: 16, ...mono, fontSize: '0.65rem', color: T.green }}>
                    ✓ No issues detected in research intelligence node.
                  </div>
                )}
                
                {researchActiveTermTab === 'output' && (
                  <div style={{ flex: 1, background: T.black, padding: 16, ...mono, fontSize: '0.65rem', color: T.textDim }}>
                    [SYSTEM] Switched to research workspace: /xdragon/research<br/>
                    [SWIFT] Node connected: 0x882a... (Lagos Relay)<br/>
                    [DAEMON] Ollama streaming active.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Design Studio — ARIA (visual/brand) + KENDRA (product design/marketing) ──
  const renderDesignStudio = () => (
    <div style={{display:'flex', flexDirection:'column', flex:1, overflow:'hidden'}}>
      {/* Mode tabs */}
      <div style={{flexShrink:0, height:42, borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', padding:'0 16px', gap:0, background:T.surface2}}>
        {([
          ['brand',    'Brand System',        T.purple],
          ['moodboard','Moodboard',           T.purple],
          ['copy',     'Copy & Campaign',     T.orange],
          ['penpot',   '✦ Penpot Editor',    '#b04a9a'],
        ] as const).map(([id, label, color]) => (
          <button key={id}
            onClick={() => setDesignTab(id as typeof designTab)}
            style={{...mono, fontSize:'0.58rem', padding:'0 14px', height:'100%', background:'transparent', border:'none',
              borderBottom:`2px solid ${designTab===id ? color : 'transparent'}`,
              color: designTab===id ? color : T.textMuted, cursor:'pointer', letterSpacing:'0.06em', transition:'all 0.15s'}}>
            {label}
          </button>
        ))}
      </div>

      {/* Penpot editor — full panel, no side panel */}
      {designTab === 'penpot' && (
        <div style={{flex:1, overflow:'hidden'}}>
          <PenpotPanel
            onExport={(url, filename) => {
              // Save exported asset to Sovereign Vault
              SovereignVault.store({ title: filename, category: 'design', content: url, agentId: activeAgentId, tags: ['penpot','export',filename] }).catch(()=>{});
            }}
            onInject={(fn) => setPrompt(fn)}
          />
        </div>
      )}

      {/* Brand / Moodboard / Copy — two-column layout */}
      {designTab !== 'penpot' && (
        <div style={{display:'flex', flex:1, overflow:'hidden'}}>
          {/* Left panel — agent-aware quick actions */}
          <div style={{width:290, borderRight:`1px solid ${T.border}`, padding:14, display:'flex', flexDirection:'column', gap:12, overflowY:'auto', flexShrink:0}}>

            {/* Agent selector with role context */}
            <div>
              <div style={{...mono, fontSize:'0.5rem', color:T.textDim, letterSpacing:'0.14em', marginBottom:5}}>AGENT</div>
              <select value={activeAgentId} onChange={e => setActiveAgentId(e.target.value)}
                style={{width:'100%', background:T.surface, border:`1px solid ${T.border}`, color:T.text, padding:'5px 8px', ...mono, fontSize:'0.62rem', outline:'none', borderRadius:3}}>
                <option value="ARIA">ARIA — Visual Design & Brand Identity</option>
                <option value="KENDRA">KENDRA — Product Design & Marketing</option>
              </select>
              <div style={{...mono, fontSize:'0.52rem', color: activeAgentId==='KENDRA' ? T.orange : T.purple, marginTop:4, lineHeight:1.6}}>
                {activeAgentId === 'KENDRA'
                  ? 'GTM strategy · Campaigns · User flows · Product positioning · Conversion funnels'
                  : 'Brand systems · Visual identity · Moodboards · Design tokens · Creative direction'}
              </div>
            </div>

            {/* Contextual quick actions per agent */}
            <div>
              <div style={{...mono, fontSize:'0.5rem', color:T.textDim, letterSpacing:'0.14em', marginBottom:6}}>QUICK TASKS</div>
              <div style={{display:'flex', flexWrap:'wrap', gap:5}}>
                {activeAgentId === 'KENDRA' ? [
                  ['GTM Plan',            `Draft a complete Go-To-Market plan for:\n\nProduct:\nTarget market:\nLaunch date:\nKey channels:\nBudget range:\n\nInclude: positioning, messaging, channel strategy, KPIs, timeline.`],
                  ['Campaign Brief',      `Create a marketing campaign brief:\n\nProduct/Feature:\nObjective:\nTarget audience:\nKey message:\nChannels (social/email/ads):\nBudget:\nTimeline:`],
                  ['User Flow',           `Map the complete user flow for:\n\nProduct:\nUser journey (onboarding/conversion/retention):\nKey screens/steps:\nDrop-off points to address:\n\nOutput as numbered step diagram.`],
                  ['Product Positioning', `Define product positioning for:\n\nProduct:\nCompetitors:\nTarget segment:\nCore value prop:\n\nOutput: positioning statement, differentiation matrix, messaging pillars.`],
                  ['Email Sequence',      `Write a 5-email onboarding sequence for:\n\nProduct:\nUser type:\nKey action to drive:\n\nInclude: subject lines, preview text, body, CTA.`],
                  ['Ad Copy Variants',    `Generate 6 ad copy variants for:\n\nProduct:\nPlatform (Meta/Google/LinkedIn):\nObjective:\n\nFormat: 3 headlines + 3 body variants per format.`],
                ] : [
                  ['Brand Brief',         `Create a complete brand brief:\n\nBrand name:\nIndustry:\nTarget audience:\nPersonality traits:\n\nInclude: visual direction, typography, colour palette rationale, voice.`],
                  ['Design System',       `Define a design system for:\n\nProduct:\nExisting tokens: ${JSON.stringify({gold:'#c9a84c', black:'#080808'})}\n\nOutput: component library structure, spacing scale, typography scale, icon style.`],
                  ['Moodboard Brief',     `Create a moodboard direction:\n\nBrand/Product:\nTone (dark/light/neutral):\nInspiration references:\n\nOutput: visual direction, texture/material references, photography style.`],
                  ['Logo Concept',        `Describe logo concepts for:\n\nBrand:\nValues:\nStyle (minimal/bold/geometric):\n\nOutput: 3 distinct concept directions with rationale.`],
                  ['Social Kit',          `Design a social media kit:\n\nBrand:\nPlatforms:\nContent pillars:\n\nOutput: profile specs, post template formats, story guidelines.`],
                  ['Brand Voice',         `Define brand voice and tone:\n\nBrand:\nPersonality:\nAudience:\n\nOutput: voice pillars, do/don't examples, tone by channel.`],
                ].map(([label, tmpl]) => (
                  <button key={label as string}
                    onClick={() => setPrompt(tmpl as string)}
                    style={{...mono, fontSize:'0.54rem', padding:'4px 9px', background:T.surface3, border:`1px solid ${T.border}`,
                      color:T.textMuted, cursor:'pointer', borderRadius:3, transition:'all 0.12s'}}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = activeAgentId==='KENDRA' ? T.orange : T.purple; (e.currentTarget as HTMLElement).style.color = activeAgentId==='KENDRA' ? T.orange : T.purple; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border; (e.currentTarget as HTMLElement).style.color = T.textMuted; }}>
                    {label as string}
                  </button>
                ))}
              </div>
            </div>

            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder={activeAgentId === 'KENDRA' ? 'Describe the campaign, product design, or GTM task...' : 'Describe the brand, visual system, or creative brief...'}
              style={{flex:1, minHeight:140, width:'100%', background:T.surface, border:`1px solid ${T.border}`, color:T.text, padding:'8px', ...mono, fontSize:'0.65rem', resize:'vertical', outline:'none', borderRadius:3}} />

            <div style={{display:'flex', gap:8}}>
              <button onClick={() => handleExecute()} disabled={!isHealthy||loading}
                style={{flex:1, background:T.goldDim, color:T.text, border:`1px solid ${T.gold}`, padding:'7px', cursor:'pointer', ...mono, fontSize:'0.62rem', borderRadius:3}}>
                {loading ? '◌ Generating...' : `▶ ${activeAgentId==='KENDRA' ? 'Execute Campaign' : 'Generate'}`}
              </button>
              <button onClick={handleCancel} disabled={!loading}
                style={{background:'transparent', color:T.textMuted, border:`1px solid ${T.border}`, padding:'7px 12px', cursor:'pointer', ...mono, fontSize:'0.62rem', borderRadius:3}}>
                ■
              </button>
            </div>
          </div>

          {/* Right — output canvas */}
          <div style={{flex:1, background:T.surface, padding:24, overflowY:'auto'}}>
            {designTab === 'brand' && (
              <div>
                <div style={{...mono, color: activeAgentId==='KENDRA' ? T.orange : T.purple, fontSize:'0.68rem', fontWeight:700, letterSpacing:'0.14em', marginBottom:16}}>
                  {activeAgentId === 'KENDRA' ? '◈ PRODUCT DESIGN & MARKETING OUTPUT' : '◈ BRAND SYSTEM OUTPUT'}
                </div>
                {renderOutputBlock()}
              </div>
            )}
            {designTab === 'moodboard' && (
              <div>
                <div style={{...mono, color:T.purple, fontSize:'0.68rem', fontWeight:700, letterSpacing:'0.14em', marginBottom:16}}>◈ MOODBOARD</div>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
                  {[1,2,3,4,5,6].map(i => (
                    <div key={i} style={{border:`1px solid ${T.purple}44`, background:T.surface2, padding:16, borderRadius:6}}>
                      <div style={{display:'flex', gap:8, marginBottom:10}}>
                        <div style={{width:28,height:28,background:T.gold,borderRadius:2}}/><div style={{width:28,height:28,background:T.black,borderRadius:2}}/><div style={{width:28,height:28,background:T.text,borderRadius:2}}/>
                      </div>
                      <div style={{...mono, color:T.text, fontSize:'0.65rem', fontWeight:600}}>Direction #{i}</div>
                      <div style={{...mono, color:T.textMuted, fontSize:'0.58rem', marginTop:4}}>Run a Moodboard Brief to populate</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {designTab === 'copy' && (
              <div>
                <div style={{...mono, color:T.orange, fontSize:'0.68rem', fontWeight:700, letterSpacing:'0.14em', marginBottom:16}}>◈ COPY & CAMPAIGN VARIANTS</div>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14}}>
                  {['SAFE','BOLD','AUDACIOUS'].map((variant, i) => (
                    <div key={variant} style={{border:`1px solid ${i===0?T.blue:i===1?T.gold:T.red}44`, padding:14, borderRadius:6, background:T.surface2}}>
                      <div style={{...mono, color:i===0?T.blue:i===1?T.gold:T.red, fontWeight:'bold', fontSize:'0.62rem', marginBottom:8}}>{variant}</div>
                      <div style={{...mono, color:T.textMuted, fontSize:'0.62rem', lineHeight:1.7}}>{output || 'Generate copy using KENDRA or ARIA above'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
  // ── Integration Hub — uses IntegrationCanvas ────────────────────────
  const renderIntegrationHub = () => {
    const activeProject = blueprintProjects.find(p => p.id===activeBpProjectId);
    return (
      <div style={{display:'flex', flexDirection:'column', flex:1, overflow:'hidden'}}>
        {/* View switcher */}
        <div style={{flexShrink:0, display:'flex', alignItems:'center', borderBottom:`1px solid ${T.border}`, background:T.surface2, padding:'0 12px', gap:8, height:40}}>
          <button onClick={() => setIntegrationView('canvas')} style={{...btnStyle(integrationView==='canvas'), color:integrationView==='canvas'?T.purple:T.textMuted, borderColor:integrationView==='canvas'?T.purple:T.border}}>◈ Canvas</button>
          <button onClick={() => setIntegrationView('blueprint')} style={{...btnStyle(integrationView==='blueprint'), color:integrationView==='blueprint'?T.gold:T.textMuted, borderColor:integrationView==='blueprint'?T.gold:T.border}}>◉ Blueprint</button>
          <div style={{flex:1}}/>
          {blueprintProjects.map(p => integrationView==='blueprint' && (
            <button key={p.id} onClick={() => setActiveBpProjectId(p.id)} style={{...btnStyle(activeBpProjectId===p.id), whiteSpace:'nowrap', fontSize:'0.55rem'}}>
              {p.name}{(p.phases||[]).some(ph=>ph.status==='in-progress')?' ◌':''}
            </button>
          ))}
        </div>

        {/* Canvas view — IntegrationCanvas */}
        {integrationView === 'canvas' && (
          <div style={{flex:1, overflow:'hidden', display:'flex', flexDirection:'column'}}>
            <IntegrationCanvas />
          </div>
        )}

        {/* Blueprint view */}
        {integrationView === 'blueprint' && (
          <div style={{display:'flex', flexDirection:'column', flex:1, overflow:'hidden'}}>
            {activeProject && (
              <div style={{padding:16, borderBottom:`1px solid ${T.border}`, background:T.surface, flexShrink:0}}>
                <div style={{...mono, color:T.text, fontSize:'0.8rem', marginBottom:8}}>PROJECT: {activeProject.name}</div>
                <div style={{...mono, color:T.textMuted, fontSize:'0.6rem', marginBottom:12}}>
                  {activeProject.phases.filter(p=>p.status==='done').length}/{activeProject.phases.length} phases complete
                </div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8}}>
                  {activeProject.phases.map((p,i) => {
                    const icon = p.status==='done'?'✓':p.status==='in-progress'?'◌':'○';
                    const color = p.status==='done'?T.green:p.status==='in-progress'?T.gold:T.textDim;
                    return (
                      <div key={i} onClick={() => setPrompt(`Phase: ${p.name} - ${p.desc}\nProvide execution plan.`)}
                        style={{border:`1px solid ${T.border}`, padding:8, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', background:T.surface2}}>
                        <span style={{color:T.text, fontSize:'0.64rem', ...mono}}>{p.name}</span>
                        <span style={{color}}>{icon}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{flex:1, display:'flex', flexDirection:'column', padding:16, gap:12, overflow:'hidden'}}>
              <div style={{display:'flex', gap:8, flexShrink:0, flexWrap:'wrap'}}>
                {['Synthesise','Project Plan','GNDS Doc','API Design','Workflow','Decision Log'].map(p => (
                  <button key={p} onClick={() => setPrompt(`Generate a ${p} for ${activeProject?.name||'project'}:\n`)} style={btnStyle(false,'0.55rem')}>{p}</button>
                ))}
              </div>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Integration / Ops prompt..." style={{...inputStyle, minHeight:80, flexShrink:0}} />
              <div style={{display:'flex', gap:8, flexShrink:0}}>
                <button onClick={() => handleExecute()} disabled={!isHealthy||loading} style={btnStyle(true)}>▶ EXECUTE</button>
                <button onClick={handleCancel} disabled={!loading} style={btnStyle()}>■ CANCEL</button>
              </div>
              {renderOutputBlock()}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Services ────────────────────────────────────────────────────────
  const renderServices = () => (
    <div style={{flex:'1 1 0', minHeight:0, overflow:'hidden', display:'flex', flexDirection:'column'}}>
      <ServicesModule onInject={(text: string) => setPrompt(prev => prev ? `${prev}\n\n${text}` : text)} />
      <div style={{flexShrink:0, height:160, borderTop:`1px solid ${T.border}`, background:T.surface, display:'flex', flexDirection:'column', padding:12, gap:8}}>
        <div style={{display:'flex', gap:8, flexWrap:'wrap', flexShrink:0}}>
          {['Deploy Strategy','Dockerfile','CI/CD Pipeline','Runbook','Monitoring','Incident'].map(p => (
            <button key={p} onClick={() => setPrompt(`Draft a ${p}:\n`)} style={btnStyle(false,'0.55rem')}>{p}</button>
          ))}
        </div>
        <div style={{display:'flex', gap:8, flexShrink:0}}>
          <input type="text" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="DevOps / Infra prompt..." style={{...inputStyle, flex:1, minHeight:'auto', padding:'6px 8px'}} />
          <button onClick={() => handleExecute()} disabled={!isHealthy||loading} style={btnStyle(true)}>▶ EXECUTE</button>
        </div>
      </div>
    </div>
  );

  // ── Security ─────────────────────────────────────────────────────────
  const renderSecurity = () => (
    <div style={{display:'flex', flex:1, overflow:'hidden'}}>
      <SecurityModule onInject={fn => setPrompt(fn)} />
    </div>
  );

  // ── Legal Desk ───────────────────────────────────────────────────────
  const renderLegalDesk = () => (
    <div style={{flex:'1 1 0', minHeight:0, overflow:'hidden', display:'flex', flexDirection:'column'}}>
      <LegalDesk onInject={fn => setPrompt(prev => fn(prev))} onOutput={text => setOutput(text)} />
    </div>
  );

  // LAYOUT
  // ============================================================================
  return (
    <div style={{height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden', background:T.surface}}>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* MAIN SPLIT: sidebar + resize handle + content column             */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <div style={{display:'flex', flex:1, overflow:'hidden'}}>

        {/* ══════════════════════════════════════════════════════════════
            SIDEBAR — fixed width, resizable via drag handle
        ══════════════════════════════════════════════════════════════ */}
        <div style={{width:sidebar.size, flexShrink:0, display:'flex', flexDirection:'column', background:T.surface, overflow:'hidden', height:'100%'}}>

          {/* xDragon brand — replaces the old ARCHON NEXUS / module title block */}
          <div style={{padding:'10px 12px 8px', borderBottom:`1px solid ${T.goldBorder}`, flexShrink:0}}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <XDragonMark size={34} />
              <div style={{minWidth:0}}>
                <div style={{fontFamily:'"Georgia",serif', fontSize:'0.9rem', color:T.gold, fontWeight:700, lineHeight:1.2}}>xDragon Studio</div>
                <div style={{...mono, fontSize:'0.46rem', color:T.textDim, marginTop:3, letterSpacing:'0.08em'}}>Alpha S7 · 8 Agents · Archon Supervised</div>
              </div>
            </div>
          </div>

          {/* Daemon status dot */}
          <div style={{padding:'5px 14px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', alignItems:'center', gap:6}}>
            <span style={{width:6, height:6, borderRadius:'50%', background:isHealthy?T.green:T.red, boxShadow:isHealthy?`0 0 6px ${T.green}`:'none', flexShrink:0}} />
            <span style={{...mono, fontSize:'0.52rem', color:isHealthy?T.green:T.red, letterSpacing:'0.14em'}}>{isHealthy?'ONLINE':'OFFLINE'}</span>
          </div>

          {/* ── Scrollable area: modules + settings + history ── */}
          <div style={{flex:1, overflowY:'auto', overflowX:'hidden'}}>

            {/* MODULES label */}
            <div style={{padding:'8px 14px 2px', flexShrink:0}}>
              <span style={{...mono, fontSize:'0.48rem', color:T.textDim, letterSpacing:'0.2em', textTransform:'uppercase'}}>MODULES</span>
            </div>

            {/* Module list */}
            {MODULES.map(mod => (
              <div key={mod.id} onClick={() => setActiveModuleId(mod.id)}
                style={{padding:'8px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:8,
                  background: activeModuleId===mod.id ? T.surface2 : 'transparent',
                  borderLeft:`3px solid ${activeModuleId===mod.id ? MODULE_ACCENTS[mod.id] : 'transparent'}`,
                  transition:'background 0.15s'}}>
                <div style={{minWidth:0}}>
                  <div style={{...mono, color:activeModuleId===mod.id?T.text:T.textMuted, fontSize:'0.68rem', lineHeight:1.3}}>{mod.name}</div>
                  <div style={{...mono, color:activeModuleId===mod.id?MODULE_ACCENTS[mod.id]:T.textDim, fontSize:'0.5rem', marginTop:1}}>← {mod.primary}</div>
                </div>
              </div>
            ))}

            {/* ─── SETTINGS — links to the dedicated /settings page ─── */}
            <div style={{borderTop:`1px solid ${T.border}`, marginTop:4}}>
              <a href="/settings"
                style={{padding:'9px 14px', display:'flex', alignItems:'center', gap:8, textDecoration:'none',
                  background:'transparent', borderLeft:`3px solid transparent`, transition:'background 0.15s',
                  cursor:'pointer'}}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = T.surface2;
                  (e.currentTarget as HTMLElement).style.borderLeftColor = T.gold;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent';
                }}
              >
                <span style={{fontSize:'0.7rem', color:T.textMuted}}>⚙</span>
                <span style={{...mono, fontSize:'0.68rem', color:T.textMuted}}>Settings</span>
                <span style={{...mono, fontSize:'0.56rem', color:T.textDim, marginLeft:'auto'}}>↗</span>
              </a>
            </div>

            {/* ─── HISTORY ─── */}
            <div style={{borderTop:`1px solid ${T.border}`, marginTop:4}}>
              <div onClick={() => setShowHistory(v => !v)}
                style={{padding:'9px 14px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <span style={{...mono, fontSize:'0.68rem', color:T.textMuted}}>History ({history.length})</span>
                <span style={{...mono, fontSize:'0.6rem', color:T.textDim, transition:'transform 0.2s', display:'inline-block', transform:showHistory?'rotate(90deg)':'rotate(0deg)'}}>▶</span>
              </div>
              {showHistory && (
                <div style={{padding:'0 12px 12px', display:'flex', flexDirection:'column', gap:6}}>
                  {history.length===0 && <div style={{...mono, fontSize:'0.6rem', color:T.textDim}}>No history yet.</div>}
                  {history.map(h => (
                    <div key={h.id} style={{padding:8, background:T.surface2, borderRadius:4, cursor:'pointer', border:`1px solid ${T.border}`}}
                      onClick={() => {setPrompt(h.prompt); setOutput(h.output); setActiveAgentId(h.agentId);}}>
                      <div style={{...mono, color:AGENTS[h.agentId].accent, fontSize:'0.5rem'}}>{h.agentId}</div>
                      <div style={{...mono, color:T.text, fontSize:'0.6rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{h.prompt}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>{/* end scrollable */}
        </div>{/* end sidebar */}

        {/* Sidebar resize handle */}
        <ResizeHandle onMouseDown={sidebar.onMouseDown} dir="h" />

        {/* ══════════════════════════════════════════════════════════════
            CONTENT COLUMN — top bar + module area + status bar
            The top bar is INSIDE this column, so the module title
            is naturally shifted right and aligns with the content panel.
        ══════════════════════════════════════════════════════════════ */}
        <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden'}}>

          {/* Module title bar — sits at the top of the content area only.
              Its left edge aligns with the content, NOT with the viewport edge.
              In Code Studio the 48px toolbar is inside renderCodeStudio, so the
              title here visually aligns with the AI/IDE/BLU strip. */}
          <div style={{flexShrink:0, height:38, borderBottom:`1px solid ${T.border}`, background:T.black, display:'flex', alignItems:'center', paddingLeft:16, paddingRight:16, gap:10}}>
            <span style={{color:activeAgent.accent, fontSize:'1rem', flexShrink:0}}>◈</span>
            <span style={{...mono, fontSize:'0.72rem', fontWeight:'bold', color:T.text, textTransform:'uppercase', letterSpacing:'0.08em', flexShrink:0}}>
              {activeModule.name}
            </span>
            <span style={{...mono, fontSize:'0.54rem', color:T.textDim}}>—</span>
            <span style={{...mono, fontSize:'0.56rem', color:T.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
              {activeModule.tagline}
            </span>

            {/* Agent picker — right side of title bar */}
            <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:8, flexShrink:0}}>
              <div style={{display:'flex', alignItems:'center', gap:7, background:T.surface2, padding:'3px 8px', borderRadius:3, border:`1px solid ${T.border}`}}>
                <span style={{width:7, height:7, borderRadius:'50%', background:activeAgent.accent, flexShrink:0}} />
                <select value={activeAgentId} onChange={e => setActiveAgentId(e.target.value)}
                  style={{background:'transparent', border:'none', color:T.text, outline:'none', ...mono, fontSize:'0.62rem', cursor:'pointer'}}>
                  {activeModule.agents.map(a => <option key={a} value={a}>{a} — {AGENTS[a].name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Module content */}
          <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden'}}>
            {activeModuleId==='code_studio'   && renderCodeStudio()}
            {activeModuleId==='research_lab'  && renderResearchLab()}
            {activeModuleId==='design_studio' && renderDesignStudio()}
            {activeModuleId==='integration'   && renderIntegrationHub()}
            {activeModuleId==='services'      && renderServices()}
            {activeModuleId==='security'      && renderSecurity()}
            {activeModuleId==='legal_desk'    && renderLegalDesk()}
            {activeModuleId==='training'      && renderTrainingStudio()}
          </div>

          {/* Status bar */}
          <div style={{flexShrink:0, height:24, borderTop:`1px solid ${T.border}`, background:T.black, display:'flex', alignItems:'center', padding:'0 12px', gap:14}}>
            <span style={{color:isHealthy?T.green:T.red, fontSize:'0.6rem'}}>●</span>
            <span style={{...mono, color:T.textMuted, fontSize:'0.55rem'}}>{isHealthy?'ONLINE':'OFFLINE'}</span>
            <span style={{...mono, color:T.textDim, fontSize:'0.55rem'}}>|</span>
            <span style={{...mono, color:T.gold, fontSize:'0.55rem'}}>MODEL: {selectedModel||'—'}</span>
            <span style={{...mono, color:T.textDim, fontSize:'0.55rem'}}>|</span>
            <span style={{...mono, color:activeAgent.accent, fontSize:'0.55rem'}}>AGENT: {activeAgent.id}</span>
            <span style={{...mono, color:T.textDim, fontSize:'0.55rem'}}>|</span>
            <span style={{...mono, color:T.textMuted, fontSize:'0.55rem'}}>DAEMON: {daemonStatus.toUpperCase()}</span>
            <span style={{...mono, color:T.textDim, fontSize:'0.55rem'}}>|</span>
            <span style={{...mono, fontSize:'0.55rem',
              color: tunnelStatus==='connected' ? T.green : tunnelStatus==='connecting'||tunnelStatus==='reconnecting' ? T.gold : T.textDim}}>
              ARCHON: {tunnelStatus.toUpperCase()}
            </span>
            {activeModuleId==='code_studio' && (
              <><span style={{...mono, color:T.textDim, fontSize:'0.55rem'}}>|</span>
              <span style={{...mono, color:T.teal, fontSize:'0.55rem'}}>IDE: ACTIVE</span></>
            )}
          </div>

        </div>{/* end content column */}
      </div>{/* end main split */}
    </div>
  );
}