import React, { useState, useEffect, useRef } from 'react';

// ============================================================================
// DESIGN TOKENS & CONSTANTS
// ============================================================================
const T = {
  gold: '#c9a84c', goldDim: '#6b5820', goldBorder: '#3a3020',
  black: '#080808', surface: '#0f0f0f', surface2: '#161616', surface3: '#202020',
  border: '#282420', text: '#f0ead8', textMuted: '#7a7060', textDim: '#3a3530',
  green: '#4a9a6a', red: '#c05040', teal: '#5ab0c8', blue: '#4a8aba',
  purple: '#9a7ab0', orange: '#d4805a', sage: '#8aaa60',
};

const mono = { fontFamily: '"Menlo","Monaco","Consolas","Courier New",monospace' };

const AGENTS: Record<string, { id: string, name: string, accent: string, role: string }> = {
  ARCHON:   { id: 'ARCHON',   name: 'The Archon',          accent: T.gold,   role: 'Digital CEO' },
  MODEBOLA: { id: 'MODEBOLA', name: 'Modebola Awolowo',    accent: T.purple, role: 'Chief of Staff' },
  AYO:      { id: 'AYO',      name: 'Ayo Hastruup',        accent: T.gold,   role: 'CTO' },
  KOFI:     { id: 'KOFI',     name: 'Kofi Perempe',        accent: T.blue,   role: 'Chief Economist' },
  MEI:      { id: 'MEI',      name: 'Mei Zhu-Adeyemi',     accent: T.teal,   role: 'Chief BI Officer' },
  ARIA:     { id: 'ARIA',     name: 'Aria Okonkwo-Santos', accent: T.purple, role: 'Chief Creative Officer' },
  KENDRA:   { id: 'KENDRA',   name: 'Kendra Mwangi-Carter',accent: T.orange, role: 'Chief Growth Officer' },
  TUNDE:    { id: 'TUNDE',    name: 'Tunde Balogun',       accent: T.sage,   role: 'Chief Legal Counsel' },
};

const INFRA_CATALOG: Record<string, { color: string, items: string[] }> = {
  'Internal Products': { color: T.goldDim, items: ['Archon Nexus', 'xDragon Studio', 'GeniePay', 'GenieChain', 'GenieID', 'Vault', 'SabiWorkAI', 'ErrandX', 'MemSight', 'xOrbit', 'DeerFlow', 'Spark Messenger'] },
  'Cloud & Data Centers': { color: T.blue, items: ['Railway (API)', 'Railway (Worker)', 'Supabase', 'Vercel', 'Sovereign Private Cloud', 'Lagos DC-1 (Main)', 'London Node (Backup)', 'AWS us-east-1', 'GCP eu-west'] },
  'AI & Compute': { color: T.purple, items: ['Ollama (Local)', 'MemSight API', 'xOrbit Engine', 'DeerFlow', 'OpenRouter Gateway', 'Cerebras', 'HuggingFace Hub', 'Vertex AI', 'Local GPU Cluster (H100)'] },
  'Payments': { color: T.green, items: ['Flutterwave', 'Paystack', 'Stripe', 'GeniePay Gateway', 'CBN API (NIBSS)'] },
  'Gov & Public Infra': { color: T.sage, items: ['NIN Registry (NIMC)', 'BVN Gateway (NIBSS)', 'FIRS Tax API', 'FRSC License DB', 'Customs ASYCUDA', 'SWIFT Network Node'] },
  'Institutions': { color: T.orange, items: ['Central Bank (CBN) Core', 'SEC Registry API', 'Stock Exchange (NGX)', 'CBN API (NIBSS)', 'SWIFT Network Node'] },
  'Communication': { color: T.teal, items: ['Discord War Room', 'Google Drive', 'Spark Messenger', 'Twilio SMS'] },
};

// ============================================================================
// TYPES & INTERFACES
// ============================================================================
export interface AgentResult { agentId: string; output: string; duration: number; }
export interface IntegrationCanvasProps { onPipelineComplete?: (results: AgentResult[]) => void; }

type NodeType = 'input' | 'agent' | 'output' | 'infra';
type NodeStatus = 'idle' | 'running' | 'done' | 'error';

interface PipelineNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  status: NodeStatus;
  data: {
    agentId?: string;       
    prompt?: string;        
    category?: string;      
    subCategory?: string;
    output?: string;        
  };
}

interface Connection {
  id: string;
  fromId: string;
  toId: string;
  color: string;
}

interface Viewport { x: number; y: number; zoom: number; }

// ============================================================================
// SVG ROUTING MATH
// ============================================================================
const NODE_WIDTH = 240;
const NODE_HEIGHT = 100;
const PORT_OFFSET_Y = 50;

function generateBezierPath(startX: number, startY: number, endX: number, endY: number) {
  const dx = Math.max(Math.abs(endX - startX) * 0.6, 60);
  return `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function IntegrationCanvas() {
  // State initialization with safe defaults
  const [nodes, setNodes] = useState<PipelineNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  const [drawingConnectionFrom, setDrawingConnectionFrom] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<{timestamp: number, source: string, msg: string, status?: string}[]>([]);
  const [activeProject, setActiveProject] = useState<string>('overall');

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- PERSISTENCE ---
  useEffect(() => {
    const saved = localStorage.getItem('archon_integration_map');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setNodes(parsed?.n || []); 
        setConnections(parsed?.c || []); 
        setViewport(parsed?.v || { x: 0, y: 0, zoom: 1 });
      } catch (e) { console.error("Canvas load error", e); }
    } else {
      loadPreset('overall');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('archon_integration_map', JSON.stringify({ n: nodes, c: connections, v: viewport }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [nodes, connections, viewport]);

  // --- NATIVE ZOOM & DELETE ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      
      setViewport(prev => {
        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.2, Math.min(prev.zoom * zoomDelta, 3));
        const dx = (mx - prev.x) * (newZoom / prev.zoom - 1);
        const dy = (my - prev.y) * (newZoom / prev.zoom - 1);
        return { x: prev.x - dx, y: prev.y - dy, zoom: newZoom };
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          setNodes(ns => (ns || []).filter(n => n.id !== selectedNodeId));
          setConnections(cs => (cs || []).filter(c => c.fromId !== selectedNodeId && c.toId !== selectedNodeId));
          setSelectedNodeId(null);
        }
        if (selectedConnId) {
          setConnections(cs => (cs || []).filter(c => c.id !== selectedConnId));
          setSelectedConnId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedConnId]);

  // --- POINTER HANDLERS ---
  const getSvgPoint = (clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'pattern') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - viewport.x, y: e.clientY - viewport.y });
      setSelectedNodeId(null);
      setSelectedConnId(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      setViewport(v => ({ ...v, x: e.clientX - panStart.x, y: e.clientY - panStart.y }));
    } else if (draggingNodeId) {
      const pt = getSvgPoint(e.clientX, e.clientY);
      setNodes(ns => (ns || []).map(n => n.id === draggingNodeId ? { ...n, x: pt.x - dragOffset.x, y: pt.y - dragOffset.y } : n));
    } else if (drawingConnectionFrom) {
      setMousePos(getSvgPoint(e.clientX, e.clientY));
    }
  };

  const handlePointerUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
    setDrawingConnectionFrom(null);
  };

  const handleNodePointerDown = (e: React.PointerEvent, node: PipelineNode) => {
    e.stopPropagation();
    setSelectedNodeId(node.id);
    setSelectedConnId(null);
    const pt = getSvgPoint(e.clientX, e.clientY);
    setDragOffset({ x: pt.x - node.x, y: pt.y - node.y });
    setDraggingNodeId(node.id);
  };

  const handlePortDown = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    setDrawingConnectionFrom(nodeId);
    setMousePos(getSvgPoint(e.clientX, e.clientY));
  };

  const handlePortUp = (e: React.PointerEvent, targetNodeId: string) => {
    e.stopPropagation();
    if (drawingConnectionFrom && drawingConnectionFrom !== targetNodeId) {
      if (!(connections || []).some(c => c.fromId === drawingConnectionFrom && c.toId === targetNodeId)) {
        const sourceNode = (nodes || []).find(n => n.id === drawingConnectionFrom);
        let color = T.border;
        if (sourceNode?.type === 'agent' && sourceNode.data.agentId) color = AGENTS[sourceNode.data.agentId].accent;
        if (sourceNode?.type === 'infra' && sourceNode.data.category) color = INFRA_CATALOG[sourceNode.data.category].color;
        
        setConnections(cs => [...(cs || []), { id: `conn-${Date.now()}`, fromId: drawingConnectionFrom, toId: targetNodeId, color }]);
      }
    }
    setDrawingConnectionFrom(null);
  };

  // --- ACTIONS ---
  const addNode = (type: NodeType, label: string, data: any = {}) => {
    const x = (-viewport.x + 300) / viewport.zoom;
    const y = (-viewport.y + 200) / viewport.zoom;
    setNodes(ns => [...(ns || []), { id: `node-${Date.now()}`, type, label, x, y, status: 'idle', data }]);
  };

  const loadPreset = (projectId: string) => {
    setNodes([]); setConnections([]); setViewport({ x: 0, y: 0, zoom: 0.8 });
    setTimeout(() => {
      if (projectId === 'overall') {
        setNodes([
          { id: 'n1', type: 'infra', label: 'Lagos DC-1 (Main)',    x: 100, y: 100, status: 'idle', data: { category: 'Cloud & Data Centers' } },
          { id: 'n2', type: 'infra', label: 'Archon Nexus',         x: 450, y: 100, status: 'idle', data: { category: 'Internal Products' } },
          { id: 'n3', type: 'infra', label: 'NIN Registry (NIMC)',  x: 800, y: 100, status: 'idle', data: { category: 'Gov & Public Infra' } },
          { id: 'n4', type: 'agent', label: 'The Archon',           x: 450, y: 300, status: 'idle', data: { agentId: 'ARCHON' } },
          { id: 'n5', type: 'infra', label: 'Ollama (Local)',        x: 100, y: 300, status: 'idle', data: { category: 'AI & Compute' } },
          { id: 'n6', type: 'infra', label: 'Central Bank (CBN)',   x: 800, y: 300, status: 'idle', data: { category: 'Institutions' } },
          { id: 'n7', type: 'infra', label: 'MemSight API',         x: 100, y: 480, status: 'idle', data: { category: 'AI & Compute' } },
          { id: 'n8', type: 'infra', label: 'GeniePay',             x: 450, y: 480, status: 'idle', data: { category: 'Internal Products' } },
        ]);
        setConnections([
          { id: 'c1', fromId: 'n1', toId: 'n2', color: T.blue },
          { id: 'c2', fromId: 'n2', toId: 'n3', color: T.goldDim },
          { id: 'c3', fromId: 'n5', toId: 'n4', color: T.purple },
          { id: 'c4', fromId: 'n4', toId: 'n2', color: T.gold },
          { id: 'c5', fromId: 'n2', toId: 'n6', color: T.goldDim },
          { id: 'c6', fromId: 'n7', toId: 'n4', color: T.teal },
          { id: 'c7', fromId: 'n2', toId: 'n8', color: T.goldDim },
        ]);
      } else if (projectId === 'archon') {
        setNodes([
          { id: 'n1', type: 'infra', label: 'Railway (API)',        x: 100, y: 80,  status: 'idle', data: { category: 'Cloud & Data Centers' } },
          { id: 'n2', type: 'infra', label: 'Archon Nexus',         x: 420, y: 80,  status: 'idle', data: { category: 'Internal Products' } },
          { id: 'n3', type: 'infra', label: 'Supabase',             x: 740, y: 80,  status: 'idle', data: { category: 'Cloud & Data Centers' } },
          { id: 'n4', type: 'infra', label: 'Discord War Room',     x: 100, y: 280, status: 'idle', data: { category: 'Communication' } },
          { id: 'n5', type: 'agent', label: 'The Archon',           x: 420, y: 280, status: 'idle', data: { agentId: 'ARCHON' } },
          { id: 'n6', type: 'infra', label: 'OpenRouter Gateway',   x: 740, y: 280, status: 'idle', data: { category: 'AI & Compute' } },
          { id: 'n7', type: 'infra', label: 'Google Drive',         x: 100, y: 460, status: 'idle', data: { category: 'Communication' } },
          { id: 'n8', type: 'infra', label: 'MemSight API',         x: 420, y: 460, status: 'idle', data: { category: 'AI & Compute' } },
          { id: 'n9', type: 'infra', label: 'Cerebras',             x: 740, y: 460, status: 'idle', data: { category: 'AI & Compute' } },
        ]);
        setConnections([
          { id: 'c1', fromId: 'n1', toId: 'n2', color: T.blue },
          { id: 'c2', fromId: 'n2', toId: 'n3', color: T.goldDim },
          { id: 'c3', fromId: 'n4', toId: 'n5', color: T.purple },
          { id: 'c4', fromId: 'n5', toId: 'n2', color: T.gold },
          { id: 'c5', fromId: 'n2', toId: 'n6', color: T.goldDim },
          { id: 'c6', fromId: 'n5', toId: 'n8', color: T.teal },
          { id: 'c7', fromId: 'n7', toId: 'n2', color: T.teal },
          { id: 'c8', fromId: 'n9', toId: 'n5', color: T.purple },
        ]);
      } else if (projectId === 'xdragon') {
        setNodes([
          { id: 'n1', type: 'infra', label: 'Ollama (Local)',       x: 100, y: 80,  status: 'idle', data: { category: 'AI & Compute' } },
          { id: 'n2', type: 'infra', label: 'xDragon Studio',       x: 420, y: 80,  status: 'idle', data: { category: 'Internal Products' } },
          { id: 'n3', type: 'infra', label: 'Archon Nexus',         x: 740, y: 80,  status: 'idle', data: { category: 'Internal Products' } },
          { id: 'n4', type: 'infra', label: 'MemSight API',         x: 100, y: 280, status: 'idle', data: { category: 'AI & Compute' } },
          { id: 'n5', type: 'agent', label: 'Ayo Hastruup',         x: 420, y: 280, status: 'idle', data: { agentId: 'AYO' } },
          { id: 'n6', type: 'infra', label: 'xOrbit Engine',        x: 740, y: 280, status: 'idle', data: { category: 'AI & Compute' } },
          { id: 'n7', type: 'infra', label: 'DeerFlow',             x: 100, y: 460, status: 'idle', data: { category: 'AI & Compute' } },
          { id: 'n8', type: 'infra', label: 'Supabase',             x: 420, y: 460, status: 'idle', data: { category: 'Cloud & Data Centers' } },
        ]);
        setConnections([
          { id: 'c1', fromId: 'n1', toId: 'n2', color: T.purple },
          { id: 'c2', fromId: 'n2', toId: 'n3', color: T.orange },
          { id: 'c3', fromId: 'n4', toId: 'n5', color: T.teal },
          { id: 'c4', fromId: 'n5', toId: 'n2', color: T.gold },
          { id: 'c5', fromId: 'n2', toId: 'n6', color: T.purple },
          { id: 'c6', fromId: 'n7', toId: 'n2', color: T.blue },
          { id: 'c7', fromId: 'n2', toId: 'n8', color: T.blue },
        ]);
      } else if (projectId === 'sabiwork') {
        setNodes([
          { id: 'n1', type: 'infra', label: 'SabiWorkAI',          x: 100, y: 80,  status: 'idle', data: { category: 'Internal Products' } },
          { id: 'n2', type: 'infra', label: 'Railway (API)',        x: 420, y: 80,  status: 'idle', data: { category: 'Cloud & Data Centers' } },
          { id: 'n3', type: 'infra', label: 'Supabase',            x: 740, y: 80,  status: 'idle', data: { category: 'Cloud & Data Centers' } },
          { id: 'n4', type: 'agent', label: 'Modebola Awolowo',    x: 100, y: 280, status: 'idle', data: { agentId: 'MODEBOLA' } },
          { id: 'n5', type: 'infra', label: 'Archon Nexus',        x: 420, y: 280, status: 'idle', data: { category: 'Internal Products' } },
          { id: 'n6', type: 'infra', label: 'MemSight API',        x: 740, y: 280, status: 'idle', data: { category: 'AI & Compute' } },
          { id: 'n7', type: 'infra', label: 'Spark Messenger',     x: 260, y: 460, status: 'idle', data: { category: 'Communication' } },
        ]);
        setConnections([
          { id: 'c1', fromId: 'n1', toId: 'n2', color: T.gold },
          { id: 'c2', fromId: 'n2', toId: 'n3', color: T.blue },
          { id: 'c3', fromId: 'n4', toId: 'n5', color: T.purple },
          { id: 'c4', fromId: 'n5', toId: 'n1', color: T.gold },
          { id: 'c5', fromId: 'n1', toId: 'n6', color: T.teal },
          { id: 'c6', fromId: 'n1', toId: 'n7', color: T.teal },
        ]);
      } else if (projectId === 'errandx') {
        setNodes([
          { id: 'n1', type: 'infra', label: 'ErrandX',             x: 100, y: 80,  status: 'idle', data: { category: 'Internal Products' } },
          { id: 'n2', type: 'infra', label: 'Railway (API)',        x: 420, y: 80,  status: 'idle', data: { category: 'Cloud & Data Centers' } },
          { id: 'n3', type: 'infra', label: 'Supabase',            x: 740, y: 80,  status: 'idle', data: { category: 'Cloud & Data Centers' } },
          { id: 'n4', type: 'infra', label: 'Paystack',            x: 100, y: 280, status: 'idle', data: { category: 'Payments' } },
          { id: 'n5', type: 'agent', label: 'Kendra Mwangi-Carter', x: 420, y: 280, status: 'idle', data: { agentId: 'KENDRA' } },
          { id: 'n6', type: 'infra', label: 'GeniePay Gateway',    x: 740, y: 280, status: 'idle', data: { category: 'Payments' } },
          { id: 'n7', type: 'infra', label: 'Archon Nexus',        x: 260, y: 460, status: 'idle', data: { category: 'Internal Products' } },
        ]);
        setConnections([
          { id: 'c1', fromId: 'n1', toId: 'n2', color: T.orange },
          { id: 'c2', fromId: 'n2', toId: 'n3', color: T.blue },
          { id: 'c3', fromId: 'n4', toId: 'n1', color: T.green },
          { id: 'c4', fromId: 'n5', toId: 'n1', color: T.orange },
          { id: 'c5', fromId: 'n1', toId: 'n6', color: T.green },
          { id: 'c6', fromId: 'n7', toId: 'n1', color: T.goldDim },
        ]);
      } else if (projectId === 'geniepay') {
        setNodes([
          { id: 'n1', type: 'infra', label: 'GeniePay',            x: 100, y: 80,  status: 'idle', data: { category: 'Internal Products' } },
          { id: 'n2', type: 'infra', label: 'Flutterwave',         x: 420, y: 80,  status: 'idle', data: { category: 'Payments' } },
          { id: 'n3', type: 'infra', label: 'Paystack',            x: 740, y: 80,  status: 'idle', data: { category: 'Payments' } },
          { id: 'n4', type: 'infra', label: 'CBN API (NIBSS)',     x: 100, y: 280, status: 'idle', data: { category: 'Institutions' } },
          { id: 'n5', type: 'agent', label: 'Kofi Perempe',        x: 420, y: 280, status: 'idle', data: { agentId: 'KOFI' } },
          { id: 'n6', type: 'infra', label: 'Stripe',              x: 740, y: 280, status: 'idle', data: { category: 'Payments' } },
          { id: 'n7', type: 'infra', label: 'GenieChain',          x: 100, y: 460, status: 'idle', data: { category: 'Internal Products' } },
          { id: 'n8', type: 'infra', label: 'GenieID',             x: 420, y: 460, status: 'idle', data: { category: 'Internal Products' } },
          { id: 'n9', type: 'infra', label: 'SWIFT Network Node',  x: 740, y: 460, status: 'idle', data: { category: 'Gov & Public Infra' } },
        ]);
        setConnections([
          { id: 'c1', fromId: 'n1', toId: 'n2', color: T.green },
          { id: 'c2', fromId: 'n1', toId: 'n3', color: T.green },
          { id: 'c3', fromId: 'n4', toId: 'n5', color: T.sage },
          { id: 'c4', fromId: 'n5', toId: 'n1', color: T.blue },
          { id: 'c5', fromId: 'n1', toId: 'n6', color: T.green },
          { id: 'c6', fromId: 'n1', toId: 'n7', color: T.teal },
          { id: 'c7', fromId: 'n1', toId: 'n8', color: T.purple },
          { id: 'c8', fromId: 'n1', toId: 'n9', color: T.sage },
        ]);
      }
    }, 50);
  };

  const addLog = (source: string, msg: string, status = 'info') => {
    setLogs(prev => [{ timestamp: Date.now(), source, msg, status }, ...(prev || [])].slice(0, 100));
  };

  // --- EXECUTION ENGINE (Ping / Test Flow) ---
  const executePipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setLogs([]);
    addLog('SYSTEM', 'Initiating infrastructure integration check...', 'info');
    
    setNodes(ns => (ns || []).map(n => ({ ...n, status: 'idle', data: { ...n.data, output: '' } })));

    let currentNodes = (nodes || []).filter(n => !(connections || []).some(c => c.toId === n.id));
    if (!currentNodes.length) currentNodes = [(nodes || [])[0]].filter(Boolean);

    const visited = new Set<string>();
    
    while (currentNodes.length > 0) {
      const nextNodes: PipelineNode[] = [];

      for (const node of currentNodes) {
        if (visited.has(node.id)) continue;
        visited.add(node.id);

        setNodes(ns => (ns || []).map(n => n.id === node.id ? { ...n, status: 'running' } : n));
        addLog(node.label, `Pinging node...`, 'info');

        // Simulate network latency & health checks
        await new Promise(res => setTimeout(res, 600 + Math.random() * 800));
        
        const isError = Math.random() > 0.9; // 10% chance of failure for realism
        const endStatus = isError ? 'error' : 'done';
        
        if (isError) {
          addLog(node.label, `Connection timeout or API rejected.`, 'error');
        } else {
          addLog(node.label, `Handshake successful. Latency: ${Math.floor(Math.random()*40)}ms`, 'success');
        }

        setNodes(ns => (ns || []).map(n => n.id === node.id ? { ...n, status: endStatus } : n));

        if (!isError) {
          const outgoingConns = (connections || []).filter(c => c.fromId === node.id);
          const nextIds = outgoingConns.map(c => c.toId);
          const targets = (nodes || []).filter(n => nextIds.includes(n.id) && !visited.has(n.id));
          nextNodes.push(...targets);
        }
      }
      currentNodes = nextNodes;
    }

    addLog('SYSTEM', 'Diagnostic complete.', 'info');
    setIsRunning(false);
  };

  // --- RENDER HELPERS ---
  const getNodeColor = (n: PipelineNode) => {
    if (n.status === 'error') return T.red;
    if (n.type === 'input') return T.gold;
    if (n.type === 'output') return T.teal;
    if (n.type === 'agent' && n.data.agentId) return AGENTS[n.data.agentId].accent;
    if (n.type === 'infra' && n.data.category) return INFRA_CATALOG[n.data.category].color;
    return T.border;
  };

  const btnStyle = (primary = false) => ({
    background: primary ? T.goldDim : 'transparent', color: primary ? T.text : T.textMuted,
    border: `1px solid ${primary ? T.gold : T.border}`, padding: '4px 8px', cursor: 'pointer', ...mono, fontSize: '0.64rem'
  });

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', background: T.surface, position: 'relative' }}>
      
      {/* TOOLBAR */}
      <div style={{ flexShrink: 0, padding: '8px 16px', borderBottom: `1px solid ${T.border}`, background: T.surface2, display: 'flex', gap: 16, alignItems: 'center', zIndex: 10, flexWrap: 'wrap' }}>
        <select
          value={activeProject}
          onChange={e => { const p = e.target.value; setActiveProject(p); loadPreset(p); }}
          style={{ ...mono, color: T.gold, fontSize: '0.72rem', fontWeight: 'bold', background: T.surface3, border: `1px solid ${T.goldBorder}`, padding: '4px 10px', cursor: 'pointer', outline: 'none', borderRadius: 3 }}
        >
          <option value="overall">◈ Overall</option>
          <option value="archon">◈ Archon Nexus</option>
          <option value="xdragon">◈ xDragon Studio</option>
          <option value="sabiwork">◈ SabiWorkAI</option>
          <option value="errandx">◈ ErrandX</option>
          <option value="geniepay">◈ GeniePay</option>
        </select>
        <div style={{ width: 1, height: 20, background: T.border }} />
        
        {/* ADD MENUS */}
        <select onChange={e => { if(e.target.value) addNode('agent', AGENTS[e.target.value].name, { agentId: e.target.value }); e.target.value=''; }} style={{ ...btnStyle(), appearance: 'none' }}>
          <option value="">+ Agent Node...</option>
          {Object.keys(AGENTS).map(a => <option key={a} value={a}>{AGENTS[a].name}</option>)}
        </select>
        
        <select onChange={e => { 
          if(e.target.value) {
            const [cat, item] = e.target.value.split('|');
            addNode('infra', item, { category: cat });
          }
          e.target.value=''; 
        }} style={{ ...btnStyle(), appearance: 'none', maxWidth: 200 }}>
          <option value="">+ Infrastructure / DB...</option>
          {Object.entries(INFRA_CATALOG).map(([cat, data]) => (
            <optgroup key={cat} label={cat} style={{ color: data.color, background: T.surface2 }}>
              {data.items.map(item => <option key={item} value={`${cat}|${item}`} style={{ color: T.text }}>{item}</option>)}
            </optgroup>
          ))}
        </select>
        
        <button onClick={() => addNode('input', 'Webhook Trigger')} style={btnStyle()}>+ Trigger</button>

        <div style={{ width: 1, height: 20, background: T.border }} />

        {/* OPS BUTTONS */}
        <button disabled={!selectedNodeId} style={{ ...btnStyle(), opacity: selectedNodeId ? 1 : 0.5 }}>Configure</button>
        <button disabled={!selectedNodeId && !selectedConnId} onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Delete'}))} style={{ ...btnStyle(), opacity: (selectedNodeId || selectedConnId) ? 1 : 0.5 }}>Disconnect</button>

        <div style={{ width: 1, height: 20, background: T.border }} />
        
        <button onClick={executePipeline} disabled={isRunning} style={{ ...btnStyle(true), marginLeft: 'auto', background: isRunning ? T.surface3 : T.goldDim, color: isRunning ? T.textMuted : T.text }}>
          {isRunning ? '◌ PINGING NETWORK...' : '▶ TEST INTEGRATIONS'}
        </button>
      </div>

      {/* CANVAS AREA */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <svg 
          ref={svgRef}
          width="100%" height="100%" 
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ cursor: isPanning ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke={T.surface3} strokeWidth="1"/>
            </pattern>
            <filter id="glow"><feGaussianBlur stdDeviation="3" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>

          <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
            <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#grid)" />

            {/* Connections */}
            {(connections || []).map(conn => {
              const fromNode = (nodes || []).find(n => n.id === conn.fromId);
              const toNode = (nodes || []).find(n => n.id === conn.toId);
              if (!fromNode || !toNode) return null;
              
              const startX = fromNode.x + NODE_WIDTH;
              const startY = fromNode.y + PORT_OFFSET_Y;
              const endX = toNode.x;
              const endY = toNode.y + PORT_OFFSET_Y;
              const isSelected = selectedConnId === conn.id;

              return (
                <path 
                  key={conn.id}
                  d={generateBezierPath(startX, startY, endX, endY)}
                  fill="none"
                  stroke={isSelected ? T.text : conn.color}
                  strokeWidth={isSelected ? 4 : 2}
                  strokeDasharray={isRunning ? "8 4" : "none"}
                  style={{ transition: 'stroke 0.2s', cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); setSelectedConnId(conn.id); setSelectedNodeId(null); }}
                >
                  {isRunning && <animate attributeName="stroke-dashoffset" from="12" to="0" dur="0.5s" repeatCount="indefinite" />}
                </path>
              );
            })}

            {/* Drawing Line */}
            {drawingConnectionFrom && (nodes || []).find(n => n.id === drawingConnectionFrom) && (
              <path
                d={generateBezierPath((nodes || []).find(n => n.id === drawingConnectionFrom)!.x + NODE_WIDTH, (nodes || []).find(n => n.id === drawingConnectionFrom)!.y + PORT_OFFSET_Y, mousePos.x, mousePos.y)}
                fill="none" stroke={T.textDim} strokeWidth="2" strokeDasharray="4 4"
              />
            )}

            {/* Nodes */}
            {(nodes || []).map(node => {
              const color = getNodeColor(node);
              const isSelected = selectedNodeId === node.id;
              
              return (
                <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                  {isSelected && <rect x="-4" y="-4" width={NODE_WIDTH+8} height={NODE_HEIGHT+8} fill="none" stroke={T.text} strokeWidth="2" rx="6" strokeDasharray="4 4"/>}
                  
                  {node.status === 'running' && <rect width={NODE_WIDTH} height={NODE_HEIGHT} fill="none" stroke={T.text} strokeWidth="4" filter="url(#glow)" rx="4"/>}
                  {node.status === 'done' && <rect width={NODE_WIDTH} height={NODE_HEIGHT} fill="none" stroke={T.green} strokeWidth="3" filter="url(#glow)" rx="4"/>}
                  {node.status === 'error' && <rect width={NODE_WIDTH} height={NODE_HEIGHT} fill="none" stroke={T.red} strokeWidth="3" filter="url(#glow)" rx="4"/>}

                  <foreignObject width={NODE_WIDTH} height={NODE_HEIGHT}>
                    <div 
                      onPointerDown={(e) => handleNodePointerDown(e, node)}
                      style={{ width: '100%', height: '100%', background: T.black, border: `1px solid ${color}`, borderRadius: 4, display: 'flex', flexDirection: 'column', cursor: 'pointer', overflow: 'hidden' }}
                    >
                      <div style={{ background: T.surface2, padding: '4px 8px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <span style={{ ...mono, color, fontSize: '0.56rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                           {node.type === 'infra' ? '◈ INFRASTRUCTURE' : node.type === 'agent' ? '◉ AI AGENT' : node.type.toUpperCase()}
                         </span>
                         <span style={{ ...mono, color: node.status === 'error' ? T.red : T.textDim, fontSize: '0.55rem' }}>
                           {node.status === 'running' ? '● PING' : node.status === 'done' ? '✓ OK' : node.status === 'error' ? '⚠ ERR' : ''}
                         </span>
                      </div>
                      
                      <div style={{ padding: '8px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                         <div style={{ ...mono, color: T.text, fontSize: '0.68rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                           {node.label}
                         </div>
                         {node.type === 'agent' && node.data.agentId && (
                           <div style={{ ...mono, color: T.textMuted, fontSize: '0.55rem', marginTop: 4 }}>
                             {AGENTS[node.data.agentId].role}
                           </div>
                         )}
                         {node.type === 'infra' && node.data.category && (
                           <div style={{ ...mono, color: T.textDim, fontSize: '0.55rem', marginTop: 4 }}>
                             {node.data.category}
                           </div>
                         )}
                         {node.type === 'input' && (
                           <input 
                             type="text" value={node.data.prompt || ''} 
                             onChange={(e) => setNodes(ns => (ns || []).map(n => n.id === node.id ? {...n, data: {...n.data, prompt: e.target.value}} : n))}
                             placeholder="Endpoint URL..." 
                             style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.text, fontSize: '0.55rem', ...mono, marginTop: 'auto', padding: 2 }}
                             onPointerDown={e => e.stopPropagation()} 
                           />
                         )}
                      </div>
                    </div>
                  </foreignObject>

                  {/* Ports */}
                  {(node.type !== 'input') && (
                    <circle cx="0" cy={PORT_OFFSET_Y} r="6" fill={T.black} stroke={color} strokeWidth="2" onPointerUp={(e) => handlePortUp(e, node.id)} style={{ cursor: 'crosshair' }} />
                  )}
                  {(node.type !== 'output') && (
                    <circle cx={NODE_WIDTH} cy={PORT_OFFSET_Y} r="6" fill={T.black} stroke={color} strokeWidth="2" onPointerDown={(e) => handlePortDown(e, node.id)} style={{ cursor: 'crosshair' }} />
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* LOG PANEL */}
        <div style={{ position: 'absolute', bottom: 16, left: 16, width: 450, height: 180, background: 'rgba(8,8,8,0.9)', border: `1px solid ${T.border}`, borderRadius: 4, display: 'flex', flexDirection: 'column', backdropFilter: 'blur(8px)' }}>
          <div style={{ padding: '6px 8px', background: T.surface2, borderBottom: `1px solid ${T.border}`, ...mono, fontSize: '0.6rem', color: T.gold }}>NETWORK DIAGNOSTICS & LOGS</div>
          <div style={{ flex: 1, padding: 8, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {logs.map((log, i) => (
              <div key={i} style={{ ...mono, fontSize: '0.6rem', display: 'flex', gap: 8 }}>
                <span style={{ color: T.textDim, flexShrink: 0 }}>[{new Date(log.timestamp).toISOString().split('T')[1].slice(0,-1)}]</span>
                <span style={{ color: T.blue, flexShrink: 0, width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.source}</span>
                <span style={{ color: log.status === 'error' ? T.red : log.status === 'success' ? T.green : T.textMuted }}>{log.msg}</span>
              </div>
            ))}
            {logs.length === 0 && <div style={{ color: T.textDim, ...mono, fontSize: '0.6rem' }}>Awaiting network execution...</div>}
          </div>
        </div>

        {/* MINI-MAP */}
        <div style={{ position: 'absolute', bottom: 16, right: 16, width: 160, height: 100, background: T.black, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
          <svg width="100%" height="100%" viewBox="-500 -500 2000 2000" preserveAspectRatio="xMidYMid meet">
             {(nodes || []).map(n => <rect key={`mm-${n.id}`} x={n.x} y={n.y} width={NODE_WIDTH} height={NODE_HEIGHT} fill={getNodeColor(n)} />)}
             <rect x={-viewport.x / viewport.zoom} y={-viewport.y / viewport.zoom} width={(svgRef.current?.clientWidth || 800) / viewport.zoom} height={(svgRef.current?.clientHeight || 600) / viewport.zoom} fill="none" stroke={T.text} strokeWidth="15" strokeDasharray="30 30" />
          </svg>
        </div>
      </div>
    </div>
  );
}