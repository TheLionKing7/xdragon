/**
 * ═══════════════════════════════════════════════════════════════════
 *  xDragon — Centralised Config
 *  PLACE AT: xdragon/app/ui/app/src/lib/config.ts
 *
 *  All service URLs in one place.
 *  Import { OLLAMA_URL } instead of hardcoding "localhost:11434" anywhere.
 *
 *  To override at runtime, set daemonConfig in localStorage via Settings.
 *  The getOllamaUrl() helper reads that override automatically.
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Static constants ──────────────────────────────────────────────

/** xDragon Ollama fork — local inference endpoint */
export const OLLAMA_URL = "http://localhost:11434";

/** Ollama.com — used for avatar URLs, account links etc. (required by api.ts) */
export const OLLAMA_DOT_COM = "https://ollama.com";

/** Launcher API — service start/stop/deploy */
export const LAUNCHER_URL = "http://localhost:3002";

/** Camoufox browse proxy — stealth browser bridge */
export const BROWSE_PROXY_URL = "http://localhost:3001";

/** DeerFlow deep research server */
export const DEERFLOW_URL = "http://localhost:8000";

/** Archon backend — cloud agent orchestrator */
export const ARCHON_BACKEND_URL = "https://archon-nexus-api.fly.dev";

/** Penpot default — self-hosted design tool */
export const PENPOT_DEFAULT_URL = "http://localhost:3449";

// In dev: Vite proxy forwards /api/* → Ollama :11434
// In prod (compiled binary): same origin
export const API_BASE = "http://localhost:11434";

// ── Runtime overrides (from Settings → daemonConfig localStorage) ─

function getDaemonConfig(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem("archon_daemon_config") || "{}");
  } catch { return {}; }
}

/** Returns the active Ollama URL, respecting Settings override */
export function getOllamaUrl(): string {
  return getDaemonConfig().ollamaUrl || OLLAMA_URL;
}

/** Returns the active Browse Proxy URL, respecting Settings override */
export function getBrowseProxyUrl(): string {
  return getDaemonConfig().browseProxyUrl || BROWSE_PROXY_URL;
}

/** Returns the active DeerFlow URL, respecting Settings override */
export function getDeerflowUrl(): string {
  return getDaemonConfig().deerflowUrl || DEERFLOW_URL;
}

// ── Archon Ecosystem Service URLs ────────────────────────────────

/** xOrbit market simulation engine */
export const XORBIT_URL = "http://localhost:5001";

/** Hyperspace-X node REST management API */
export const HYPERSPACE_URL = "http://localhost:9099";

/** Identity Shield — agent persona + Cardano attestation */
export const IDENTITY_SHIELD_URL = "http://localhost:7777";

/** FiveClaw — autonomous earning agent */
export const FIVECLAW_URL = process.env.FIVECLAW_URL || "http://localhost:4000";

export function getXOrbitUrl(): string {
  return getDaemonConfig().xOrbitUrl || XORBIT_URL;
}

export function getHyperspaceUrl(): string {
  return getDaemonConfig().hyperspaceUrl || HYPERSPACE_URL;
}

export function getIdentityShieldUrl(): string {
  return getDaemonConfig().identityShieldUrl || IDENTITY_SHIELD_URL;
}