/**
 * ═══════════════════════════════════════════════════════════════════
 *  ARCHON NEXUS — Services Module v3
 *
 *  NEW IN v3:
 *  1. Infrastructure Graph View  — SVG node/edge dependency map
 *  2. Credential Vault Encryption — AES-256-GCM via Web Crypto API
 *  3. Auto Service Discovery     — parse .env / Docker Compose / repo
 *  4. Agent Monitoring           — MEI (revenue) + AYO (infra health)
 *  5. Service Risk Score         — ARCHON calculates operational risk
 *  6. Real-time Infra Feed       — streaming health polling dashboard
 *  7. One-click Infra Reports    — ARCHON audit → Archon backend queue
 *
 *  PLACE AT: xdragon/app/ui/app/src/components/ServicesModule.tsx
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { getOllamaUrl } from "@/lib/config";

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────
const T = {
  gold: "#c9a84c", goldDim: "#6b5820", goldBorder: "#3a3020",
  black: "#080808", surface: "#0f0f0f", surface2: "#161616", surface3: "#202020",
  border: "#282420", text: "#f0ead8", textMuted: "#7a7060", textDim: "#3a3530",
  green: "#4a9a6a", red: "#c05040", teal: "#5ab0c8", blue: "#4a8aba",
  purple: "#9a7ab0", orange: "#d4805a", sage: "#8aaa60",
};
const mono: React.CSSProperties = { fontFamily: '"Menlo","Monaco","Consolas","Courier New",monospace' };

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
export type ServiceCategory =
  | "database" | "hosting" | "ai_gateway" | "payment" | "blockchain"
  | "identity" | "communication" | "storage" | "monitoring" | "analytics"
  | "fx_data" | "news_data" | "other";

export interface ServiceCredential { key: string; value: string; masked: boolean; }

export interface Service {
  id: string; name: string; category: ServiceCategory;
  status: "active" | "inactive" | "error" | "unconfigured" | "checking";
  description: string; docsUrl?: string; dashboardUrl?: string;
  credentials: ServiceCredential[];
  lastChecked?: number; latencyMs?: number; notes?: string; tags: string[];
  riskScore?: number;        // 0–100 computed by ARCHON
  dependsOn?: string[];      // service IDs this service depends on
}

export interface Venture {
  id: string; name: string; type: string; accent: string;
  services: Service[];
  riskScore?: number;
}

export interface ServicesDashboardProps { onInject?: (text: string) => void; }

// ─────────────────────────────────────────────────────────────
// AES-256-GCM ENCRYPTION (Web Crypto API)
// Key is derived from a device-stable fingerprint + salt
// ─────────────────────────────────────────────────────────────
const VAULT_SALT = "archon_nexus_sovereign_vault_v3";

async function getVaultKey(): Promise<CryptoKey> {
  const fingerprint = navigator.userAgent + screen.width + screen.colorDepth;
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(fingerprint), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(VAULT_SALT), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false, ["encrypt", "decrypt"]
  );
}

async function encryptCredential(plaintext: string): Promise<string> {
  if (!plaintext) return "";
  try {
    const key  = await getVaultKey();
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const enc  = new TextEncoder();
    const ct   = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
    const buf  = new Uint8Array(iv.length + ct.byteLength);
    buf.set(iv, 0);
    buf.set(new Uint8Array(ct), iv.length);
    return btoa(String.fromCharCode(...buf));
  } catch { return btoa(encodeURIComponent(plaintext)); } // graceful fallback
}

async function decryptCredential(ciphertext: string): Promise<string> {
  if (!ciphertext) return "";
  try {
    const key  = await getVaultKey();
    const buf  = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    const iv   = buf.slice(0, 12);
    const ct   = buf.slice(12);
    const pt   = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    try { return decodeURIComponent(atob(ciphertext)); } // handle old Base64 data
    catch { return ciphertext; }
  }
}

// ─────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────
const VENTURES_KEY = "archon_ventures_v3";
const REPORTS_QUEUE_KEY = "archon_reports_queue";

async function saveVentures(v: Venture[]): Promise<void> {
  const cloned: Venture[] = JSON.parse(JSON.stringify(v));
  for (const venture of cloned) {
    for (const service of venture.services) {
      for (const cred of service.credentials) {
        if (cred.value) cred.value = await encryptCredential(cred.value);
      }
    }
  }
  localStorage.setItem(VENTURES_KEY, JSON.stringify(cloned));
}

async function loadVentures(): Promise<Venture[]> {
  const raw = localStorage.getItem(VENTURES_KEY);
  if (!raw) { const s = seedVentures(); await saveVentures(s); return s; }
  const parsed: Venture[] = JSON.parse(raw);
  for (const venture of parsed) {
    for (const service of venture.services) {
      for (const cred of service.credentials) {
        if (cred.masked === undefined) cred.masked = true;
        if (cred.value) cred.value = await decryptCredential(cred.value);
      }
    }
  }
  return parsed;
}

// ─────────────────────────────────────────────────────────────
// RISK SCORE CALCULATION (ARCHON algorithm)
// ─────────────────────────────────────────────────────────────
function calculateServiceRisk(s: Service): number {
  let score = 0;
  if (s.status === "error")         score += 40;
  if (s.status === "unconfigured")  score += 25;
  if (s.status === "inactive")      score += 15;
  if (!s.credentials.some(c => c.value)) score += 20;
  if (s.latencyMs && s.latencyMs > 500)  score += 10;
  if (s.latencyMs && s.latencyMs > 1000) score += 10;
  if (!s.lastChecked)               score += 5;
  const age = s.lastChecked ? Date.now() - s.lastChecked : Infinity;
  if (age > 3600000) score += 5;
  return Math.min(score, 100);
}

function calculateVentureRisk(v: Venture): number {
  if (v.services.length === 0) return 0;
  const avg = v.services.reduce((a, s) => a + calculateServiceRisk(s), 0) / v.services.length;
  const errorBonus = v.services.filter(s => s.status === "error").length * 5;
  return Math.min(Math.round(avg + errorBonus), 100);
}

function riskColor(score: number): string {
  if (score >= 60) return T.red;
  if (score >= 30) return T.orange;
  if (score >= 10) return T.gold;
  return T.green;
}

// ─────────────────────────────────────────────────────────────
// AUTO SERVICE DISCOVERY
// ─────────────────────────────────────────────────────────────
interface DiscoveredService { name: string; category: ServiceCategory; keys: string[]; hint: string; }

const KNOWN_SERVICE_PATTERNS: { pattern: RegExp; name: string; category: ServiceCategory; hint: string }[] = [
  { pattern: /SUPABASE/i,       name: "Supabase",         category: "database",      hint: "PostgreSQL + pgvector" },
  { pattern: /POSTGRES|PG_/i,   name: "PostgreSQL",       category: "database",      hint: "Relational database" },
  { pattern: /REDIS/i,          name: "Redis",            category: "database",      hint: "Cache / queue" },
  { pattern: /MONGO/i,          name: "MongoDB",          category: "database",      hint: "Document database" },
  { pattern: /STRIPE/i,         name: "Stripe",           category: "payment",       hint: "Global card processing" },
  { pattern: /FLUTTERWAVE/i,    name: "Flutterwave",      category: "payment",       hint: "African payment gateway" },
  { pattern: /PAYSTACK/i,       name: "Paystack",         category: "payment",       hint: "African payments" },
  { pattern: /OPENAI/i,         name: "OpenAI",           category: "ai_gateway",    hint: "GPT model API" },
  { pattern: /OPENROUTER/i,     name: "OpenRouter",       category: "ai_gateway",    hint: "Multi-model gateway" },
  { pattern: /ANTHROPIC/i,      name: "Anthropic",        category: "ai_gateway",    hint: "Claude API" },
  { pattern: /AWS_/i,           name: "AWS",              category: "hosting",       hint: "Cloud infrastructure" },
  { pattern: /GCP_|GOOGLE_CLOUD/i, name: "GCP",          category: "hosting",       hint: "Google Cloud" },
  { pattern: /RENDER/i,         name: "Render",           category: "hosting",       hint: "Backend hosting" },
  { pattern: /VERCEL/i,         name: "Vercel",           category: "hosting",       hint: "Frontend hosting" },
  { pattern: /TWILIO/i,         name: "Twilio",           category: "communication", hint: "SMS / 2FA" },
  { pattern: /SENDGRID/i,       name: "SendGrid",         category: "communication", hint: "Email delivery" },
  { pattern: /AUTH0/i,          name: "Auth0",            category: "identity",      hint: "Authentication" },
  { pattern: /FIREBASE/i,       name: "Firebase",         category: "identity",      hint: "Auth + database" },
  { pattern: /ALCHEMY/i,        name: "Alchemy",          category: "blockchain",    hint: "RPC node provider" },
  { pattern: /INFURA/i,         name: "Infura",           category: "blockchain",    hint: "Ethereum RPC" },
  { pattern: /PINATA|IPFS/i,    name: "IPFS/Pinata",      category: "storage",       hint: "Decentralised storage" },
  { pattern: /S3_|AWS_S3/i,     name: "AWS S3",           category: "storage",       hint: "Object storage" },
  { pattern: /CLOUDINARY/i,     name: "Cloudinary",       category: "storage",       hint: "Media storage" },
  { pattern: /DISCORD/i,        name: "Discord",          category: "communication", hint: "Bot notifications" },
  { pattern: /GITHUB/i,         name: "GitHub",           category: "other",         hint: "Source control" },
  { pattern: /NEWSAPI/i,        name: "NewsAPI",          category: "news_data",     hint: "News feed" },
  { pattern: /ALPHAVANTAGE/i,   name: "AlphaVantage",     category: "fx_data",       hint: "Market data" },
  { pattern: /BYTEROVER/i,      name: "Byterover",        category: "other",         hint: "Knowledge store" },
];

function discoverFromEnv(envText: string): DiscoveredService[] {
  const lines = envText.split('\n').filter(l => l.includes('=') && !l.startsWith('#'));
  const keyMap: Record<string, string[]> = {};
  for (const line of lines) {
    const key = line.split('=')[0].trim().toUpperCase();
    if (!key) continue;
    for (const pat of KNOWN_SERVICE_PATTERNS) {
      if (pat.pattern.test(key)) {
        const svc = pat.name;
        if (!keyMap[svc]) keyMap[svc] = [];
        keyMap[svc].push(key);
      }
    }
  }
  return Object.entries(keyMap).map(([name, keys]) => {
    const meta = KNOWN_SERVICE_PATTERNS.find(p => p.name === name)!;
    return { name, category: meta.category, keys, hint: meta.hint };
  });
}

function discoverFromDockerCompose(yaml: string): DiscoveredService[] {
  const discovered: DiscoveredService[] = [];
  const serviceBlocks = yaml.match(/^\s{2}(\w[\w-]+):/gm) || [];
  const serviceNames = serviceBlocks.map(s => s.trim().replace(':', '').toLowerCase());
  const dockerServiceMap: Record<string, { category: ServiceCategory; hint: string }> = {
    postgres: { category: "database", hint: "PostgreSQL container" },
    redis:    { category: "database", hint: "Redis container" },
    mongo:    { category: "database", hint: "MongoDB container" },
    mysql:    { category: "database", hint: "MySQL container" },
    nginx:    { category: "hosting",  hint: "Nginx reverse proxy" },
    minio:    { category: "storage",  hint: "MinIO object storage" },
    rabbitmq: { category: "communication", hint: "Message broker" },
    kafka:    { category: "communication", hint: "Event streaming" },
    grafana:  { category: "monitoring", hint: "Metrics dashboard" },
    prometheus: { category: "monitoring", hint: "Metrics scraper" },
  };
  for (const name of serviceNames) {
    if (dockerServiceMap[name]) {
      discovered.push({ name, category: dockerServiceMap[name].category, keys: [], hint: dockerServiceMap[name].hint });
    }
  }
  return discovered;
}

// ─────────────────────────────────────────────────────────────
// SEED DATA
// ─────────────────────────────────────────────────────────────
function seedVentures(): Venture[] {
  return [
    {
      id: "archon", name: "Archon Nexus", type: "AI Orchestration Platform", accent: T.gold,
      services: [
        { id: "supabase",   name: "Supabase",       category: "database",      status: "unconfigured", description: "PostgreSQL + pgvector RAG store", dashboardUrl: "https://supabase.com/dashboard",          docsUrl: "https://supabase.com/docs",        credentials: [{ key:"PROJECT_URL", value:"", masked:true }, { key:"ANON_KEY", value:"", masked:true }, { key:"SERVICE_ROLE_KEY", value:"", masked:true }], tags: ["rag","postgres"], dependsOn: [] },
        { id: "render",     name: "Render",          category: "hosting",       status: "unconfigured", description: "Backend deployment",             dashboardUrl: "https://dashboard.render.com",             docsUrl: "https://render.com/docs",          credentials: [{ key:"API_KEY", value:"", masked:true }], tags: ["hosting"], dependsOn: ["supabase"] },
        { id: "openrouter", name: "OpenRouter",      category: "ai_gateway",    status: "unconfigured", description: "Multi-model AI gateway",         dashboardUrl: "https://openrouter.ai/keys",               docsUrl: "https://openrouter.ai/docs",       credentials: [{ key:"API_KEY", value:"", masked:true }], tags: ["ai"], dependsOn: [] },
        { id: "discord",    name: "Discord",         category: "communication", status: "unconfigured", description: "War room notifications",         dashboardUrl: "https://discord.com/developers",           credentials: [{ key:"BOT_TOKEN", value:"", masked:true }], tags: [], dependsOn: [] },
        { id: "gdrive",     name: "Google Drive",    category: "storage",       status: "unconfigured", description: "Document storage",               dashboardUrl: "https://console.cloud.google.com",         credentials: [{ key:"CLIENT_ID", value:"", masked:true }], tags: [], dependsOn: [] },
        { id: "stripe",     name: "Stripe",          category: "payment",       status: "unconfigured", description: "Global card processing",         dashboardUrl: "https://dashboard.stripe.com",             credentials: [{ key:"PUBLISHABLE_KEY", value:"", masked:true }, { key:"SECRET_KEY", value:"", masked:true }, { key:"WEBHOOK_SECRET", value:"", masked:true }], tags: ["payment"], dependsOn: [] },
        { id: "byterover",  name: "Byterover",       category: "other",         status: "unconfigured", description: "Knowledge and vector storage",   dashboardUrl: "https://byterover.dev",                    credentials: [{ key:"API_KEY", value:"", masked:true }, { key:"WORKSPACE_ID", value:"", masked:true }], tags: ["knowledge"], dependsOn: ["supabase"] },
        { id: "newsapi",    name: "NewsAPI",         category: "news_data",     status: "unconfigured", description: "Live news intelligence",         dashboardUrl: "https://newsapi.org/account",              credentials: [{ key:"API_KEY", value:"", masked:true }], tags: ["news"], dependsOn: [] },
        { id: "alphav",     name: "AlphaVantage",    category: "fx_data",       status: "unconfigured", description: "Market and FX data",             dashboardUrl: "https://alphavantage.co/support/#api-key", credentials: [{ key:"API_KEY", value:"", masked:true }], tags: ["market"], dependsOn: [] },
      ]
    },
    {
      id: "geniechain", name: "GenieChain", type: "Blockchain Infrastructure", accent: T.teal,
      services: [
        { id: "alchemy",   name: "Alchemy",      category: "blockchain", status: "unconfigured", description: "RPC node provider",        dashboardUrl: "https://dashboard.alchemy.com",   credentials: [{ key:"API_KEY", value:"", masked:true }], tags: ["rpc"], dependsOn: [] },
        { id: "ipfs",      name: "IPFS/Pinata",  category: "storage",   status: "unconfigured", description: "Decentralised file storage", dashboardUrl: "https://app.pinata.cloud",         credentials: [{ key:"API_KEY", value:"", masked:true }, { key:"SECRET_KEY", value:"", masked:true }], tags: ["ipfs"], dependsOn: [] },
        { id: "etherscan", name: "Etherscan",    category: "monitoring", status: "unconfigured", description: "Block explorer API",        dashboardUrl: "https://etherscan.io/myapikey",   credentials: [{ key:"API_KEY", value:"", masked:true }], tags: ["blockchain"], dependsOn: ["alchemy"] },
      ]
    },
    {
      id: "geniepay", name: "GeniePay", type: "Payment Infrastructure", accent: T.green,
      services: [
        { id: "flutterwave", name: "Flutterwave", category: "payment", status: "unconfigured", description: "African payment gateway", dashboardUrl: "https://dashboard.flutterwave.com", credentials: [{ key:"PUBLIC_KEY", value:"", masked:true }, { key:"SECRET_KEY", value:"", masked:true }], tags: ["payments"], dependsOn: [] },
        { id: "paystack",    name: "Paystack",    category: "payment", status: "unconfigured", description: "African payments",        dashboardUrl: "https://dashboard.paystack.com",   credentials: [{ key:"PUBLIC_KEY", value:"", masked:true }, { key:"SECRET_KEY", value:"", masked:true }], tags: ["payments"], dependsOn: [] },
        { id: "stripe_pay",  name: "Stripe",      category: "payment", status: "unconfigured", description: "Global card processing",  dashboardUrl: "https://dashboard.stripe.com",     credentials: [{ key:"SECRET_KEY", value:"", masked:true }], tags: ["payment"], dependsOn: [] },
      ]
    },
    {
      id: "genieid", name: "GenieID", type: "Identity Infrastructure", accent: T.purple,
      services: [
        { id: "auth0",  name: "Auth0",  category: "identity",      status: "unconfigured", description: "Authentication platform",  dashboardUrl: "https://manage.auth0.com",    credentials: [{ key:"CLIENT_ID", value:"", masked:true }, { key:"CLIENT_SECRET", value:"", masked:true }], tags: ["auth"], dependsOn: [] },
        { id: "twilio", name: "Twilio", category: "communication", status: "unconfigured", description: "SMS and 2FA",             dashboardUrl: "https://console.twilio.com",  credentials: [{ key:"ACCOUNT_SID", value:"", masked:true }, { key:"AUTH_TOKEN", value:"", masked:true }], tags: [], dependsOn: [] },
        { id: "civic",  name: "Civic",  category: "identity",      status: "unconfigured", description: "KYC identity verification", dashboardUrl: "https://dashboard.civic.com", credentials: [{ key:"APP_ID", value:"", masked:true }, { key:"SECRET", value:"", masked:true }], tags: ["kyc"], dependsOn: ["auth0"] },
      ]
    },
    {
      id: "xdragon", name: "xDragon Studio", type: "AI Execution Engine", accent: T.orange,
      services: [
        { id: "ollama", name: "Ollama",  category: "ai_gateway", status: "active",         description: "Local LLM inference",   dashboardUrl: "http://localhost:11434",            credentials: [], tags: ["local"], dependsOn: [] },
        { id: "github", name: "GitHub",  category: "other",      status: "unconfigured",   description: "Source code hosting",   dashboardUrl: "https://github.com",               credentials: [{ key:"PERSONAL_ACCESS_TOKEN", value:"", masked:true }, { key:"USERNAME", value:"", masked:true }], tags: ["git"], dependsOn: [] },
      ]
    },
    {
      id: "sabiwork", name: "SabiWorkAI", type: "AI Workspace Platform", accent: T.teal,
      services: [
        { id: "sw_supabase",   name: "Supabase",      category: "database",      status: "unconfigured", description: "PostgreSQL + vector store",  dashboardUrl: "https://supabase.com/dashboard",  credentials: [{ key:"PROJECT_URL", value:"", masked:true }, { key:"ANON_KEY", value:"", masked:true }], tags: ["database"], dependsOn: [] },
        { id: "sw_railway",    name: "Railway (API)", category: "hosting",       status: "unconfigured", description: "Backend deployment",        dashboardUrl: "https://railway.app",             credentials: [{ key:"API_KEY", value:"", masked:true }], tags: ["hosting"], dependsOn: [] },
        { id: "sw_openrouter", name: "OpenRouter",    category: "ai_gateway",    status: "unconfigured", description: "Multi-model AI gateway",    dashboardUrl: "https://openrouter.ai/keys",      credentials: [{ key:"API_KEY", value:"", masked:true }], tags: ["ai"], dependsOn: [] },
        { id: "sw_spark",      name: "Spark Messenger", category: "communication", status: "unconfigured", description: "Team messaging",          dashboardUrl: "https://spark.archonnexus.com",   credentials: [], tags: ["messaging"], dependsOn: [] },
      ]
    },
    {
      id: "errandx", name: "ErrandX", type: "Logistics & Delivery Platform", accent: T.orange,
      services: [
        { id: "ex_supabase",  name: "Supabase",     category: "database", status: "unconfigured", description: "Order + delivery DB",      dashboardUrl: "https://supabase.com/dashboard", credentials: [{ key:"PROJECT_URL", value:"", masked:true }, { key:"ANON_KEY", value:"", masked:true }], tags: ["database"], dependsOn: [] },
        { id: "ex_paystack",  name: "Paystack",     category: "payment",  status: "unconfigured", description: "Nigerian payment gateway",  dashboardUrl: "https://dashboard.paystack.com", credentials: [{ key:"PUBLIC_KEY", value:"", masked:true }, { key:"SECRET_KEY", value:"", masked:true }], tags: ["payments"], dependsOn: [] },
        { id: "ex_geniepay",  name: "GeniePay",     category: "payment",  status: "unconfigured", description: "Internal payment gateway",  dashboardUrl: "https://geniepay.archonnexus.com", credentials: [], tags: ["payments"], dependsOn: [] },
        { id: "ex_twilio",    name: "Twilio SMS",   category: "communication", status: "unconfigured", description: "Delivery SMS alerts",  dashboardUrl: "https://console.twilio.com",      credentials: [{ key:"ACCOUNT_SID", value:"", masked:true }, { key:"AUTH_TOKEN", value:"", masked:true }], tags: [], dependsOn: [] },
      ]
    },
  ];
}

function uid() { return Math.random().toString(36).substring(2, 10); }
function download(filename: string, text: string) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text])), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

// ─────────────────────────────────────────────────────────────
// INFRASTRUCTURE DEPENDENCY MAP — layout engine
// ─────────────────────────────────────────────────────────────
const MAP_W         = 1500;
const MAP_H         = 820;
const HUB_R         = 48;   // venture hub radius
const SVC_R         = 22;   // service node radius
const SPOKE_DIST    = 120;  // service distance from venture hub

// Category → short glyph label shown inside service nodes
const CAT_GLYPH: Record<string, string> = {
  database:'DB', hosting:'HOST', ai_gateway:'AI', payment:'PAY',
  blockchain:'BC', identity:'ID', communication:'MSG', storage:'STR',
  monitoring:'MON', analytics:'BI', fx_data:'FX', news_data:'NEWS', other:'SVC',
};
// Category → accent colour
const CAT_COLOR: Record<string, string> = {
  database: '#4a8aba', hosting: '#5ab0c8', ai_gateway: '#9a7ab0', payment: '#4a9a6a',
  blockchain: '#5ab0c8', identity: '#b04a9a', communication: '#d4805a', storage: '#8aaa60',
  monitoring: '#c9a84c', analytics: '#5ab0c8', fx_data: '#4a9a6a', news_data: '#d4805a', other: '#7a7060',
};

interface MapVentureNode {
  kind: 'venture';
  id: string; label: string; accent: string; type: string;
  x: number; y: number; riskScore: number; serviceCount: number;
}
interface MapServiceNode {
  kind: 'service';
  id: string; label: string; fullName: string; category: string; status: string;
  x: number; y: number; accent: string; ventureId: string; ventureName: string; riskScore: number;
}
type MapNode = MapVentureNode | MapServiceNode;

interface MapEdge {
  id: string; fromId: string; toId: string;
  type: 'owns' | 'depends';  // owns = venture→service, depends = service→service
  color: string;
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
}

function buildMap(ventures: Venture[]): { nodes: MapNode[]; edges: MapEdge[] } {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  // Place venture hubs in an arc / grid so they don't overlap
  // 5 ventures → pentagon; more → grid rows
  const count = ventures.length;
  const venturePositions: { x: number; y: number }[] = [];

  if (count <= 5) {
    // Pentagon arrangement
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      venturePositions.push({
        x: MAP_W / 2 + Math.cos(a) * 300,
        y: MAP_H / 2 + Math.sin(a) * 250,
      });
    }
  } else {
    // Two-row grid
    const cols = Math.ceil(count / 2);
    for (let i = 0; i < count; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      venturePositions.push({ x: 200 + col * 280, y: 180 + row * 320 });
    }
  }

  ventures.forEach((v, vi) => {
    const { x: vx, y: vy } = venturePositions[vi];

    nodes.push({
      kind: 'venture', id: v.id, label: v.name, accent: v.accent,
      type: v.type, x: vx, y: vy,
      riskScore: calculateVentureRisk(v),
      serviceCount: v.services.length,
    });

    // Spread services evenly around the hub
    const sCount = v.services.length;
    v.services.forEach((s, si) => {
      const angle = (si / Math.max(sCount, 1)) * Math.PI * 2 - Math.PI / 2;
      const dist  = sCount === 1 ? 0 : SPOKE_DIST + Math.floor(si / 8) * 50;
      const sx = Math.max(SVC_R + 8, Math.min(MAP_W - SVC_R - 8, vx + Math.cos(angle) * dist));
      const sy = Math.max(SVC_R + 8, Math.min(MAP_H - SVC_R - 8, vy + Math.sin(angle) * dist));

      nodes.push({
        kind: 'service', id: s.id,
        label: CAT_GLYPH[s.category] || 'SVC',
        fullName: s.name, category: s.category, status: s.status,
        x: sx, y: sy, accent: v.accent,
        ventureId: v.id, ventureName: v.name,
        riskScore: calculateServiceRisk(s),
      });

      // Ownership edge: venture hub → service
      edges.push({ id: `own-${v.id}-${s.id}`, fromId: v.id, toId: s.id, type: 'owns', color: v.accent + '60' });

      // Dependency edges: service → service
      (s.dependsOn || []).forEach(depId => {
        edges.push({ id: `dep-${s.id}-${depId}`, fromId: s.id, toId: depId, type: 'depends', color: v.accent });
      });
    });
  });

  return { nodes, edges };
}

function curvedPath(x1: number, y1: number, x2: number, y2: number, curvature = 0.35): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const cx = mx - dy * curvature;
  const cy = my + dx * curvature;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

// ─────────────────────────────────────────────────────────────
// AGENT MONITOR — calls local Ollama
// ─────────────────────────────────────────────────────────────
async function callAgent(agentId: string, prompt: string, model: string): Promise<string> {
  const AGENT_PERSONAS: Record<string, string> = {
    MEI:    "You are Mei Zhu-Adeyemi, Chief BI Officer at Archon Nexus. You analyse service infrastructure data and generate revenue strategy insights, cost optimisation recommendations, and commercial risk assessments. Be concise, data-driven, and action-oriented.",
    AYO:    "You are Ayo Hastruup, CTO at Archon Nexus. You monitor infrastructure health, identify technical risks, and prescribe engineering remediation. Be direct, technical, and prioritise uptime and security.",
    ARCHON: "You are The Archon, Digital CEO of Archon Nexus. You synthesise infrastructure data into executive risk assessments and operational audit reports. Be authoritative, strategic, and precise. Format your output as a structured report.",
  };
  const response = await fetch(`${getOllamaUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model, stream: false,
      messages: [
        { role: "system", content: AGENT_PERSONAS[agentId] || AGENT_PERSONAS.ARCHON },
        { role: "user",   content: prompt },
      ],
    }),
  });
  const data = await response.json();
  return data.message?.content || "No response from agent.";
}

// ─────────────────────────────────────────────────────────────
// ARCHON BACKEND — report queue (stub for future integration)
// When Archon-xDragon integration is live, replace this with:
//   POST https://archon-backend-3q4b.onrender.com/api/reports
// ─────────────────────────────────────────────────────────────
interface ArchonReport { id: string; timestamp: number; ventureId: string; ventureName: string; reportText: string; status: "queued" | "sent" | "failed"; }

function queueReportForArchon(report: ArchonReport) {
  const queue: ArchonReport[] = JSON.parse(localStorage.getItem(REPORTS_QUEUE_KEY) || "[]");
  queue.unshift(report);
  localStorage.setItem(REPORTS_QUEUE_KEY, JSON.stringify(queue.slice(0, 20)));
}

async function sendReportToArchon(report: ArchonReport): Promise<boolean> {
  // ── Archon-xDragon integration placeholder ─────────────────────────
  // TODO: Replace with real endpoint once integration is built:
  //   const res = await fetch("https://archon-backend-3q4b.onrender.com/api/reports", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json", "X-Archon-Source": "xDragon-Studio" },
  //     body: JSON.stringify(report),
  //   });
  //   return res.ok;
  // ──────────────────────────────────────────────────────────────────
  console.info("[ARCHON-BRIDGE] Report queued locally — Archon integration pending:", report.id);
  return false; // will be true once live endpoint is available
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
export default function ServicesDashboard({ onInject: _onInject }: ServicesDashboardProps) {
  type ViewMode = "overview" | "venture" | "graph" | "monitor" | "discovery" | "feed" | "reports";

  const [ventures,           setVentures]           = useState<Venture[]>([]);
  const [selectedVentureId,  setSelectedVentureId]  = useState<string | null>(null);
  const [view,               setView]               = useState<ViewMode>("overview");
  const [search,             setSearch]             = useState("");
  const [showForm,           setShowForm]           = useState(false);
  const [form,               setForm]               = useState({ name: "", category: "other" as ServiceCategory, description: "", dashboardUrl: "", credentials: [""] });

  // Agent monitoring state
  const [selectedModel,  setSelectedModel]  = useState("llama3");
  const [monitorAgent,   setMonitorAgent]   = useState<"MEI"|"AYO">("MEI");
  const [monitorOutput,  setMonitorOutput]  = useState("");
  const [monitorLoading, setMonitorLoading] = useState(false);

  // Real-time feed state
  const [feedLog,     setFeedLog]     = useState<{ ts: number; svc: string; status: string; latency: number; msg: string }[]>([]);
  const [feedRunning, setFeedRunning] = useState(false);
  const feedRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedLogRef   = useRef<HTMLDivElement>(null);

  // Discovery state
  const [discoveryText,       setDiscoveryText]       = useState("");
  const [discoveryMode,       setDiscoveryMode]       = useState<"env"|"docker">("env");
  const [discoveredServices,  setDiscoveredServices]  = useState<DiscoveredService[]>([]);
  const [discoveryTargetId,   setDiscoveryTargetId]   = useState<string>("");

  // Report state
  const [reportLoading,  setReportLoading]  = useState(false);
  const [reportOutput,   setReportOutput]   = useState("");
  const [reportVentureId, setReportVentureId] = useState<string>("");
  const [reportQueue,    setReportQueue]    = useState<ArchonReport[]>([]);

  // Tooltip state for graph
  const [hoveredNode, setHoveredNode] = useState<MapNode | null>(null);
  const [selectedMapNode, setSelectedMapNode] = useState<MapNode | null>(null);
  const [mapFilter, setMapFilter] = useState<'all'|'active'|'error'|string>('all');
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const mapPanRef = useRef<{ active: boolean; startX: number; startY: number; originPan: { x: number; y: number } }>({ active: false, startX: 0, startY: 0, originPan: { x: 0, y: 0 } });

  // ── Load ─────────────────────────────────────────────────
  useEffect(() => {
    loadVentures().then(v => {
      const withRisk = v.map(venture => ({ ...venture, riskScore: calculateVentureRisk(venture) }));
      setVentures(withRisk);
      if (v.length > 0) { setSelectedVentureId(v[0].id); setReportVentureId(v[0].id); setDiscoveryTargetId(v[0].id); }
    });
    const queue: ArchonReport[] = JSON.parse(localStorage.getItem(REPORTS_QUEUE_KEY) || "[]");
    setReportQueue(queue);
    // Load default model from settings
    const agentModels = JSON.parse(localStorage.getItem("archon_agent_models") || "{}");
    setSelectedModel(agentModels["MEI"] || agentModels["AYO"] || "llama3");
  }, []);

  // ── Persist ───────────────────────────────────────────────
  async function update(v: Venture[]) {
    const withRisk = v.map(venture => ({ ...venture, riskScore: calculateVentureRisk(venture) }));
    setVentures(withRisk);
    await saveVentures(withRisk);
  }

  // ── Feed ─────────────────────────────────────────────────
  const addFeedEntry = useCallback((svc: string, status: string, latency: number, msg: string) => {
    setFeedLog(prev => [{ ts: Date.now(), svc, status, latency, msg }, ...prev].slice(0, 200));
    setTimeout(() => { if (feedLogRef.current) feedLogRef.current.scrollTop = 0; }, 50);
  }, []);

  const startFeed = useCallback(() => {
    if (feedRunning) return;
    setFeedRunning(true);
    feedRef.current = setInterval(async () => {
      const allServices = ventures.flatMap(v => v.services.filter(s => s.dashboardUrl?.startsWith("http")));
      if (allServices.length === 0) return;
      const svc = allServices[Math.floor(Math.random() * allServices.length)];
      const start = performance.now();
      try {
        await fetch(svc.dashboardUrl!, { mode: "no-cors", signal: AbortSignal.timeout(3000) });
        const lat = Math.round(performance.now() - start);
        addFeedEntry(svc.name, "ok", lat, `Ping OK — ${lat}ms`);
        update(ventures.map(v => ({ ...v, services: v.services.map(s => s.id === svc.id ? { ...s, status: "active" as const, latencyMs: lat, lastChecked: Date.now() } : s) })));
      } catch {
        addFeedEntry(svc.name, "error", 0, "Unreachable or connection refused");
        update(ventures.map(v => ({ ...v, services: v.services.map(s => s.id === svc.id ? { ...s, status: "error" as const, lastChecked: Date.now() } : s) })));
      }
    }, 4000);
  }, [feedRunning, ventures, addFeedEntry]);

  const stopFeed = useCallback(() => {
    if (feedRef.current) clearInterval(feedRef.current);
    setFeedRunning(false);
  }, []);

  useEffect(() => () => { if (feedRef.current) clearInterval(feedRef.current); }, []);

  // ── Agent Monitor ─────────────────────────────────────────
  async function runAgentMonitor() {
    const v = ventures.find(v => v.id === selectedVentureId) || ventures[0];
    if (!v) return;
    setMonitorLoading(true);
    setMonitorOutput("");
    const infraData = v.services.map(s => ({
      name: s.name, category: s.category, status: s.status,
      latency: s.latencyMs, risk: calculateServiceRisk(s),
      configured: s.credentials.some(c => c.value),
    }));
    const prompt = monitorAgent === "MEI"
      ? `Analyse the following infrastructure data for ${v.name} and provide:\n1. Revenue risk assessment\n2. Cost optimisation opportunities\n3. Commercial health score (0-100)\n4. Top 3 revenue-impacting actions\n\nInfrastructure:\n${JSON.stringify(infraData, null, 2)}`
      : `Analyse the following infrastructure for ${v.name} and provide:\n1. Infra health score (0-100)\n2. Critical failure points\n3. Latency and availability risks\n4. Top 3 engineering remediation actions\n\nInfrastructure:\n${JSON.stringify(infraData, null, 2)}`;
    try {
      const output = await callAgent(monitorAgent, prompt, selectedModel);
      setMonitorOutput(output);
    } catch (e) {
      setMonitorOutput(`Error contacting Ollama: ${e instanceof Error ? e.message : String(e)}\n\nMake sure Ollama is running on ${getOllamaUrl()}`);
    }
    setMonitorLoading(false);
  }

  // ── ARCHON Report ─────────────────────────────────────────
  async function generateReport() {
    const v = ventures.find(v => v.id === reportVentureId);
    if (!v) return;
    setReportLoading(true);
    setReportOutput("");
    const infraData = v.services.map(s => ({
      name: s.name, category: s.category, status: s.status,
      risk: calculateServiceRisk(s), latency: s.latencyMs || "not tested",
      configured: s.credentials.some(c => c.value),
    }));
    const overallRisk = calculateVentureRisk(v);
    const prompt = `Generate a formal ARCHON NEXUS Infrastructure Audit Report for ${v.name} (${v.type}).\n\nOverall Risk Score: ${overallRisk}/100\n\nService Data:\n${JSON.stringify(infraData, null, 2)}\n\nFormat the report as:\n1. EXECUTIVE SUMMARY\n2. RISK MATRIX (table: Service | Status | Risk | Action)\n3. CRITICAL ISSUES (if any)\n4. RECOMMENDATIONS (priority ordered)\n5. OPERATIONAL READINESS SCORE\n6. NEXT ACTIONS FOR AYO & MODEBOLA\n\nDate: ${new Date().toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" })}`;
    try {
      const reportText = await callAgent("ARCHON", prompt, selectedModel);
      setReportOutput(reportText);
      const report: ArchonReport = {
        id: `RPT-${Date.now()}`, timestamp: Date.now(),
        ventureId: v.id, ventureName: v.name, reportText,
        status: "queued",
      };
      queueReportForArchon(report);
      const sent = await sendReportToArchon(report);
      report.status = sent ? "sent" : "queued";
      setReportQueue(prev => [report, ...prev].slice(0, 20));
    } catch (e) {
      setReportOutput(`Agent error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setReportLoading(false);
  }

  // ── Auto Discovery ────────────────────────────────────────
  function runDiscovery() {
    const discovered = discoveryMode === "env"
      ? discoverFromEnv(discoveryText)
      : discoverFromDockerCompose(discoveryText);
    setDiscoveredServices(discovered);
  }

  function importDiscovered(d: DiscoveredService) {
    const targetId = discoveryTargetId || selectedVentureId;
    if (!targetId) return;
    const newService: Service = {
      id: uid(), name: d.name, category: d.category, status: "unconfigured",
      description: d.hint, credentials: d.keys.map(k => ({ key: k, value: "", masked: true })),
      tags: [], dependsOn: [],
    };
    update(ventures.map(v => v.id === targetId ? { ...v, services: [...v.services, newService] } : v));
    setDiscoveredServices(prev => prev.filter(s => s.name !== d.name));
  }

  // ── CRUD helpers ──────────────────────────────────────────
  const venture = useMemo(() => ventures.find(v => v.id === selectedVentureId) || null, [ventures, selectedVentureId]);
  const services = useMemo(() => {
    if (!venture) return [];
    return venture.services.filter(s =>
      (s.name + s.category + s.tags.join(" ")).toLowerCase().includes(search.toLowerCase())
    );
  }, [venture, search]);

  function addVenture() {
    const name = prompt("Venture name:"); if (!name) return;
    const v: Venture = { id: uid(), name, type: "Custom Venture", accent: T.blue, services: [] };
    update([...ventures, v]);
    setSelectedVentureId(v.id);
  }

  function saveService() {
    if (!venture || !form.name) return;
    const newService: Service = {
      id: uid(), name: form.name, category: form.category, status: "unconfigured",
      description: form.description, dashboardUrl: form.dashboardUrl,
      credentials: form.credentials.filter(Boolean).map(k => ({ key: k, value: "", masked: true })),
      tags: [], dependsOn: [],
    };
    update(ventures.map(v => v.id === venture.id ? { ...v, services: [...v.services, newService] } : v));
    setShowForm(false);
    setForm({ name: "", category: "other", description: "", dashboardUrl: "", credentials: [""] });
  }

  function deleteService(serviceId: string) {
    if (!venture || !window.confirm("Delete this service?")) return;
    update(ventures.map(v => v.id === venture.id ? { ...v, services: v.services.filter(s => s.id !== serviceId) } : v));
  }

  function toggleMask(serviceId: string, idx: number) {
    if (!venture) return;
    update(ventures.map(v => v.id !== venture.id ? v : { ...v, services: v.services.map(s => s.id !== serviceId ? s : { ...s, credentials: s.credentials.map((c, i) => i === idx ? { ...c, masked: !c.masked } : c) }) }));
  }

  function updateCredentialValue(serviceId: string, idx: number, val: string) {
    if (!venture) return;
    update(ventures.map(v => v.id !== venture.id ? v : { ...v, services: v.services.map(s => s.id !== serviceId ? s : { ...s, credentials: s.credentials.map((c, i) => i === idx ? { ...c, value: val } : c) }) }));
  }

  async function pingService(service: Service) {
    if (!service.dashboardUrl?.startsWith("http")) return;
    const start = performance.now();
    try {
      await fetch(service.dashboardUrl, { mode: "no-cors", signal: AbortSignal.timeout(4000) });
      const lat = Math.round(performance.now() - start);
      update(ventures.map(v => ({ ...v, services: v.services.map(s => s.id === service.id ? { ...s, status: "active" as const, latencyMs: lat, lastChecked: Date.now() } : s) })));
    } catch {
      update(ventures.map(v => ({ ...v, services: v.services.map(s => s.id === service.id ? { ...s, status: "error" as const, lastChecked: Date.now() } : s) })));
    }
  }

  async function bulkPing() {
    if (!venture) return;
    for (const s of venture.services) await pingService(s);
  }

  function exportEnv() {
    if (!venture) return;
    let text = `# ARCHON NEXUS — ${venture.name}\n# Generated ${new Date().toISOString()}\n`;
    venture.services.forEach(s => { text += `\n# ${s.name}\n`; s.credentials.forEach(c => { text += `${c.key}=${c.value || ""}\n`; }); });
    download(`${venture.name.replace(/\s+/g, "_").toLowerCase()}.env`, text);
  }

  // ── Shared styles ─────────────────────────────────────────
  const inputSt: React.CSSProperties = { backgroundColor: T.black, border: `1px solid ${T.border}`, color: T.text, ...mono, fontSize: "0.64rem", padding: "6px 8px", borderRadius: "4px", width: "100%", boxSizing: "border-box", outline: "none" };
  const btn = (color = T.border, active = false): React.CSSProperties => ({
    backgroundColor: active ? color + "22" : T.surface3, border: `1px solid ${active ? color : T.border}`,
    color: active ? color : T.text, ...mono, fontSize: "0.56rem", padding: "4px 10px", borderRadius: "4px",
    cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em",
  });

  const graph  = useMemo(() => buildMap(ventures), [ventures]);
  const totalRisk = ventures.length ? Math.round(ventures.reduce((a, v) => a + (v.riskScore || 0), 0) / ventures.length) : 0;

  const NAV_TABS: { id: ViewMode; label: string; color: string }[] = [
    { id: "overview",   label: "◈ Overview",   color: T.gold   },
    { id: "venture",    label: "◉ Services",   color: T.teal   },
    { id: "graph",      label: "⬡ Graph",      color: T.purple },
    { id: "feed",       label: "▶ Live Feed",  color: T.green  },
    { id: "monitor",    label: "◎ Agents",     color: T.blue   },
    { id: "discovery",  label: "⊕ Discovery",  color: T.orange },
    { id: "reports",    label: "◆ Reports",    color: T.gold   },
  ];

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, overflow: "hidden", background: T.surface, ...mono, fontSize: "0.64rem", color: T.text }}>

      {/* ══ LEFT SIDEBAR ══════════════════════════════════════════════ */}
      <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${T.border}`, background: T.black, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 14px 8px", borderBottom: `1px solid ${T.border}` }}>
          <select
            value={selectedVentureId || '__overview'}
            onChange={e => {
              if (e.target.value === '__overview') { setView('overview'); }
              else { setSelectedVentureId(e.target.value); setView('venture'); }
            }}
            style={{ color: T.gold, fontSize: "0.68rem", letterSpacing: "0.12em", background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer', fontFamily: '"Menlo","Monaco","Consolas",monospace', width: '100%', marginBottom: 2 }}
          >
            <option value="__overview" style={{ background: '#161616' }}>◈ All Services</option>
            {ventures.map(v => (
              <option key={v.id} value={v.id} style={{ background: '#161616' }}>{v.name}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.96rem", fontWeight: 700, color: riskColor(totalRisk) }}>{totalRisk}</div>
              <div style={{ fontSize: "0.48rem", color: T.textDim }}>FLEET RISK</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.96rem", fontWeight: 700, color: T.green }}>{ventures.flatMap(v => v.services).filter(s => s.status === "active").length}</div>
              <div style={{ fontSize: "0.48rem", color: T.textDim }}>ACTIVE</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.96rem", fontWeight: 700, color: T.red }}>{ventures.flatMap(v => v.services).filter(s => s.status === "error").length}</div>
              <div style={{ fontSize: "0.48rem", color: T.textDim }}>ERRORS</div>
            </div>
          </div>
        </div>

        {/* Nav tabs */}
        <div style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
          {NAV_TABS.map(tab => (
            <div key={tab.id} onClick={() => setView(tab.id)}
              style={{ padding: "7px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
                background: view === tab.id ? T.surface2 : "transparent",
                borderLeft: `3px solid ${view === tab.id ? tab.color : "transparent"}`,
                color: view === tab.id ? tab.color : T.textMuted, transition: "all 0.15s" }}>
              <span style={{ fontSize: "0.64rem" }}>{tab.label}</span>
            </div>
          ))}
        </div>

        {/* Venture list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          <div style={{ padding: "4px 14px 4px", fontSize: "0.48rem", color: T.textDim, letterSpacing: "0.2em", textTransform: "uppercase" }}>VENTURES</div>
          {ventures.map(v => (
            <div key={v.id} onClick={() => { setSelectedVentureId(v.id); if (view === "overview") setView("venture"); }}
              style={{ padding: "6px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                background: selectedVentureId === v.id ? T.surface2 : "transparent",
                borderLeft: `3px solid ${selectedVentureId === v.id ? v.accent : "transparent"}` }}>
              <div>
                <div style={{ color: selectedVentureId === v.id ? T.text : T.textMuted, fontSize: "0.65rem" }}>{v.name}</div>
                <div style={{ color: T.textDim, fontSize: "0.5rem" }}>{v.services.length} services</div>
              </div>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: riskColor(v.riskScore || 0) }}>{v.riskScore || 0}</div>
            </div>
          ))}
          <div onClick={addVenture} style={{ padding: "6px 14px", cursor: "pointer", color: T.textDim, fontSize: "0.62rem", borderTop: `1px solid ${T.border}`, marginTop: 4 }}>
            + Add Venture
          </div>
        </div>

        {/* Feed status */}
        <div style={{ padding: "8px 14px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: feedRunning ? T.green : T.textDim, boxShadow: feedRunning ? `0 0 6px ${T.green}` : "none" }} />
          <span style={{ fontSize: "0.52rem", color: feedRunning ? T.green : T.textDim }}>LIVE FEED {feedRunning ? "ON" : "OFF"}</span>
        </div>
      </div>

      {/* ══ MAIN AREA ════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ── OVERVIEW ──────────────────────────────────────────────── */}
        {view === "overview" && (
          <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
            <div style={{ color: T.gold, fontSize: "0.72rem", letterSpacing: "0.14em", marginBottom: 16 }}>FLEET OVERVIEW</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {ventures.map(v => {
                const active = v.services.filter(s => s.status === "active").length;
                const errors = v.services.filter(s => s.status === "error").length;
                const risk   = v.riskScore || 0;
                return (
                  <div key={v.id} onClick={() => { setSelectedVentureId(v.id); setView("venture"); }}
                    style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: 14, cursor: "pointer", transition: "border-color 0.2s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = v.accent}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = T.border}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ color: v.accent, fontWeight: 700, fontSize: "0.72rem" }}>{v.name}</div>
                        <div style={{ color: T.textMuted, fontSize: "0.54rem", marginTop: 2 }}>{v.type}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "1rem", fontWeight: 700, color: riskColor(risk) }}>{risk}</div>
                        <div style={{ fontSize: "0.48rem", color: T.textDim }}>RISK</div>
                      </div>
                    </div>
                    {/* Risk bar */}
                    <div style={{ height: 3, background: T.surface3, borderRadius: 2, marginBottom: 10 }}>
                      <div style={{ height: "100%", borderRadius: 2, background: riskColor(risk), width: `${risk}%`, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.56rem" }}>
                      <span style={{ color: T.textMuted }}>{v.services.length} services</span>
                      <span style={{ color: T.green }}>● {active} active</span>
                      {errors > 0 && <span style={{ color: T.red }}>⚠ {errors} error{errors > 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── SERVICES VIEW ─────────────────────────────────────────── */}
        {view === "venture" && venture && (
          <>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}`, background: T.black, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div>
                <div style={{ color: venture.accent, fontWeight: 700, fontSize: "0.8rem" }}>{venture.name}</div>
                <div style={{ color: T.textMuted, fontSize: "0.54rem", marginTop: 2 }}>{venture.type} · Risk: <span style={{ color: riskColor(venture.riskScore || 0), fontWeight: 700 }}>{venture.riskScore || 0}/100</span></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={bulkPing} style={btn(T.teal)}>Ping All</button>
                <button onClick={exportEnv} style={btn()}>Export .env</button>
                <button onClick={() => setShowForm(v => !v)} style={btn(T.gold, showForm)}>+ Add Service</button>
              </div>
            </div>

            <div style={{ padding: "8px 18px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
              <input placeholder="Filter by name, category, tag..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputSt, maxWidth: 360 }} />
            </div>

            <div style={{ flex: 1, padding: "14px 18px", overflowY: "auto" }}>
              {showForm && (
                <div style={{ background: T.surface2, border: `1px solid ${T.gold}`, borderRadius: 6, padding: 16, marginBottom: 18 }}>
                  <div style={{ color: T.gold, marginBottom: 12, fontSize: "0.68rem" }}>NEW SERVICE</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    {([["Service Name", "name", "text", "e.g. Supabase"], ["Description", "description", "text", "Brief description..."], ["Dashboard URL", "dashboardUrl", "text", "https://..."]] as const).map(([label, field, type, placeholder]) => (
                      <div key={field}>
                        <div style={{ fontSize: "0.52rem", color: T.textMuted, marginBottom: 3 }}>{label}</div>
                        <input type={type} placeholder={placeholder} value={(form as unknown as Record<string, string>)[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} style={inputSt} />
                      </div>
                    ))}
                    <div>
                      <div style={{ fontSize: "0.52rem", color: T.textMuted, marginBottom: 3 }}>Category</div>
                      <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as ServiceCategory })} style={inputSt}>
                        {(["database","hosting","ai_gateway","payment","blockchain","identity","communication","storage","monitoring","fx_data","other"] as ServiceCategory[]).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
                    <div style={{ fontSize: "0.52rem", color: T.textMuted, marginBottom: 6 }}>Environment Keys</div>
                    {form.credentials.map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                        <input placeholder="KEY_NAME" value={c} onChange={e => { const a = [...form.credentials]; a[i] = e.target.value; setForm({ ...form, credentials: a }); }} style={{ ...inputSt, flex: 1 }} />
                      </div>
                    ))}
                    <button onClick={() => setForm({ ...form, credentials: [...form.credentials, ""] })} style={{ ...btn(), borderStyle: "dashed" }}>+ Add Key</button>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                    <button onClick={() => setShowForm(false)} style={btn()}>Cancel</button>
                    <button onClick={saveService} style={btn(T.green)}>Save Service</button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {services.map(service => {
                  const risk = calculateServiceRisk(service);
                  return (
                    <div key={service.id} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, overflow: "hidden" }}>
                      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, background: T.black, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                            background: service.status === "active" ? T.green : service.status === "error" ? T.red : T.goldDim,
                            boxShadow: service.status === "active" ? `0 0 8px ${T.green}` : "none" }} />
                          <div>
                            <div style={{ fontWeight: 700, color: T.text, fontSize: "0.72rem" }}>{service.name}</div>
                            <div style={{ color: T.textMuted, fontSize: "0.54rem" }}>{service.description}</div>
                          </div>
                          <span style={{ padding: "1px 7px", borderRadius: 10, background: T.surface3, border: `1px solid ${T.border}`, fontSize: "0.5rem", color: T.gold, textTransform: "uppercase" }}>
                            {service.category.replace("_", " ")}
                          </span>
                          {/* Risk badge */}
                          <span style={{ padding: "1px 7px", borderRadius: 10, background: riskColor(risk) + "22", border: `1px solid ${riskColor(risk)}55`, fontSize: "0.52rem", color: riskColor(risk), fontWeight: 700 }}>
                            ⚠ {risk}
                          </span>
                        </div>
                        <button onClick={() => deleteService(service.id)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: "0.7rem" }}>✕</button>
                      </div>

                      <div style={{ padding: 12 }}>
                        {service.credentials.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {service.credentials.map((cred, idx) => (
                              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, padding: "5px 10px", borderRadius: 4, border: `1px solid ${T.border}` }}>
                                <span style={{ width: 130, color: T.teal, fontSize: "0.56rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{cred.key}</span>
                                <input type={cred.masked ? "password" : "text"} value={cred.value} onChange={e => updateCredentialValue(service.id, idx, e.target.value)}
                                  style={{ ...inputSt, flex: 1, background: "transparent", border: "none", padding: 0 }} placeholder="Paste credential..." />
                                <button onClick={() => toggleMask(service.id, idx)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: "0.7rem" }} title={cred.masked ? "Show" : "Hide"}>{cred.masked ? "👁" : "🕶"}</button>
                                <button onClick={() => navigator.clipboard.writeText(cred.value)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: "0.7rem" }}>📋</button>
                              </div>
                            ))}
                          </div>
                        ) : <div style={{ color: T.textDim, fontSize: "0.56rem", fontStyle: "italic" }}>No credentials required.</div>}
                      </div>

                      <div style={{ padding: "8px 14px", background: T.surface3, borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: T.textMuted, fontSize: "0.54rem" }}>
                          {service.latencyMs ? `${service.latencyMs}ms` : "not tested"}
                          {service.lastChecked && ` · ${new Date(service.lastChecked).toLocaleTimeString()}`}
                        </span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => pingService(service)} style={btn(T.teal)}>Ping</button>
                          {service.dashboardUrl && <a href={service.dashboardUrl} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: "none" }}>Dashboard ↗</a>}
                          {service.docsUrl && <a href={service.docsUrl} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: "none" }}>Docs ↗</a>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {services.length === 0 && <div style={{ textAlign: "center", padding: 40, color: T.textDim, border: `1px dashed ${T.border}`, borderRadius: 6 }}>No services found.</div>}
              </div>
            </div>
          </>
        )}

        {/* ══ INFRASTRUCTURE DEPENDENCY MAP ════════════════════════════ */}
        {view === "graph" && (() => {
          const visibleServiceIds = new Set(
            graph.nodes
              .filter(n => {
                if (n.kind !== "service") return true;
                if (mapFilter === "active") return (n as MapServiceNode).status === "active";
                if (mapFilter === "error")  return (n as MapServiceNode).status === "error";
                if (mapFilter !== "all")    return (n as MapServiceNode).category === mapFilter;
                return true;
              })
              .map(n => n.id)
          );
          const visibleNodes = graph.nodes.filter(n => n.kind === "venture" || visibleServiceIds.has(n.id));
          const visibleEdges = graph.edges.filter(e => {
            const fNode = graph.nodes.find(x => x.id === e.fromId);
            const tNode = graph.nodes.find(x => x.id === e.toId);
            return (visibleServiceIds.has(e.fromId) || fNode?.kind === "venture") &&
                   (visibleServiceIds.has(e.toId)   || tNode?.kind === "venture");
          });
          const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
          const highlighted = selectedMapNode
            ? new Set([selectedMapNode.id, ...graph.edges.filter(e => e.fromId === selectedMapNode.id || e.toId === selectedMapNode.id).flatMap(e => [e.fromId, e.toId])])
            : null;
          const categories = [...new Set(graph.nodes.filter(n => n.kind === "service").map(n => (n as MapServiceNode).category))];

          return (
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

              {/* Toolbar */}
              <div style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}`, background: T.black, display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
                <span style={{ color: T.purple, fontWeight: 700, fontSize: "0.68rem", flexShrink: 0 }}>⬡ INFRASTRUCTURE DEPENDENCY MAP</span>
                <span style={{ color: T.textDim, fontSize: "0.54rem" }}>
                  {ventures.length} ventures · {graph.nodes.filter(n => n.kind === "service").length} services · {graph.edges.filter(e => e.type === "depends").length} dependencies
                </span>
                <div style={{ display: "flex", gap: 5, marginLeft: 8, flexWrap: "wrap" }}>
                  {(["all","active","error"] as const).map(f => (
                    <button key={f} onClick={() => setMapFilter(f)}
                      style={{ ...btn(f === "active" ? T.green : f === "error" ? T.red : T.textMuted, mapFilter === f), fontSize: "0.52rem", padding: "2px 8px" }}>
                      {f === "all" ? "All" : f === "active" ? "Active" : "Errors"}
                    </button>
                  ))}
                  {categories.slice(0,7).map(cat => (
                    <button key={cat} onClick={() => setMapFilter(mapFilter === cat ? "all" : cat)}
                      style={{ ...btn(CAT_COLOR[cat] || T.textMuted, mapFilter === cat), fontSize: "0.5rem", padding: "2px 7px" }}>
                      {CAT_GLYPH[cat] || cat}
                    </button>
                  ))}
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>
                  <button onClick={() => setMapZoom(z => Math.min(z + 0.15, 2.5))} style={{ ...btn(), padding: "2px 8px", fontSize: "0.8rem" }}>+</button>
                  <span style={{ ...mono, fontSize: "0.54rem", color: T.textMuted, minWidth: 36, textAlign: "center" }}>{Math.round(mapZoom * 100)}%</span>
                  <button onClick={() => setMapZoom(z => Math.max(z - 0.15, 0.3))} style={{ ...btn(), padding: "2px 8px", fontSize: "0.8rem" }}>−</button>
                  <button onClick={() => { setMapZoom(1); setMapPan({ x: 0, y: 0 }); setSelectedMapNode(null); }} style={{ ...btn(), padding: "2px 8px", fontSize: "0.52rem" }}>Reset</button>
                </div>
              </div>

              <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                {/* Canvas */}
                <div style={{ flex: 1, overflow: "hidden", position: "relative", background: T.surface, cursor: "grab" }}
                  onMouseDown={e => {
                    if (e.button !== 0) return;
                    mapPanRef.current = { active: true, startX: e.clientX, startY: e.clientY, originPan: { ...mapPan } };
                    (e.currentTarget as HTMLElement).style.cursor = "grabbing";
                  }}
                  onMouseMove={e => {
                    const r = mapPanRef.current;
                    if (!r.active) return;
                    setMapPan({ x: r.originPan.x + e.clientX - r.startX, y: r.originPan.y + e.clientY - r.startY });
                  }}
                  onMouseUp={e => { mapPanRef.current.active = false; (e.currentTarget as HTMLElement).style.cursor = "grab"; }}
                  onMouseLeave={e => { mapPanRef.current.active = false; (e.currentTarget as HTMLElement).style.cursor = "grab"; }}
                  onWheel={e => { e.preventDefault(); setMapZoom(z => Math.max(0.3, Math.min(2.5, z - e.deltaY * 0.001))); }}
                >
                  {/* Dot-grid bg */}
                  <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                    <defs>
                      <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                        <circle cx="1" cy="1" r="1" fill={T.surface3} />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#dots)" />
                  </svg>

                  <svg width={MAP_W} height={MAP_H}
                    style={{ display: "block", transform: `translate(${mapPan.x}px,${mapPan.y}px) scale(${mapZoom})`, transformOrigin: "0 0", transition: "none", userSelect: "none" }}>
                    <defs>
                      {ventures.map(v => (
                        <marker key={v.id} id={`arr-${v.id}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                          <path d="M0,0 L7,3.5 L0,7 Z" fill={v.accent} opacity="0.8" />
                        </marker>
                      ))}
                      <filter id="pulse"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                      <filter id="hubglow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    </defs>

                    {/* Ownership spokes */}
                    {visibleEdges.filter(e => e.type === "owns").map(e => {
                      const from = nodeMap.get(e.fromId), to = nodeMap.get(e.toId);
                      if (!from || !to) return null;
                      const dim = highlighted && !highlighted.has(e.fromId) && !highlighted.has(e.toId);
                      return <line key={e.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={e.color} strokeWidth={1} opacity={dim ? 0.06 : 0.28} />;
                    })}

                    {/* Dependency arcs */}
                    {visibleEdges.filter(e => e.type === "depends").map(e => {
                      const from = nodeMap.get(e.fromId), to = nodeMap.get(e.toId);
                      if (!from || !to) return null;
                      const isActive = !!(highlighted?.has(e.fromId) || highlighted?.has(e.toId));
                      const dim = highlighted && !isActive;
                      const vId = (from as MapServiceNode).ventureId || ventures[0]?.id || "";
                      return (
                        <g key={e.id} opacity={dim ? 0.05 : 0.8}>
                          <path d={curvedPath(from.x, from.y, to.x, to.y, 0.3)} fill="none"
                            stroke={e.color} strokeWidth={isActive ? 2.5 : 1.5}
                            strokeDasharray="6 3" markerEnd={`url(#arr-${vId})`} />
                          {isActive && <path d={curvedPath(from.x, from.y, to.x, to.y, 0.3)} fill="none" stroke={e.color} strokeWidth={5} opacity={0.15} />}
                        </g>
                      );
                    })}

                    {/* Venture hub nodes */}
                    {visibleNodes.filter(n => n.kind === "venture").map(n => {
                      const v = n as MapVentureNode;
                      const isSel = selectedMapNode?.id === v.id;
                      const isHov = hoveredNode?.id === v.id;
                      const rColor = riskColor(v.riskScore);
                      return (
                        <g key={v.id} transform={`translate(${v.x},${v.y})`} style={{ cursor: "pointer" }}
                          onClick={() => setSelectedMapNode(selectedMapNode?.id === v.id ? null : v)}
                          onMouseEnter={() => setHoveredNode(v)} onMouseLeave={() => setHoveredNode(null)}>
                          <circle r={HUB_R + 12} fill="none" stroke={rColor} strokeWidth="1.5" opacity={0.2} strokeDasharray="4 3" />
                          {isSel && <circle r={HUB_R + 8} fill={v.accent} opacity={0.1} filter="url(#hubglow)" />}
                          <polygon points={hexPoints(0, 0, HUB_R)} fill={T.surface2} stroke={v.accent} strokeWidth={isSel ? 2.5 : isHov ? 2 : 1.5} />
                          <circle r={HUB_R - 3} fill="none" stroke={rColor} strokeWidth="3"
                            strokeDasharray={`${(v.riskScore / 100) * 2 * Math.PI * (HUB_R - 3)} 9999`} transform="rotate(-90)" opacity={0.5} />
                          <text textAnchor="middle" dy="-7" fill={v.accent} fontSize="11" fontFamily="monospace" fontWeight="bold">{v.label.split(" ")[0].substring(0,7).toUpperCase()}</text>
                          <text textAnchor="middle" dy="6"  fill={v.accent} fontSize="9"  fontFamily="monospace" opacity="0.8">{v.label.split(" ").slice(1).join(" ").substring(0,8).toUpperCase()}</text>
                          <text textAnchor="middle" dy="19" fill={rColor} fontSize="8" fontFamily="monospace" fontWeight="bold">⚠ {v.riskScore}</text>
                          <circle cx={HUB_R - 4} cy={-(HUB_R - 4)} r={11} fill={T.black} stroke={v.accent} strokeWidth="1" />
                          <text x={HUB_R - 4} y={-(HUB_R - 4)} textAnchor="middle" dy="0.35em" fill={v.accent} fontSize="9" fontFamily="monospace" fontWeight="bold">{v.serviceCount}</text>
                        </g>
                      );
                    })}

                    {/* Service nodes */}
                    {visibleNodes.filter(n => n.kind === "service").map(n => {
                      const s = n as MapServiceNode;
                      const catC  = CAT_COLOR[s.category] || T.textMuted;
                      const statC = s.status === "active" ? T.green : s.status === "error" ? T.red : catC;
                      const rColor = riskColor(s.riskScore);
                      const isHov = hoveredNode?.id === s.id;
                      const isSel = selectedMapNode?.id === s.id;
                      const dim   = highlighted && !highlighted.has(s.id);
                      return (
                        <g key={s.id} transform={`translate(${s.x},${s.y})`} style={{ cursor: "pointer" }} opacity={dim ? 0.18 : 1}
                          onClick={e => { e.stopPropagation(); setSelectedMapNode(selectedMapNode?.id === s.id ? null : s); }}
                          onMouseEnter={() => setHoveredNode(s)} onMouseLeave={() => setHoveredNode(null)}>
                          {s.status === "active" && (
                            <circle r={SVC_R + 5} fill="none" stroke={T.green} strokeWidth="1.5" opacity={0.25}>
                              <animate attributeName="r" values={`${SVC_R+3};${SVC_R+9};${SVC_R+3}`} dur="2.5s" repeatCount="indefinite" />
                              <animate attributeName="opacity" values="0.25;0.04;0.25" dur="2.5s" repeatCount="indefinite" />
                            </circle>
                          )}
                          {s.riskScore > 5 && (
                            <circle r={SVC_R + 4} fill="none" stroke={rColor} strokeWidth="2.5"
                              strokeDasharray={`${(s.riskScore / 100) * 2 * Math.PI * (SVC_R + 4)} 9999`} transform="rotate(-90)" opacity={0.6} />
                          )}
                          <circle r={SVC_R} fill={T.surface2} stroke={isSel ? T.text : isHov ? statC : catC} strokeWidth={isSel ? 2.5 : isHov ? 2 : 1.5} filter={s.status === "active" ? "url(#pulse)" : undefined} />
                          <circle r={SVC_R - 6} fill={catC} opacity={0.1} />
                          <text textAnchor="middle" dy="0.35em" fill={catC} fontSize="8" fontFamily="monospace" fontWeight="bold">{CAT_GLYPH[s.category] || "SVC"}</text>
                          <circle cx={SVC_R - 5} cy={-(SVC_R - 5)} r={4.5} fill={statC} />
                          <text textAnchor="middle" dy={SVC_R + 13} fill={isHov || isSel ? T.text : T.textMuted} fontSize="8.5" fontFamily="monospace">
                            {s.fullName.split(" ")[0].substring(0, 10)}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Right panel */}
                <div style={{ width: 260, flexShrink: 0, borderLeft: `1px solid ${T.border}`, background: T.black, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  {selectedMapNode ? (
                    <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
                      {selectedMapNode.kind === "venture" ? (() => {
                        const v = selectedMapNode as MapVentureNode;
                        const vData = ventures.find(x => x.id === v.id);
                        return (<>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <div style={{ color: v.accent, fontWeight: 700, fontSize: "0.72rem" }}>{v.label}</div>
                            <button onClick={() => setSelectedMapNode(null)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: "0.8rem" }}>✕</button>
                          </div>
                          <div style={{ color: T.textMuted, fontSize: "0.56rem", marginBottom: 10 }}>{v.type}</div>
                          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                            {[
                              [v.riskScore, "RISK", riskColor(v.riskScore)],
                              [v.serviceCount, "SVCS", T.text],
                              [vData?.services.filter(s => s.status === "active").length || 0, "LIVE", T.green],
                            ].map(([val, label, color]) => (
                              <div key={label as string} style={{ flex: 1, background: T.surface2, borderRadius: 4, padding: "6px 4px", textAlign: "center" }}>
                                <div style={{ color: color as string, fontWeight: 700, fontSize: "0.9rem" }}>{val}</div>
                                <div style={{ color: T.textDim, fontSize: "0.46rem" }}>{label}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ height: 4, background: T.surface3, borderRadius: 2, marginBottom: 14 }}>
                            <div style={{ height: "100%", borderRadius: 2, background: riskColor(v.riskScore), width: `${v.riskScore}%` }} />
                          </div>
                          <div style={{ color: T.textMuted, fontSize: "0.52rem", marginBottom: 6, letterSpacing: "0.1em" }}>SERVICES</div>
                          {vData?.services.map(s => (
                            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: `1px solid ${T.border}22`, cursor: "pointer" }}
                              onClick={() => setSelectedMapNode(graph.nodes.find(n => n.id === s.id) || null)}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: s.status === "active" ? T.green : s.status === "error" ? T.red : T.textDim }} />
                              <span style={{ color: T.text, fontSize: "0.6rem", flex: 1 }}>{s.name}</span>
                              <span style={{ color: riskColor(calculateServiceRisk(s)), fontSize: "0.52rem", fontWeight: 700 }}>{calculateServiceRisk(s)}</span>
                            </div>
                          ))}
                        </>);
                      })() : (() => {
                        const s = selectedMapNode as MapServiceNode;
                        const sData = ventures.flatMap(v => v.services).find(x => x.id === s.id);
                        const deps  = graph.edges.filter(e => e.type === "depends" && (e.fromId === s.id || e.toId === s.id));
                        return (<>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                            <div>
                              <div style={{ color: CAT_COLOR[s.category] || T.text, fontWeight: 700, fontSize: "0.7rem" }}>{s.fullName}</div>
                              <div style={{ color: T.textDim, fontSize: "0.52rem", marginTop: 2 }}>{s.ventureName}</div>
                            </div>
                            <button onClick={() => setSelectedMapNode(null)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: "0.8rem" }}>✕</button>
                          </div>
                          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                            <div style={{ flex: 1, background: T.surface2, borderRadius: 4, padding: "5px", textAlign: "center" }}>
                              <div style={{ color: s.status === "active" ? T.green : s.status === "error" ? T.red : T.gold, fontSize: "0.6rem", fontWeight: 700 }}>{s.status.toUpperCase()}</div>
                              <div style={{ color: T.textDim, fontSize: "0.44rem" }}>STATUS</div>
                            </div>
                            <div style={{ flex: 1, background: T.surface2, borderRadius: 4, padding: "5px", textAlign: "center" }}>
                              <div style={{ color: riskColor(s.riskScore), fontSize: "0.6rem", fontWeight: 700 }}>{s.riskScore}/100</div>
                              <div style={{ color: T.textDim, fontSize: "0.44rem" }}>RISK</div>
                            </div>
                          </div>
                          <div style={{ background: T.surface2, borderRadius: 4, padding: "6px 10px", marginBottom: 8 }}>
                            <div style={{ color: CAT_COLOR[s.category] || T.textMuted, fontSize: "0.5rem" }}>CATEGORY</div>
                            <div style={{ color: T.text, fontSize: "0.62rem" }}>{s.category.replace(/_/g, " ")}</div>
                          </div>
                          {sData?.description && <div style={{ color: T.textMuted, fontSize: "0.56rem", lineHeight: 1.6, marginBottom: 8 }}>{sData.description}</div>}
                          {deps.length > 0 && (
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ color: T.textMuted, fontSize: "0.5rem", marginBottom: 5, letterSpacing: "0.1em" }}>DEPENDENCIES</div>
                              {deps.map(e => {
                                const otherId = e.fromId === s.id ? e.toId : e.fromId;
                                const other   = nodeMap.get(otherId);
                                if (!other) return null;
                                return (
                                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: "0.56rem", cursor: "pointer" }}
                                    onClick={() => setSelectedMapNode(other)}>
                                    <span style={{ color: T.gold }}>{e.fromId === s.id ? "→" : "←"}</span>
                                    <span style={{ color: T.text, flex: 1 }}>{other.kind === "service" ? (other as MapServiceNode).fullName : (other as MapVentureNode).label}</span>
                                    {other.kind === "service" && <span style={{ color: T.textDim, fontSize: "0.5rem" }}>{(other as MapServiceNode).ventureName.split(" ")[0]}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {sData && sData.credentials.length > 0 && (
                            <div>
                              <div style={{ color: T.textMuted, fontSize: "0.5rem", marginBottom: 5, letterSpacing: "0.1em" }}>CREDENTIALS ({sData.credentials.length})</div>
                              {sData.credentials.map((c, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: "0.54rem" }}>
                                  <span style={{ color: c.value ? T.green : T.red }}>{c.value ? "✓" : "○"}</span>
                                  <span style={{ color: T.textMuted }}>{c.key}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {sData?.dashboardUrl && (
                            <a href={sData.dashboardUrl} target="_blank" rel="noreferrer"
                              style={{ display: "block", marginTop: 12, textAlign: "center", ...btn(CAT_COLOR[s.category] || T.gold), textDecoration: "none", fontSize: "0.56rem" }}>
                              Dashboard ↗
                            </a>
                          )}
                        </>);
                      })()}
                    </div>
                  ) : (
                    /* Legend when nothing selected */
                    <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
                      <div style={{ color: T.textMuted, fontSize: "0.58rem", marginBottom: 12, letterSpacing: "0.1em" }}>LEGEND</div>
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ color: T.textDim, fontSize: "0.48rem", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 6 }}>Ventures — click to inspect</div>
                        {ventures.map(v => (
                          <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", cursor: "pointer" }}
                            onClick={() => setSelectedMapNode(graph.nodes.find(n => n.id === v.id) || null)}>
                            <svg width="18" height="18" viewBox="-9 -9 18 18"><polygon points={hexPoints(0,0,8)} fill={T.surface2} stroke={v.accent} strokeWidth="1.5" /></svg>
                            <span style={{ color: v.accent, fontSize: "0.6rem", flex: 1 }}>{v.name}</span>
                            <span style={{ color: riskColor(v.riskScore || 0), fontSize: "0.56rem", fontWeight: 700 }}>{v.riskScore || 0}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ color: T.textDim, fontSize: "0.48rem", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 6 }}>Edge Types</div>
                        {[["Ownership (hub → service)", T.textDim + "99", false], ["Dependency (service → service)", T.gold, true]].map(([l, c, dashed]) => (
                          <div key={l as string} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: "0.56rem", color: T.textMuted }}>
                            <svg width="28" height="10"><line x1="0" y1="5" x2="28" y2="5" stroke={c as string} strokeWidth="1.5" strokeDasharray={dashed ? "5 3" : "none"} /></svg>
                            <span>{l}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ color: T.textDim, fontSize: "0.48rem", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 6 }}>Categories</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                          {Object.entries(CAT_GLYPH).map(([cat, glyph]) => (
                            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", cursor: "pointer" }}
                              onClick={() => setMapFilter(mapFilter === cat ? "all" : cat)}>
                              <div style={{ width: 20, height: 20, borderRadius: "50%", background: T.surface2, border: `1.5px solid ${CAT_COLOR[cat] || T.textDim}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <span style={{ color: CAT_COLOR[cat] || T.textDim, fontSize: "6.5px", fontFamily: "monospace", fontWeight: "bold" }}>{glyph}</span>
                              </div>
                              <span style={{ color: mapFilter === cat ? (CAT_COLOR[cat] || T.text) : T.textMuted, fontSize: "0.54rem" }}>{cat.replace(/_/g," ")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ padding: "8px 14px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.5rem", color: T.textDim }}>
                      <span>{visibleNodes.filter(n => n.kind === "service").length}/{graph.nodes.filter(n => n.kind === "service").length} shown</span>
                      <span>drag · scroll to zoom</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── LIVE FEED ─────────────────────────────────────────────── */}
        {view === "feed" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 18px", borderBottom: `1px solid ${T.border}`, background: T.black, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <span style={{ color: T.green, fontWeight: 700, fontSize: "0.68rem" }}>▶ REAL-TIME INFRASTRUCTURE FEED</span>
              <span style={{ color: T.textMuted, fontSize: "0.54rem" }}>Polling interval: 4s</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={startFeed} disabled={feedRunning} style={btn(T.green, feedRunning)}>▶ Start</button>
                <button onClick={stopFeed} disabled={!feedRunning} style={btn(T.red, !feedRunning)}>■ Stop</button>
                <button onClick={() => setFeedLog([])} style={btn()}>Clear</button>
              </div>
            </div>

            {/* Summary row */}
            <div style={{ padding: "8px 18px", borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: "flex", gap: 20 }}>
              {ventures.map(v => {
                const ok  = v.services.filter(s => s.status === "active").length;
                const err = v.services.filter(s => s.status === "error").length;
                return (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.56rem" }}>
                    <span style={{ color: v.accent, fontWeight: 700 }}>{v.name}</span>
                    <span style={{ color: T.green }}>✓ {ok}</span>
                    {err > 0 && <span style={{ color: T.red }}>✗ {err}</span>}
                    <span style={{ color: riskColor(v.riskScore || 0), border: `1px solid ${riskColor(v.riskScore || 0)}44`, borderRadius: 3, padding: "0 4px" }}>{v.riskScore || 0}</span>
                  </div>
                );
              })}
            </div>

            {/* Log stream */}
            <div ref={feedLogRef} style={{ flex: 1, overflowY: "auto", padding: "10px 18px", background: T.black, display: "flex", flexDirection: "column", gap: 3 }}>
              {feedLog.length === 0 && <div style={{ color: T.textDim, fontSize: "0.62rem", marginTop: 20 }}>$ feed idle — press Start to begin live monitoring...</div>}
              {feedLog.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 12, fontSize: "0.6rem", lineHeight: 1.8 }}>
                  <span style={{ color: T.textDim, flexShrink: 0 }}>{new Date(entry.ts).toLocaleTimeString("en-GB", { hour12: false })}</span>
                  <span style={{ color: T.blue, flexShrink: 0, width: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.svc}</span>
                  <span style={{ color: entry.status === "ok" ? T.green : T.red, flexShrink: 0, width: 40 }}>{entry.status === "ok" ? "✓ OK" : "✗ ERR"}</span>
                  {entry.latency > 0 && <span style={{ color: entry.latency > 500 ? T.orange : T.textMuted, flexShrink: 0 }}>{entry.latency}ms</span>}
                  <span style={{ color: T.textMuted }}>{entry.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── AGENT MONITOR ─────────────────────────────────────────── */}
        {view === "monitor" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 18px", borderBottom: `1px solid ${T.border}`, background: T.black, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <span style={{ color: T.blue, fontWeight: 700, fontSize: "0.68rem" }}>◎ AGENT MONITORING</span>
              <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                {([["MEI", T.teal, "Revenue & BI"], ["AYO", T.gold, "Infra Health"]] as const).map(([agent, color, label]) => (
                  <button key={agent} onClick={() => setMonitorAgent(agent as "MEI" | "AYO")}
                    style={{ ...btn(color, monitorAgent === agent), fontSize: "0.6rem" }}>
                    {agent} — {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ fontSize: "0.56rem", color: T.textMuted }}>
                {monitorAgent === "MEI"
                  ? "MEI Zhu-Adeyemi · Chief BI Officer — Revenue strategy & commercial risk assessment"
                  : "Ayo Hastruup · CTO — Infrastructure health & engineering remediation"}
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: "0.54rem", color: T.textMuted }}>Model:</span>
                <input value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                  style={{ ...inputSt, width: 140, padding: "3px 8px" }} placeholder="e.g. llama3" />
                <button onClick={runAgentMonitor} disabled={monitorLoading} style={btn(monitorAgent === "MEI" ? T.teal : T.gold)}>
                  {monitorLoading ? "◌ Running..." : `▶ Run ${monitorAgent}`}
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
              {monitorOutput ? (
                <pre style={{ ...mono, fontSize: "0.65rem", lineHeight: 1.8, whiteSpace: "pre-wrap", color: T.text, background: T.surface2, padding: 16, borderRadius: 6, border: `1px solid ${T.border}`, margin: 0 }}>
                  {monitorOutput}
                </pre>
              ) : (
                <div style={{ padding: 30, textAlign: "center" }}>
                  <div style={{ fontSize: "0.68rem", color: T.textMuted, marginBottom: 8 }}>
                    {monitorAgent === "MEI" ? "◎ MEI analyses service data for revenue risk and commercial opportunities" : "◎ AYO analyses service health and prescribes infrastructure remediation"}
                  </div>
                  <div style={{ fontSize: "0.58rem", color: T.textDim }}>
                    Select a venture in the sidebar then click Run {monitorAgent}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── AUTO DISCOVERY ────────────────────────────────────────── */}
        {view === "discovery" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 18px", borderBottom: `1px solid ${T.border}`, background: T.black, flexShrink: 0 }}>
              <div style={{ color: T.orange, fontWeight: 700, fontSize: "0.68rem" }}>⊕ AUTO SERVICE DISCOVERY</div>
              <div style={{ color: T.textMuted, fontSize: "0.54rem", marginTop: 3 }}>Paste a .env file or docker-compose.yml — services will be extracted and mapped automatically</div>
            </div>

            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
              {/* Input pane */}
              <div style={{ width: "50%", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 8, flexShrink: 0 }}>
                  {(["env", "docker"] as const).map(mode => (
                    <button key={mode} onClick={() => setDiscoveryMode(mode)} style={btn(T.orange, discoveryMode === mode)}>
                      {mode === "env" ? ".env file" : "docker-compose.yml"}
                    </button>
                  ))}
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: "0.54rem", color: T.textMuted }}>Import into:</span>
                    <select value={discoveryTargetId} onChange={e => setDiscoveryTargetId(e.target.value)} style={{ ...inputSt, width: 130, padding: "3px 6px" }}>
                      {ventures.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <button onClick={runDiscovery} style={btn(T.orange)}>⊕ Discover</button>
                  </div>
                </div>
                <textarea
                  value={discoveryText}
                  onChange={e => setDiscoveryText(e.target.value)}
                  placeholder={discoveryMode === "env"
                    ? "# Paste your .env file here\nSUPABASE_URL=https://...\nSTRIPE_SECRET_KEY=sk_...\nOPENAI_API_KEY=sk-..."
                    : "# Paste your docker-compose.yml here\nservices:\n  postgres:\n  redis:\n  nginx:"}
                  style={{ ...inputSt, flex: 1, borderRadius: 0, border: "none", resize: "none", padding: 14, fontSize: "0.62rem", lineHeight: 1.8 }}
                />
              </div>

              {/* Results pane */}
              <div style={{ width: "50%", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: T.textMuted, fontSize: "0.58rem" }}>{discoveredServices.length} service{discoveredServices.length !== 1 ? "s" : ""} discovered</span>
                  {discoveredServices.length > 0 && (
                    <button onClick={() => { discoveredServices.forEach(d => importDiscovered(d)); }} style={btn(T.orange)}>
                      Import All
                    </button>
                  )}
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
                  {discoveredServices.length === 0 && (
                    <div style={{ padding: 30, textAlign: "center", color: T.textDim, fontSize: "0.62rem" }}>
                      Paste content on the left and click Discover
                    </div>
                  )}
                  {discoveredServices.map((d, i) => (
                    <div key={i} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: "10px 12px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ color: T.orange, fontWeight: 700, fontSize: "0.68rem" }}>{d.name}</div>
                        <div style={{ color: T.textMuted, fontSize: "0.54rem", marginTop: 2 }}>{d.hint} · {d.category}</div>
                        {d.keys.length > 0 && (
                          <div style={{ color: T.teal, fontSize: "0.52rem", marginTop: 4 }}>
                            Keys: {d.keys.join(", ")}
                          </div>
                        )}
                      </div>
                      <button onClick={() => importDiscovered(d)} style={btn(T.orange)}>+ Import</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── REPORTS ───────────────────────────────────────────────── */}
        {view === "reports" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 18px", borderBottom: `1px solid ${T.border}`, background: T.black, flexShrink: 0 }}>
              <div style={{ color: T.gold, fontWeight: 700, fontSize: "0.68rem" }}>◆ ARCHON INFRASTRUCTURE REPORTS</div>
              <div style={{ color: T.textMuted, fontSize: "0.54rem", marginTop: 3 }}>ARCHON generates venture infrastructure audits · Reports queue for Archon backend (integration pending)</div>
            </div>

            <div style={{ padding: "10px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontSize: "0.56rem", color: T.textMuted }}>Venture:</span>
              <select value={reportVentureId} onChange={e => setReportVentureId(e.target.value)} style={{ ...inputSt, width: 180, padding: "4px 8px" }}>
                {ventures.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <span style={{ fontSize: "0.56rem", color: T.textMuted }}>Model:</span>
              <input value={selectedModel} onChange={e => setSelectedModel(e.target.value)} style={{ ...inputSt, width: 130, padding: "4px 8px" }} placeholder="llama3" />
              <button onClick={generateReport} disabled={reportLoading} style={{ ...btn(T.gold), marginLeft: "auto" }}>
                {reportLoading ? "◌ ARCHON Generating..." : "◆ Generate Audit Report"}
              </button>
            </div>

            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
              {/* Report output */}
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", borderRight: `1px solid ${T.border}` }}>
                {reportOutput ? (
                  <pre style={{ ...mono, fontSize: "0.63rem", lineHeight: 1.9, whiteSpace: "pre-wrap", color: T.text, margin: 0 }}>
                    {reportOutput}
                  </pre>
                ) : (
                  <div style={{ padding: 30, textAlign: "center" }}>
                    <div style={{ fontSize: "0.7rem", color: T.textMuted, marginBottom: 8 }}>◆ ARCHON Audit Engine</div>
                    <div style={{ fontSize: "0.58rem", color: T.textDim, lineHeight: 1.8 }}>
                      Select a venture and click Generate to produce a full infrastructure audit report.<br />
                      Reports are queued locally and will sync to Archon backend once integration is live.
                    </div>
                  </div>
                )}
              </div>

              {/* Report queue */}
              <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, color: T.textMuted, fontSize: "0.56rem" }}>
                  REPORT QUEUE ({reportQueue.length}) · Archon Bridge: <span style={{ color: T.orange }}>PENDING</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {reportQueue.length === 0 && <div style={{ padding: 20, color: T.textDim, fontSize: "0.58rem", textAlign: "center" }}>No reports generated yet.</div>}
                  {reportQueue.map(r => (
                    <div key={r.id} style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}22` }}>
                      <div style={{ color: T.gold, fontSize: "0.58rem", fontWeight: 700 }}>{r.id}</div>
                      <div style={{ color: T.textMuted, fontSize: "0.52rem", marginTop: 2 }}>{r.ventureName}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: "0.5rem" }}>
                        <span style={{ color: T.textDim }}>{new Date(r.timestamp).toLocaleDateString("en-GB")}</span>
                        <span style={{ color: r.status === "sent" ? T.green : r.status === "failed" ? T.red : T.orange,
                          border: `1px solid currentColor`, borderRadius: 3, padding: "0 5px" }}>
                          {r.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "8px 12px", borderTop: `1px solid ${T.border}`, fontSize: "0.52rem", color: T.textDim, lineHeight: 1.6 }}>
                  ⚠ Archon-xDragon bridge not yet live.<br />
                  Reports are stored locally in queue.<br />
                  Integration: archon-backend-3q4b.onrender.com
                </div>
              </div>
            </div>
          </div>
        )}

      </div>{/* end main area */}
    </div>
  );
}