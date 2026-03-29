/**
 * ═══════════════════════════════════════════════════════════════════
 *  ARCHON TASK HANDLERS — xDragon Capability Registry
 *
 *  This is the central registry where every agent capability is
 *  wired to a concrete action inside xDragon.
 *
 *  When Archon sends a task, the tunnel dispatches it here.
 *  Each handler has full access to React state via the store.
 *
 *  PLACE AT: xdragon/app/ui/app/src/lib/archon-handlers.ts
 *
 *  CALL IN: App.tsx or main.tsx — once on startup:
 *    import { registerAllHandlers } from '@/lib/archon-handlers';
 *    registerAllHandlers(tunnel, store);
 * ═══════════════════════════════════════════════════════════════════
 */

import { ArchonTunnel } from './archon-tunnel';
import type { VaultEntry, VaultCategory } from './sovereign-vault';

// ── Inline types (so archon-handlers doesn't break if archon-tunnel version differs) ──
interface ArchonTask {
  taskId:    string;
  agentId:   string;
  action:    string;
  payload:   Record<string, unknown>;
  context?:  Record<string, unknown>;
  ts:        number;
  priority?: 'critical' | 'high' | 'normal' | 'low';
}

interface ArchonTaskResult {
  taskId:     string;
  agentId:    string;
  action:     string;
  status:     'ok' | 'error' | 'partial';
  output?:    unknown;
  error?:     string;
  durationMs: number;
  ts:         number;
}

// ── xDragon workspace store interface ─────────────────────────────
// This object is passed in from App.tsx — it gives handlers direct
// write access to React state across all modules.
export interface XDragonStore {
  // Code Studio
  openTab:     (file: { id: string; name: string; content: string; lang: string }) => void;
  setPrompt:   (text: string) => void;
  setOutput:   (text: string) => void;
  executePrompt: (prompt: string, agentId: string) => Promise<string>;
  switchModule:  (moduleId: string) => void;

  // GitFort
  gitfortCommit: (message: string, branch: string) => Promise<void>;
  gitfortPush:   (branch: string) => Promise<void>;

  // Vault
  vaultStore:    (entry: VaultEntry) => Promise<string>;
  vaultRetrieve: (id: string) => Promise<VaultEntry | null>;
  vaultSearch:   (query: string, category?: VaultCategory) => Promise<VaultEntry[]>;
  vaultIndex:    () => Promise<void>;

  // Services
  pingAllServices: () => Promise<void>;
  generateReport:  (ventureId: string) => Promise<string>;

  // Training
  saveTrainingExample: (agentId: string, input: string, output: string) => Promise<void>;
  syncTrainingToArchon: (agentId: string) => Promise<void>;

  // Legal
  createLegalIssue: (title: string, jurisdiction: string, urgency: string) => void;

  // Penpot
  penpotCreatePage:  (projectName: string, pageName: string) => Promise<string>;
  penpotUpdateAsset: (fileId: string, data: unknown) => Promise<void>;

  // Navigation
  navigate: (path: string) => void;

  // Current state (read)
  getActiveModule:   () => string;
  getOpenTabs:       () => { id: string; name: string; content: string; lang: string }[];
  getActiveTabContent: () => string;
}

// ── Handler factory ────────────────────────────────────────────────

function makeResult(task: ArchonTask, status: ArchonTaskResult['status'], output?: unknown, error?: string): ArchonTaskResult {
  return { taskId: task.taskId, agentId: task.agentId, action: task.action, status, output, error, durationMs: 0, ts: Date.now() };
}

// ── Registration ───────────────────────────────────────────────────

export function registerAllHandlers(tunnel: ArchonTunnel, store: XDragonStore): void {

  // ── CODE STUDIO ──────────────────────────────────────────────────

  /**
   * AYO generates code into an IDE tab.
   * Payload: { filename, lang, prompt, agentId? }
   */
  tunnel.onTask('code.generate', async (task, send) => {
    const { filename, lang, prompt, agentId } = task.payload as {
      filename: string; lang: string; prompt: string; agentId?: string;
    };
    store.switchModule('code_studio');
    send({ type: 'stream', taskId: task.taskId, chunk: `Generating ${filename}...`, done: false });

    const output = await store.executePrompt(prompt, agentId || task.agentId);

    // Extract code block if present
    const codeMatch = output.match(/```[\w]*\n([\s\S]*?)```/);
    const content = codeMatch ? codeMatch[1] : output;

    // 1. Update UI
    store.openTab({ id: `arch-${Date.now()}`, name: filename, content, lang: lang || 'typescript' });

    // 2. Persist to physical disk via Archon Backend (Port 3005)
    try {
      const gatewayKey = localStorage.getItem('archon_gateway_key') || '';
      await fetch('http://localhost:3005/api/execute/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Archon-Gateway-Key': gatewayKey
        },
        body: JSON.stringify({ file_path: filename, content })
      });
      send({ type: 'stream', taskId: task.taskId, chunk: `\n✓ Saved to disk: ${filename}`, done: false });
    } catch (err) {
      send({ type: 'stream', taskId: task.taskId, chunk: `\n⚠ Sync to disk failed: ${String(err)}`, done: false });
    }

    tunnel.sendResult({ ...makeResult(task, 'ok', { filename, linesGenerated: content.split('\n').length }), durationMs: 0 });
  });

  /**
   * AYO reviews the currently open file.
   * Payload: { focusArea? }
   */
  tunnel.onTask('code.review', async (task, send) => {
    const content = store.getActiveTabContent();
    if (!content) {
      tunnel.sendResult(makeResult(task, 'error', undefined, 'No active file to review'));
      return;
    }
    send({ type: 'stream', taskId: task.taskId, chunk: 'Reviewing code...', done: false });
    const prompt = `Code review — focus: ${(task.payload as { focusArea?: string }).focusArea || 'general quality, security, performance'}.\n\nCode:\n\`\`\`\n${content}\n\`\`\``;
    const review = await store.executePrompt(prompt, task.agentId);
    store.setOutput(review);
    tunnel.sendResult(makeResult(task, 'ok', { review: review.substring(0, 200) }));
  });

  /**
   * AYO deploys via Launcher API.
   * Payload: { service, command, env? }
   */
  tunnel.onTask('code.deploy', async (task, _send) => {
    const { service, command } = task.payload as { service: string; command: string };
    try {
      const gatewayKey = localStorage.getItem('archon_gateway_key') || '';
      // Corrected to Archon Backend (Port 3005) executor endpoint
      const res = await fetch('http://localhost:3005/api/execute/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Archon-Gateway-Key': gatewayKey
        },
        body: JSON.stringify({ command: command || 'npm run deploy', cwd: service }),
      });
      if (!res.ok) throw new Error(`Executor returned ${res.status}`);
      const data = await res.json();
      tunnel.sendResult(makeResult(task, 'ok', data));
    } catch (err) {
      tunnel.sendResult(makeResult(task, 'error', undefined, String(err)));
    }
  });

  /**
   * AYO commits staged files in GitFort.
   * Payload: { message, branch }
   */
  tunnel.onTask('code.gitfort.commit', async (task, _send) => {
    const { message, branch } = task.payload as { message: string; branch: string };
    await store.gitfortCommit(message, branch);
    tunnel.sendResult(makeResult(task, 'ok', { committed: true }));
  });

  /**
   * AYO pushes GitFort branch to GitHub.
   * Payload: { branch }
   */
  tunnel.onTask('code.gitfort.push', async (task, _send) => {
    const { branch } = task.payload as { branch: string };
    await store.gitfortPush(branch);
    tunnel.sendResult(makeResult(task, 'ok', { pushed: true }));
  });

  // ── VAULT / DB ────────────────────────────────────────────────────

  /**
   * MODEBOLA stores a document/asset in the Sovereign Vault.
   * Payload: { title, category, content, tags, ventureId? }
   */
  tunnel.onTask('vault.store', async (task, _send) => {
    const { title, category, content, tags, ventureId } = task.payload as {
      title: string; category: VaultCategory; content: string; tags: string[]; ventureId?: string;
    };
    const entry: VaultEntry = {
      id: '', title, category, content,
      agentId: task.agentId, ventureId, tags,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    const id = await store.vaultStore(entry);
    tunnel.sendResult(makeResult(task, 'ok', { id }));
  });

  /**
   * Any agent retrieves from the Sovereign Vault.
   * Payload: { id } OR { query, category }
   */
  tunnel.onTask('vault.retrieve', async (task, _send) => {
    const { id, query, category } = task.payload as { id?: string; query?: string; category?: VaultCategory };
    if (id) {
      const entry = await store.vaultRetrieve(id);
      tunnel.sendResult(makeResult(task, entry ? 'ok' : 'error', entry));
    } else if (query) {
      const results = await store.vaultSearch(query, category);
      tunnel.sendResult(makeResult(task, 'ok', { results, count: results.length }));
    } else {
      tunnel.sendResult(makeResult(task, 'error', undefined, 'Provide id or query'));
    }
  });

  /**
   * MEI indexes all vault entries for semantic search.
   */
  tunnel.onTask('vault.index', async (task, _send) => {
    await store.vaultIndex();
    tunnel.sendResult(makeResult(task, 'ok', { indexed: true }));
  });

  /**
   * Any agent searches the vault.
   * Payload: { query, category?, limit? }
   */
  tunnel.onTask('vault.search', async (task, _send) => {
    const { query, category } = task.payload as { query: string; category?: VaultCategory };
    const results = await store.vaultSearch(query, category);
    tunnel.sendResult(makeResult(task, 'ok', { results }));
  });

  // ── SERVICES / INFRA ──────────────────────────────────────────────

  /**
   * AYO runs a health check across all configured services.
   */
  tunnel.onTask('services.ping_all', async (task, _send) => {
    store.switchModule('services');
    await store.pingAllServices();
    tunnel.sendResult(makeResult(task, 'ok', { checked: true }));
  });

  /**
   * ARCHON generates a full infrastructure audit report.
   * Payload: { ventureId }
   */
  tunnel.onTask('services.report', async (task, send) => {
    const { ventureId } = task.payload as { ventureId: string };
    send({ type: 'stream', taskId: task.taskId, chunk: 'ARCHON generating infra audit...', done: false });
    store.switchModule('services');
    const report = await store.generateReport(ventureId);
    tunnel.sendResult(makeResult(task, 'ok', { report: report.substring(0, 300) + '...' }));
  });

  // ── TRAINING ──────────────────────────────────────────────────────

  /**
   * Saves a new training example for an agent.
   * Payload: { agentId, input, output }
   * NOTE: Automatically syncs to Archon after saving.
   */
  tunnel.onTask('training.save_example', async (task, _send) => {
    const { agentId, input, output } = task.payload as {
      agentId: string; input: string; output: string;
    };
    await store.saveTrainingExample(agentId, input, output);
    // Auto-sync trained data back to Archon
    await store.syncTrainingToArchon(agentId);
    tunnel.sendResult(makeResult(task, 'ok', { saved: true, agentId }));
  });

  /**
   * Explicitly syncs an agent's training data to Archon.
   * Payload: { agentId }
   */
  tunnel.onTask('training.sync_to_archon', async (task, _send) => {
    const { agentId } = task.payload as { agentId: string };
    await store.syncTrainingToArchon(agentId);
    tunnel.sendResult(makeResult(task, 'ok', { synced: true, agentId }));
  });

  // ── RESEARCH ─────────────────────────────────────────────────────

  /**
   * KOFI / MEI injects a research brief into the active prompt.
   * Payload: { topic, context? }
   */
  tunnel.onTask('research.brief', async (task, _send) => {
    const { topic, context } = task.payload as { topic: string; context?: string };
    const prompt = `Research brief: ${topic}${context ? `\n\nContext: ${context}` : ''}`;
    store.setPrompt(prompt);
    store.switchModule('research_lab');
    tunnel.sendResult(makeResult(task, 'ok', { injected: true }));
  });

  // ── LEGAL ─────────────────────────────────────────────────────────

  /**
   * TUNDE opens a legal issue in Legal Desk.
   * Payload: { title, jurisdiction, urgency }
   */
  tunnel.onTask('legal.create_issue', async (task, _send) => {
    const { title, jurisdiction, urgency } = task.payload as {
      title: string; jurisdiction: string; urgency: string;
    };
    store.switchModule('legal_desk');
    store.createLegalIssue(title, jurisdiction, urgency);
    tunnel.sendResult(makeResult(task, 'ok', { created: true }));
  });

  // ── PENPOT / DESIGN ───────────────────────────────────────────────

  /**
   * ARIA creates a new page in Penpot.
   * Payload: { projectName, pageName }
   */
  tunnel.onTask('design.penpot.open', async (task, _send) => {
    const { projectName, pageName } = task.payload as { projectName: string; pageName: string };
    store.switchModule('design_studio');
    const fileId = await store.penpotCreatePage(projectName, pageName);
    tunnel.sendResult(makeResult(task, 'ok', { fileId }));
  });

  // ── NAVIGATION ────────────────────────────────────────────────────

  /**
   * Archon navigates xDragon to a specific module.
   * Payload: { module }
   */
  tunnel.onTask('studio.navigate', async (task, _send) => {
    const { module } = task.payload as { module: string };
    store.switchModule(module);
    tunnel.sendResult(makeResult(task, 'ok', { navigated: module }));
  });

  // ── CATCH-ALL: AI PROMPT FALLBACK ─────────────────────────────────
  tunnel.onAnyTask(async (task, _send) => {
    // Unknown action — try to handle as a generic AI prompt
    const prompt = `Agent task: ${task.action}\nPayload: ${JSON.stringify(task.payload, null, 2)}`;
    const output = await store.executePrompt(prompt, task.agentId);
    store.setOutput(output);
    tunnel.sendResult(makeResult(task, 'ok', { output: output.substring(0, 300) }));
  });

  console.info('[ArchonHandlers] All handlers registered:', [...tunnel['handlers'].keys()]);
}