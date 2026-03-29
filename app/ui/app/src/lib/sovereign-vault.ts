/**
 * ═══════════════════════════════════════════════════════════════════
 *  SOVEREIGN VAULT — xDragon Asset & Document Database
 *
 *  Categories:
 *    codebase     → source files, snippets, architecture docs
 *    design       → Penpot exports, wireframes, mockups
 *    brand        → logos, colour tokens, typography guides
 *    marketing    → campaigns, copy, ads, social posts
 *    document     → contracts, memos, reports, presentations
 *    legal        → legal repository (mirrors LegalDesk)
 *    research     → market intel, briefs, analyses
 *    training     → agent training examples, persona configs
 *    report       → generated infrastructure/business reports
 *    other        → uncategorised
 *
 *  Storage: localStorage (primary) + Supabase (if configured)
 *  Search:  substring + tag match (Supabase pgvector when live)
 *  Max local entries: 2000. Auto-evicts oldest beyond limit.
 *
 *  PLACE AT: xdragon/app/ui/app/src/lib/sovereign-vault.ts
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Vault types (defined here as source of truth) ────────────────
export type VaultCategory =
  | 'codebase' | 'design' | 'brand' | 'marketing' | 'document'
  | 'legal' | 'research' | 'training' | 'report' | 'other';

export interface VaultEntry {
  id:          string;
  title:       string;
  category:    VaultCategory;
  content:     string;
  agentId?:    string;
  ventureId?:  string;
  tags:        string[];
  createdAt:   number;
  updatedAt:   number;
  metadata?:   Record<string, unknown>;
}

// ── Storage keys ──────────────────────────────────────────────────
const VAULT_KEY      = 'archon_sovereign_vault_v1';
const VAULT_META_KEY = 'archon_vault_meta_v1';
const MAX_LOCAL_ENTRIES = 2000;

// ── Supabase config (loaded from Settings) ────────────────────────
interface SupabaseConfig { url: string; serviceKey: string; }

function getSupabaseConfig(): SupabaseConfig | null {
  try {
    const raw = localStorage.getItem('archon_vault_supabase');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── Vault metadata ────────────────────────────────────────────────
interface VaultMeta {
  totalEntries: number;
  lastIndexed:  number | null;
  categories:   Record<VaultCategory, number>;
}

function defaultMeta(): VaultMeta {
  return {
    totalEntries: 0, lastIndexed: null,
    categories: {
      codebase:0, design:0, brand:0, marketing:0,
      document:0, legal:0, research:0, training:0, report:0, other:0,
    },
  };
}

// ── Local storage helpers ─────────────────────────────────────────
function loadLocal(): VaultEntry[] {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocal(entries: VaultEntry[]): void {
  // Evict oldest entries if over limit
  const pruned = entries.length > MAX_LOCAL_ENTRIES
    ? [...entries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_LOCAL_ENTRIES)
    : entries;
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(pruned));
    const meta = computeMeta(pruned);
    localStorage.setItem(VAULT_META_KEY, JSON.stringify(meta));
  } catch (e) {
    console.error('[Vault] localStorage write failed:', e);
  }
}

function computeMeta(entries: VaultEntry[]): VaultMeta {
  const meta = defaultMeta();
  meta.totalEntries = entries.length;
  for (const e of entries) {
    meta.categories[e.category] = (meta.categories[e.category] || 0) + 1;
  }
  return meta;
}

function uid(): string {
  return `vault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Supabase REST helpers ─────────────────────────────────────────

async function supabaseInsert(cfg: SupabaseConfig, entry: VaultEntry): Promise<boolean> {
  try {
    const res = await fetch(`${cfg.url}/rest/v1/vault_entries`, {
      method: 'POST',
      headers: {
        'apikey': cfg.serviceKey,
        'Authorization': `Bearer ${cfg.serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        id: entry.id, title: entry.title, category: entry.category,
        content: entry.content, agent_id: entry.agentId,
        venture_id: entry.ventureId, tags: entry.tags,
        metadata: entry.metadata || {},
        created_at: new Date(entry.createdAt).toISOString(),
        updated_at: new Date(entry.updatedAt).toISOString(),
      }),
    });
    return res.ok;
  } catch { return false; }
}

async function supabaseSearch(cfg: SupabaseConfig, query: string, category?: VaultCategory): Promise<VaultEntry[]> {
  try {
    let url = `${cfg.url}/rest/v1/vault_entries?title=ilike.*${encodeURIComponent(query)}*&limit=20&order=updated_at.desc`;
    if (category) url += `&category=eq.${category}`;
    const res = await fetch(url, {
      headers: { 'apikey': cfg.serviceKey, 'Authorization': `Bearer ${cfg.serviceKey}` },
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id, title: r.title, category: r.category, content: r.content,
      agentId: r.agent_id, ventureId: r.venture_id, tags: r.tags || [],
      createdAt: new Date(r.created_at as string).getTime(),
      updatedAt: new Date(r.updated_at as string).getTime(),
      metadata: r.metadata,
    } as VaultEntry));
  } catch { return []; }
}

async function supabaseGet(cfg: SupabaseConfig, id: string): Promise<VaultEntry | null> {
  try {
    const res = await fetch(`${cfg.url}/rest/v1/vault_entries?id=eq.${id}&limit=1`, {
      headers: { 'apikey': cfg.serviceKey, 'Authorization': `Bearer ${cfg.serviceKey}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id, title: r.title, category: r.category, content: r.content,
      agentId: r.agent_id, ventureId: r.venture_id, tags: r.tags || [],
      createdAt: new Date(r.created_at).getTime(), updatedAt: new Date(r.updated_at).getTime(),
      metadata: r.metadata,
    };
  } catch { return null; }
}

// ── Sovereign Vault API ────────────────────────────────────────────

export const SovereignVault = {

  /** Store a new entry. Returns the assigned ID. */
  async store(entry: Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
    const id = entry.id || uid();
    const now = Date.now();
    const full: VaultEntry = { ...entry, id, createdAt: now, updatedAt: now, tags: entry.tags || [] };

    // Write to local storage
    const local = loadLocal();
    const existing = local.findIndex(e => e.id === id);
    if (existing >= 0) {
      local[existing] = { ...full, createdAt: local[existing].createdAt };
    } else {
      local.unshift(full);
    }
    saveLocal(local);

    // Async write to Supabase if configured
    const cfg = getSupabaseConfig();
    if (cfg) supabaseInsert(cfg, full).catch(() => {});

    return id;
  },

  /** Retrieve a single entry by ID. */
  async retrieve(id: string): Promise<VaultEntry | null> {
    const local = loadLocal().find(e => e.id === id);
    if (local) return local;
    const cfg = getSupabaseConfig();
    if (cfg) return supabaseGet(cfg, id);
    return null;
  },

  /** Update an existing entry. */
  async update(id: string, updates: Partial<Omit<VaultEntry, 'id' | 'createdAt'>>): Promise<boolean> {
    const local = loadLocal();
    const idx = local.findIndex(e => e.id === id);
    if (idx < 0) return false;
    local[idx] = { ...local[idx], ...updates, updatedAt: Date.now() };
    saveLocal(local);
    return true;
  },

  /** Delete an entry. */
  async delete(id: string): Promise<boolean> {
    const local = loadLocal();
    const next = local.filter(e => e.id !== id);
    if (next.length === local.length) return false;
    saveLocal(next);
    return true;
  },

  /**
   * Search by text query + optional category filter.
   * Checks title, content substring, and tags.
   */
  async search(query: string, category?: VaultCategory, limit = 20): Promise<VaultEntry[]> {
    const q = query.toLowerCase().trim();

    // Try Supabase first for non-trivial queries
    if (q.length > 2) {
      const cfg = getSupabaseConfig();
      if (cfg) {
        const remote = await supabaseSearch(cfg, query, category);
        if (remote.length > 0) return remote.slice(0, limit);
      }
    }

    // Fall back to local search
    const local = loadLocal();
    return local
      .filter(e => {
        if (category && e.category !== category) return false;
        if (!q) return true;
        return (
          e.title.toLowerCase().includes(q) ||
          e.content.toLowerCase().includes(q) ||
          e.tags.some(t => t.toLowerCase().includes(q)) ||
          (e.agentId || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  },

  /** List all entries in a category, newest first. */
  async list(category?: VaultCategory, limit = 50): Promise<VaultEntry[]> {
    const local = loadLocal();
    return local
      .filter(e => !category || e.category === category)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  },

  /** Get vault metadata (counts by category, last indexed, etc.) */
  getMeta(): VaultMeta {
    try {
      const raw = localStorage.getItem(VAULT_META_KEY);
      return raw ? JSON.parse(raw) : computeMeta(loadLocal());
    } catch { return defaultMeta(); }
  },

  /** Index all entries (triggers pgvector embedding in Supabase when live). */
  async index(): Promise<void> {
    const cfg = getSupabaseConfig();
    if (!cfg) { console.info('[Vault] No Supabase config — local index only'); return; }

    // Sync all local entries to Supabase
    const local = loadLocal();
    let synced = 0;
    for (const entry of local) {
      const ok = await supabaseInsert(cfg, entry);
      if (ok) synced++;
    }

    const meta = computeMeta(local);
    meta.lastIndexed = Date.now();
    localStorage.setItem(VAULT_META_KEY, JSON.stringify(meta));
    console.info(`[Vault] Indexed ${synced}/${local.length} entries to Supabase`);
  },

  /** Export all entries as JSON. */
  export(): string {
    return JSON.stringify({ version: 1, exportedAt: Date.now(), entries: loadLocal() }, null, 2);
  },

  /** Import entries from a JSON export. */
  import(json: string): { imported: number; skipped: number } {
    try {
      const data = JSON.parse(json);
      const entries: VaultEntry[] = data.entries || [];
      const local = loadLocal();
      const existingIds = new Set(local.map(e => e.id));
      let imported = 0, skipped = 0;
      for (const e of entries) {
        if (existingIds.has(e.id)) { skipped++; continue; }
        local.unshift(e); imported++;
      }
      saveLocal(local);
      return { imported, skipped };
    } catch { return { imported: 0, skipped: 0 }; }
  },

  /** Clear all local entries (does NOT delete from Supabase). */
  clearLocal(): void {
    localStorage.removeItem(VAULT_KEY);
    localStorage.removeItem(VAULT_META_KEY);
  },

  /** Save Supabase configuration. */
  setSupabaseConfig(url: string, serviceKey: string): void {
    localStorage.setItem('archon_vault_supabase', JSON.stringify({ url, serviceKey }));
  },
};