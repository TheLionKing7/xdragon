/**
 * ═══════════════════════════════════════════════════════════════════
 *  ARCHON NEXUS — GitFort (Sovereign Version Control)
 *  AYO Hastruup · CTO — Code Custody & Deployment Integrity
 *
 *  Three-tier repository:
 *    mastercode   → Stable, finalized backup (write-protected)
 *    production   → Live deployment branches
 *    experimental → R&D and active development
 *
 *  GitHub sync: PAT-based push/pull/mirror protocol
 *  PLACE AT: xdragon/app/ui/app/src/components/GitFort.tsx
 * ═══════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// ── Design tokens ─────────────────────────────────────────────────
const T = {
  gold: '#c9a84c', goldDim: '#6b5820', goldBorder: '#3a3020',
  black: '#080808', surface: '#0f0f0f', surface2: '#161616', surface3: '#202020',
  border: '#282420', text: '#f0ead8', textMuted: '#7a7060', textDim: '#3a3530',
  green: '#4a9a6a', red: '#c05040', teal: '#5ab0c8', blue: '#4a8aba',
  purple: '#9a7ab0', orange: '#d4805a', sage: '#8aaa60',
};
const mono: React.CSSProperties = { fontFamily: '"Menlo","Monaco","Consolas","Courier New",monospace' };

// ── Types ──────────────────────────────────────────────────────────
type BranchTier = 'mastercode' | 'production' | 'experimental';
type FileStatus = 'unmodified' | 'modified' | 'added' | 'deleted' | 'staged';
type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

interface GitFile {
  id: string;
  path: string;
  name: string;
  lang: string;
  content: string;
  status: FileStatus;
  size: number;
  lastModified: number;
}

interface GitCommit {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
  branch: BranchTier;
  files: string[];
  verified: boolean;
}

interface GitFortState {
  files: Record<string, GitFile[]>;          // keyed by branch
  commits: GitCommit[];
  githubPat: string;
  githubRepo: string;
  githubOwner: string;
  lastSync: number | null;
  branchMapping: Record<BranchTier, string>;
}

interface GitFortProps {
  openTabs: { id: string; name: string; content: string; lang: string }[];
  onOpenFile: (file: { id: string; name: string; content: string; lang: string }) => void;
  activeTabId: string | null;
  onUpdateContent?: (id: string, content: string) => void;
}

// ── Constants ──────────────────────────────────────────────────────
const BRANCH_META: Record<BranchTier, { label: string; color: string; icon: string; desc: string; writeProtected?: boolean }> = {
  mastercode:   { label: 'MASTERCODE', color: T.gold,   icon: '◉', desc: 'Stable · Finalized · Write-protected backup', writeProtected: true },
  production:   { label: 'PRODUCTION', color: T.green,  icon: '▲', desc: 'Live deploys · Signed builds · Gated merges' },
  experimental: { label: 'EXPERIMENTAL', color: T.teal, icon: '◈', desc: 'Active R&D · Unstable · Free iteration' },
};

const LANG_ICONS: Record<string, string> = {
  tsx: '⬡', ts: '⬡', jsx: '⬡', js: '◈', py: '◉', go: '▲',
  json: '◆', md: '≡', css: '◇', html: '◇', sh: '▶', yaml: '≡', default: '◦',
};

const STORAGE_KEY = 'archon_gitfort_v1';

// ── Helpers ─────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }
function shortHash() { return Math.random().toString(16).slice(2, 9); }
function fileExt(name: string) { return name.split('.').pop() || 'default'; }
function langIcon(name: string) { return LANG_ICONS[fileExt(name)] ?? LANG_ICONS.default; }
function fmtBytes(b: number) { return b < 1024 ? `${b}B` : `${(b/1024).toFixed(1)}KB`; }
function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})} ${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
}

function loadState(): GitFortState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    files: { mastercode: [], production: [], experimental: [] },
    commits: [
      {
        hash: shortHash(), message: 'Initial sovereign commit — Archon Nexus bootstrap',
        author: 'AYO', timestamp: Date.now() - 86400000 * 7,
        branch: 'mastercode', files: [], verified: true,
      },
      {
        hash: shortHash(), message: 'feat: xDragon Studio v2 — module architecture',
        author: 'AYO', timestamp: Date.now() - 86400000 * 3,
        branch: 'production', files: [], verified: true,
      },
      {
        hash: shortHash(), message: 'wip: GitFort integration prototype',
        author: 'AYO', timestamp: Date.now() - 3600000,
        branch: 'experimental', files: [], verified: false,
      },
    ],
    githubPat: '', githubRepo: '', githubOwner: '', lastSync: null,
    branchMapping: { mastercode: 'main', production: 'production', experimental: 'experimental' },
  };
}

function saveState(s: GitFortState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

// ══════════════════════════════════════════════════════════════════
//  COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function GitFort({ openTabs, onOpenFile, activeTabId }: GitFortProps) {
  const [state, setState] = useState<GitFortState>(loadState);
  const [activeBranch, setActiveBranch] = useState<BranchTier>('experimental');
  const [gitTab, setGitTab] = useState<'files' | 'commits' | 'diff' | 'sync' | 'settings'>('files');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['(root)']));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncLog, setSyncLog] = useState<string[]>([]);
  const [commitMsg, setCommitMsg] = useState('');
  const [stagedFiles, setStagedFiles] = useState<Set<string>>(new Set());
  const [newFileName, setNewFileName] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);
  const [_showGitHubSettings, _setShowGitHubSettings] = useState(false);
  const [githubPat, setGithubPat] = useState(state.githubPat);
  const [githubRepo, setGithubRepo] = useState(state.githubRepo);
  const [githubOwner, setGithubOwner] = useState(state.githubOwner);
  const [branchMapping, setBranchMapping] = useState(state.branchMapping);
  const [diffContent, setDiffContent] = useState('');
  const [mergeFrom, setMergeFrom] = useState<BranchTier>('experimental');
  const syncLogRef = useRef<HTMLDivElement>(null);

  // Persist state
  useEffect(() => { saveState(state); }, [state]);

  // Auto-scroll sync log
  useEffect(() => {
    if (syncLogRef.current) syncLogRef.current.scrollTop = syncLogRef.current.scrollHeight;
  }, [syncLog]);

  // Import open tabs into experimental automatically
  useEffect(() => {
    if (openTabs.length === 0) return;
    setState(prev => {
      const existingIds = new Set(prev.files.experimental.map(f => f.id));
      const newFiles: GitFile[] = openTabs
        .filter(t => !existingIds.has(t.id))
        .map(t => ({
          id: t.id, path: t.name, name: t.name,
          lang: fileExt(t.name), content: t.content,
          status: 'added', size: t.content.length,
          lastModified: Date.now(),
        }));
      if (newFiles.length === 0) return prev;
      // Auto-expand any new folder prefixes
      const newFolders = new Set(newFiles
        .filter(f => f.name.includes('/'))
        .map(f => f.name.split('/')[0]));
      if (newFolders.size > 0) {
        setExpandedFolders(prev => new Set([...prev, ...newFolders]));
      }
      return {
        ...prev,
        files: {
          ...prev.files,
          experimental: [...prev.files.experimental, ...newFiles],
        },
      };
    });
  }, [openTabs]);

  // Sync tabs → file content
  useEffect(() => {
    if (!activeTabId) return;
    const tab = openTabs.find(t => t.id === activeTabId);
    if (!tab) return;
    setState(prev => ({
      ...prev,
      files: {
        ...prev.files,
        experimental: prev.files.experimental.map(f =>
          f.id === activeTabId
            ? { ...f, content: tab.content, status: 'modified', size: tab.content.length, lastModified: Date.now() }
            : f
        ),
      },
    }));
  }, [activeTabId, openTabs]);

  const branchFiles = state.files[activeBranch] || [];
  const isProtected = BRANCH_META[activeBranch].writeProtected;

  // ── Actions ─────────────────────────────────────────────────────

  const toggleStage = useCallback((fileId: string) => {
    setStagedFiles(prev => {
      const next = new Set(prev);
      next.has(fileId) ? next.delete(fileId) : next.add(fileId);
      return next;
    });
  }, []);

  const stageAll = useCallback(() => {
    setStagedFiles(new Set(branchFiles.filter(f => f.status !== 'unmodified').map(f => f.id)));
  }, [branchFiles]);

  const commit = useCallback(() => {
    if (!commitMsg.trim() || stagedFiles.size === 0 || isProtected) return;
    const hash = shortHash();
    const files = branchFiles.filter(f => stagedFiles.has(f.id)).map(f => f.name);
    const newCommit: GitCommit = {
      hash, message: commitMsg.trim(), author: 'AYO',
      timestamp: Date.now(), branch: activeBranch, files, verified: false,
    };
    setState(prev => ({
      ...prev,
      commits: [newCommit, ...prev.commits],
      files: {
        ...prev.files,
        [activeBranch]: prev.files[activeBranch].map(f =>
          stagedFiles.has(f.id) ? { ...f, status: 'unmodified' } : f
        ),
      },
    }));
    setStagedFiles(new Set());
    setCommitMsg('');
  }, [commitMsg, stagedFiles, isProtected, activeBranch, branchFiles]);

  const addNewFile = useCallback(() => {
    if (!newFileName.trim() || isProtected) return;
    const file: GitFile = {
      id: uid(), path: newFileName.trim(), name: newFileName.trim(),
      lang: fileExt(newFileName.trim()), content: '', status: 'added',
      size: 0, lastModified: Date.now(),
    };
    setState(prev => ({
      ...prev,
      files: { ...prev.files, [activeBranch]: [...prev.files[activeBranch], file] },
    }));
    setNewFileName(''); setShowNewFile(false);
    onOpenFile({ id: file.id, name: file.name, content: '', lang: file.lang });
  }, [newFileName, isProtected, activeBranch, onOpenFile]);

  const deleteFile = useCallback((fileId: string) => {
    if (isProtected) return;
    setState(prev => ({
      ...prev,
      files: {
        ...prev.files,
        [activeBranch]: prev.files[activeBranch].filter(f => f.id !== fileId),
      },
    }));
    if (selectedFile === fileId) setSelectedFile(null);
  }, [isProtected, activeBranch, selectedFile]);

  const promoteToMastercode = useCallback((fromBranch: BranchTier) => {
    if (fromBranch === 'mastercode') return;
    const sourceFiles = state.files[fromBranch];
    if (sourceFiles.length === 0) return;
    const newCommit: GitCommit = {
      hash: shortHash(),
      message: `merge(mastercode): promote ${fromBranch} → mastercode — ${new Date().toISOString().split('T')[0]}`,
      author: 'AYO', timestamp: Date.now(), branch: 'mastercode',
      files: sourceFiles.map(f => f.name), verified: true,
    };
    setState(prev => ({
      ...prev,
      commits: [newCommit, ...prev.commits],
      files: {
        ...prev.files,
        mastercode: sourceFiles.map(f => ({ ...f, status: 'unmodified' as FileStatus })),
      },
    }));
  }, [state.files]);

  const generateDiff = useCallback((fileId: string) => {
    const file = branchFiles.find(f => f.id === fileId);
    if (!file) return;
    const master = state.files.mastercode.find(f => f.name === file.name);
    if (!master) {
      setDiffContent(`--- mastercode/${file.name}\n+++ ${activeBranch}/${file.name}\n\n[NEW FILE — not in mastercode]\n\n+${file.content.replace(/\n/g, '\n+')}`);
    } else {
      const oldLines = master.content.split('\n');
      const newLines = file.content.split('\n');
      let diff = `--- mastercode/${file.name}\n+++ ${activeBranch}/${file.name}\n\n`;
      const maxLen = Math.max(oldLines.length, newLines.length);
      for (let i = 0; i < maxLen; i++) {
        if (oldLines[i] !== newLines[i]) {
          if (oldLines[i] !== undefined) diff += `- ${oldLines[i]}\n`;
          if (newLines[i] !== undefined) diff += `+ ${newLines[i]}\n`;
        }
      }
      setDiffContent(diff);
    }
    setGitTab('diff');
    setSelectedFile(fileId);
  }, [branchFiles, state.files, activeBranch]);

  const runGitHubSync = useCallback(async (direction: 'push' | 'pull') => {
    if (!state.githubPat || !state.githubRepo || !state.githubOwner) {
      setSyncLog(prev => [...prev, '✗ GitHub credentials not configured. Go to Settings tab.']);
      return;
    }
    setSyncStatus('syncing');
    const mappedBranch = branchMapping[activeBranch] || activeBranch;
    setSyncLog([`► ${direction.toUpperCase()} → ${state.githubOwner}/${state.githubRepo} [${mappedBranch}]`]);

    const headers = {
      'Authorization': `Bearer ${state.githubPat}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };
    const baseUrl = `https://api.github.com/repos/${state.githubOwner}/${state.githubRepo}`;

    try {
      if (direction === 'push') {
        const filesToPush = state.files[activeBranch].filter(f => f.content);
        setSyncLog(prev => [...prev, `  Pushing ${filesToPush.length} file(s) from ${activeBranch}...`]);

        for (const file of filesToPush) {
          const encoded = btoa(unescape(encodeURIComponent(file.content)));
          // Get SHA if file exists
          let sha: string | undefined;
          try {
            const existing = await fetch(`${baseUrl}/contents/${file.path}?ref=${mappedBranch}`, { headers });
            if (existing.ok) { const j = await existing.json(); sha = j.sha; }
          } catch {}

          const body: Record<string, unknown> = {
            message: `gitfort: sync ${file.name} [${activeBranch}]`,
            content: encoded,
            branch: mappedBranch,
          };
          if (sha) body.sha = sha;

          const res = await fetch(`${baseUrl}/contents/${file.path}`, {
            method: 'PUT', headers, body: JSON.stringify(body),
          });
          if (res.ok) {
            setSyncLog(prev => [...prev, `  ✓ ${file.name}`]);
          } else {
            const err = await res.json();
            setSyncLog(prev => [...prev, `  ✗ ${file.name}: ${err.message}`]);
          }
        }
      } else {
        // Pull: fetch file list from GitHub branch
        setSyncLog(prev => [...prev, `  Fetching tree from GitHub (${mappedBranch})...`]);
        const treeRes = await fetch(`${baseUrl}/git/trees/${mappedBranch}?recursive=1`, { headers });
        if (!treeRes.ok) throw new Error(`Branch '${mappedBranch}' not found on GitHub`);
        const tree = await treeRes.json();
        const files: GitFile[] = [];
        for (const item of tree.tree || []) {
          if (item.type !== 'blob') continue;
          const contentRes = await fetch(`${baseUrl}/contents/${item.path}?ref=${mappedBranch}`, { headers });
          if (!contentRes.ok) continue;
          const contentData = await contentRes.json();
          const decoded = decodeURIComponent(escape(atob(contentData.content.replace(/\n/g, ''))));
          files.push({
            id: uid(), path: item.path, name: item.path.split('/').pop() || item.path,
            lang: fileExt(item.path), content: decoded, status: 'unmodified',
            size: decoded.length, lastModified: Date.now(),
          });
          setSyncLog(prev => [...prev, `  ✓ ${item.path}`]);
        }
        setState(prev => ({
          ...prev,
          files: { ...prev.files, [activeBranch]: files },
          lastSync: Date.now(),
        }));
      }

      setState(prev => ({ ...prev, lastSync: Date.now() }));
      setSyncLog(prev => [...prev, `\n✓ ${direction.toUpperCase()} complete — ${new Date().toLocaleTimeString()}`]);
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncLog(prev => [...prev, `\n✗ ERROR: ${msg}`]);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 5000);
    }
  }, [state, activeBranch]);

  const [saveConfirm, setSaveConfirm] = useState(false);

  const saveGithubSettings = useCallback(() => {
    // Update component state (triggers useEffect → saves to archon_gitfort_v1)
    setState(prev => ({ ...prev, githubPat, githubRepo, githubOwner, branchMapping }));
    // Also write github_pat to its own key so CodeStudio clone can read it
    if (githubPat.trim()) {
      localStorage.setItem('github_pat', githubPat.trim());
    }
    // Flash confirmation
    setSaveConfirm(true);
    setTimeout(() => setSaveConfirm(false), 2500);
  }, [githubPat, githubRepo, githubOwner, branchMapping]);

  // ── Shared styles ─────────────────────────────────────────────────
  const btn = (color = T.gold, outline = false, small = false): React.CSSProperties => ({
    ...mono, fontSize: small ? '0.56rem' : '0.6rem',
    padding: small ? '2px 7px' : '4px 10px',
    background: outline ? 'transparent' : color + '22',
    color: outline ? T.textMuted : color,
    border: `1px solid ${outline ? T.border : color + '55'}`,
    borderRadius: 3, cursor: 'pointer',
  });

  const tabBtn = (id: string): React.CSSProperties => ({
    ...mono, fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase',
    padding: '5px 10px', background: 'transparent',
    border: 'none', borderBottom: `2px solid ${gitTab === id ? T.gold : 'transparent'}`,
    color: gitTab === id ? T.gold : T.textMuted, cursor: 'pointer',
  });

  const statusColor: Record<FileStatus, string> = {
    unmodified: T.textDim, modified: T.gold, added: T.green, deleted: T.red, staged: T.teal,
  };
  const statusLabel: Record<FileStatus, string> = {
    unmodified: '·', modified: 'M', added: 'A', deleted: 'D', staged: 'S',
  };

  const branchCommits = state.commits.filter(c => c.branch === activeBranch);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.surface, color: T.text }}>

      {/* ── BRANCH SELECTOR ─────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, background: T.surface2, flexShrink: 0 }}>
        {(Object.keys(BRANCH_META) as BranchTier[]).map(b => {
          const meta = BRANCH_META[b];
          const active = activeBranch === b;
          const changed = (state.files[b] || []).filter(f => f.status !== 'unmodified').length;
          return (
            <button key={b} onClick={() => setActiveBranch(b)} style={{
              ...mono, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em',
              padding: '7px 14px', background: active ? T.black : 'transparent',
              color: active ? meta.color : T.textMuted,
              border: 'none', borderBottom: `3px solid ${active ? meta.color : 'transparent'}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>{meta.icon}</span>
              <span>{meta.label}</span>
              {changed > 0 && (
                <span style={{ fontSize: '0.52rem', background: meta.color + '33', color: meta.color,
                  border: `1px solid ${meta.color}55`, borderRadius: 10, padding: '0 5px', minWidth: 18, textAlign: 'center' }}>
                  {changed}
                </span>
              )}
              {meta.writeProtected && (
                <span style={{ fontSize: '0.5rem', color: T.textDim }}>🔒</span>
              )}
            </button>
          );
        })}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingRight: 12 }}>
          <span style={{ ...mono, fontSize: '0.54rem', color: T.textDim }}>
            {BRANCH_META[activeBranch].desc}
          </span>
          {state.lastSync && (
            <span style={{ ...mono, fontSize: '0.52rem', color: T.textDim }}>
              · synced {fmtTime(state.lastSync)}
            </span>
          )}
        </div>
      </div>

      {/* ── TAB NAV ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, background: T.surface2, flexShrink: 0 }}>
        {(['files', 'commits', 'diff', 'sync', 'settings'] as const).map(t => (
          <button key={t} style={tabBtn(t)} onClick={() => setGitTab(t)}>
            {t === 'files' ? '◎ Files' : t === 'commits' ? '◉ Commits' : t === 'diff' ? '≡ Diff' : t === 'sync' ? '↻ Sync' : '⚙ Config'}
          </button>
        ))}
      </div>

      {/* ── FILE TREE ──────────────────────────────────────────────── */}
      {gitTab === 'files' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <span style={{ ...mono, fontSize: '0.58rem', color: T.textMuted }}>
              {branchFiles.length} file{branchFiles.length !== 1 ? 's' : ''}
            </span>
            {!isProtected && (
              <>
                <button style={btn(T.teal, false, true)} onClick={() => setShowNewFile(v => !v)}>
                  {showNewFile ? '✕' : '+ New'}
                </button>
                {branchFiles.some(f => f.status !== 'unmodified') && (
                  <button style={btn(T.gold, false, true)} onClick={stageAll}>Stage All</button>
                )}
              </>
            )}
            {activeBranch !== 'mastercode' && (
              <button style={{ ...btn(T.gold, true, true), marginLeft: 'auto' }}
                onClick={() => promoteToMastercode(activeBranch)}>
                ↑ Promote to Mastercode
              </button>
            )}
          </div>

          {showNewFile && !isProtected && (
            <div style={{ display: 'flex', gap: 6, padding: '6px 10px', background: T.surface3, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
              <input
                value={newFileName} onChange={e => setNewFileName(e.target.value)}
                placeholder="filename.tsx"
                onKeyDown={e => e.key === 'Enter' && addNewFile()}
                autoFocus
                style={{ ...mono, flex: 1, background: T.surface, border: `1px solid ${T.border}`,
                  color: T.text, fontSize: '0.64rem', padding: '3px 8px', borderRadius: 3, outline: 'none' }}
              />
              <button style={btn(T.teal)} onClick={addNewFile}>Create</button>
            </div>
          )}

          {/* File tree — grouped by folder */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {branchFiles.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', ...mono, fontSize: '0.64rem', color: T.textDim }}>
                {isProtected ? '🔒 Mastercode is read-only. Promote files from Production.' : 'No files. Generate code in AI mode or import a folder.'}
              </div>
            )}
            {(() => {
              // Group files by top-level folder prefix
              const grouped: Record<string, typeof branchFiles> = {};
              branchFiles.forEach(file => {
                const parts = file.name.includes('/') ? file.name.split('/') : ['(root)', file.name];
                const folder = parts.length > 1 ? parts[0] : '(root)';
                if (!grouped[folder]) grouped[folder] = [];
                grouped[folder].push(file);
              });

              return Object.entries(grouped).map(([folder, files]) => {
                const isExpanded = expandedFolders.has(folder);
                return (
                  <div key={folder}>
                    {/* Folder row */}
                    {folder !== '(root)' && (
                      <div
                        onClick={() => setExpandedFolders(prev => {
                          const next = new Set(prev);
                          isExpanded ? next.delete(folder) : next.add(folder);
                          return next;
                        })}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                          background: T.surface2, borderBottom: `1px solid ${T.border}33`, cursor: 'pointer' }}>
                        <span style={{ fontSize: '0.7rem' }}>{isExpanded ? '📂' : '📁'}</span>
                        <span style={{ ...mono, fontSize: '0.62rem', color: T.teal, fontWeight: 700 }}>{folder}</span>
                        <span style={{ ...mono, fontSize: '0.52rem', color: T.textDim, marginLeft: 'auto' }}>{files.length}</span>
                      </div>
                    )}
                    {/* Files in this folder */}
                    {(folder === '(root)' || isExpanded) && files.map(file => {
                      const isSelected = selectedFile === file.id;
                      const isStaged   = stagedFiles.has(file.id);
                      const displayName = file.name.includes('/') ? file.name.split('/').pop()! : file.name;
                      return (
                        <div key={file.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 8,
                            padding: folder !== '(root)' ? '4px 10px 4px 24px' : '5px 10px',
                            background: isSelected ? T.surface3 : 'transparent',
                            borderLeft: `2px solid ${isSelected ? T.gold : 'transparent'}`,
                            borderBottom: `1px solid ${T.border}22`, cursor: 'pointer' }}
                          onClick={() => setSelectedFile(isSelected ? null : file.id)}
                          onDoubleClick={() => onOpenFile({ id: file.id, name: file.name, content: file.content, lang: file.lang })}
                          title="Double-click to open in editor"
                        >
                          <span style={{ ...mono, fontSize: '0.68rem', color: T.textMuted, width: 14, flexShrink: 0 }}>{langIcon(file.name)}</span>
                          <span style={{ ...mono, fontSize: '0.64rem', flex: 1, color: T.text,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayName}
                          </span>
                          <span style={{ ...mono, fontSize: '0.56rem', color: T.textDim, flexShrink: 0 }}>{fmtBytes(file.size)}</span>
                          <span style={{ ...mono, fontSize: '0.6rem', fontWeight: 700, width: 14, textAlign: 'center',
                            color: statusColor[file.status], flexShrink: 0 }}>
                            {statusLabel[file.status]}
                          </span>
                          {!isProtected && (
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              {file.status !== 'unmodified' && (
                                <button style={btn(isStaged ? T.teal : T.gold, true, true)}
                                  onClick={e => { e.stopPropagation(); toggleStage(file.id); }}>
                                  {isStaged ? '−' : '+'}
                                </button>
                              )}
                              <button style={btn(T.blue, true, true)}
                                onClick={e => { e.stopPropagation(); onOpenFile({ id: file.id, name: file.name, content: file.content, lang: file.lang }); }}>
                                ↗ Open
                              </button>
                              <button style={btn(T.textMuted, true, true)}
                                onClick={e => { e.stopPropagation(); generateDiff(file.id); }}>
                                Diff
                              </button>
                              <button style={btn(T.red, true, true)}
                                onClick={e => { e.stopPropagation(); deleteFile(file.id); }}>
                                ✕
                              </button>
                            </div>
                          )}
                          {isProtected && (
                            <button style={{ ...btn(T.blue, true, true), flexShrink: 0 }}
                              onClick={e => { e.stopPropagation(); onOpenFile({ id: file.id, name: file.name, content: file.content, lang: file.lang }); }}>
                              ↗ View
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>

          {/* Commit bar */}
          {!isProtected && stagedFiles.size > 0 && (
            <div style={{ borderTop: `1px solid ${T.border}`, padding: '8px 10px', background: T.surface2, flexShrink: 0 }}>
              <div style={{ ...mono, fontSize: '0.56rem', color: T.teal, marginBottom: 6 }}>
                {stagedFiles.size} file{stagedFiles.size !== 1 ? 's' : ''} staged
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={commitMsg} onChange={e => setCommitMsg(e.target.value)}
                  placeholder="Commit message..."
                  onKeyDown={e => e.key === 'Enter' && commit()}
                  style={{ ...mono, flex: 1, background: T.surface, border: `1px solid ${T.border}`,
                    color: T.text, fontSize: '0.64rem', padding: '4px 8px', borderRadius: 3, outline: 'none' }}
                />
                <button style={btn(T.gold)} onClick={commit} disabled={!commitMsg.trim()}>
                  ◉ Commit
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── COMMIT LOG ──────────────────────────────────────────────── */}
      {gitTab === 'commits' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '6px 10px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 8 }}>
            {(['mastercode', 'production', 'experimental'] as BranchTier[]).map(b => (
              <button key={b} style={{ ...btn(BRANCH_META[b].color, activeBranch !== b, true) }}
                onClick={() => setActiveBranch(b)}>
                {BRANCH_META[b].icon} {b}
              </button>
            ))}
          </div>
          {branchCommits.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', ...mono, fontSize: '0.64rem', color: T.textDim }}>
              No commits on {activeBranch}
            </div>
          )}
          {branchCommits.map((commit, i) => (
            <div key={commit.hash} style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}22`,
              background: i === 0 ? T.surface3 : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ ...mono, fontSize: '0.56rem', color: T.gold, fontFamily: 'monospace' }}>
                  {commit.hash}
                </span>
                {commit.verified && (
                  <span style={{ ...mono, fontSize: '0.52rem', color: T.green, border: `1px solid ${T.green}44`, borderRadius: 2, padding: '0 4px' }}>
                    ✓ verified
                  </span>
                )}
                <span style={{ ...mono, fontSize: '0.52rem', color: T.textDim, marginLeft: 'auto' }}>
                  {fmtTime(commit.timestamp)}
                </span>
              </div>
              <div style={{ ...mono, fontSize: '0.65rem', color: T.text, marginTop: 4 }}>{commit.message}</div>
              <div style={{ ...mono, fontSize: '0.54rem', color: T.textMuted, marginTop: 3 }}>
                {commit.author} · {commit.files.length > 0 ? commit.files.join(', ') : 'no files'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── DIFF VIEWER ──────────────────────────────────────────────── */}
      {gitTab === 'diff' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {diffContent ? (
            <pre style={{ ...mono, fontSize: '0.65rem', lineHeight: 1.7, whiteSpace: 'pre-wrap',
              background: T.black, padding: 12, borderRadius: 4, border: `1px solid ${T.border}` }}>
              {diffContent.split('\n').map((line, i) => (
                <span key={i} style={{ display: 'block',
                  color: line.startsWith('+') ? T.green : line.startsWith('-') ? T.red : line.startsWith('@') ? T.blue : T.textMuted }}>
                  {line}
                </span>
              ))}
            </pre>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', ...mono, fontSize: '0.64rem', color: T.textDim }}>
              Select a file and click Diff to compare against mastercode
            </div>
          )}
        </div>
      )}

      {/* ── GITHUB SYNC ─────────────────────────────────────────────── */}
      {gitTab === 'sync' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            {!state.githubPat && (
              <div style={{ ...mono, fontSize: '0.6rem', color: T.orange, marginBottom: 8 }}>
                ⚠ GitHub credentials not configured. Go to Config tab.
              </div>
            )}
            <div style={{ ...mono, fontSize: '0.6rem', color: T.textMuted, marginBottom: 8 }}>
              Remote: {state.githubOwner && state.githubRepo
                ? `github.com/${state.githubOwner}/${state.githubRepo}/${activeBranch}`
                : '— not configured —'}
            </div>

            {/* Merge helper */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ ...mono, fontSize: '0.58rem', color: T.textMuted }}>Merge from:</span>
              <select value={mergeFrom} onChange={e => setMergeFrom(e.target.value as BranchTier)}
                style={{ ...mono, fontSize: '0.6rem', background: T.surface, border: `1px solid ${T.border}`,
                  color: T.text, padding: '3px 6px', borderRadius: 3 }}>
                {(['mastercode', 'production', 'experimental'] as BranchTier[]).map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <span style={{ ...mono, fontSize: '0.58rem', color: T.textMuted }}>→ {activeBranch}</span>
              <button style={btn(T.purple)}
                onClick={() => {
                  const sourceFiles = state.files[mergeFrom];
                  if (mergeFrom === activeBranch || isProtected) return;
                  setState(prev => ({
                    ...prev,
                    files: { ...prev.files, [activeBranch]: sourceFiles.map(f => ({ ...f, status: 'modified' as FileStatus })) },
                  }));
                  setSyncLog(prev => [...prev, `✓ Merged ${mergeFrom} → ${activeBranch} (${sourceFiles.length} files)`]);
                }}>
                Merge
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn(T.green)} onClick={() => runGitHubSync('push')} disabled={syncStatus === 'syncing'}>
                ↑ Push to GitHub
              </button>
              <button style={btn(T.blue)} onClick={() => runGitHubSync('pull')} disabled={syncStatus === 'syncing'}>
                ↓ Pull from GitHub
              </button>
              {syncStatus === 'syncing' && (
                <span style={{ ...mono, fontSize: '0.6rem', color: T.gold }}>◌ Syncing...</span>
              )}
              {syncStatus === 'success' && (
                <span style={{ ...mono, fontSize: '0.6rem', color: T.green }}>✓ Done</span>
              )}
              {syncStatus === 'error' && (
                <span style={{ ...mono, fontSize: '0.6rem', color: T.red }}>✗ Error</span>
              )}
            </div>
          </div>

          {/* Sync log */}
          <div ref={syncLogRef} style={{ flex: 1, overflowY: 'auto', padding: 12,
            background: T.black, ...mono, fontSize: '0.64rem' }}>
            {syncLog.length === 0 ? (
              <span style={{ color: T.textDim }}>$ gitfort sync ready...</span>
            ) : syncLog.map((line, i) => (
              <div key={i} style={{ lineHeight: 1.7,
                color: line.startsWith('✓') ? T.green : line.startsWith('✗') ? T.red : line.startsWith('►') ? T.gold : T.textMuted }}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SETTINGS / CONFIG ─────────────────────────────────────── */}
      {gitTab === 'settings' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <div style={{ ...mono, fontSize: '0.6rem', color: T.gold, letterSpacing: '0.15em', marginBottom: 16 }}>
            ◉ GITHUB INTEGRATION — PAT AUTHENTICATION
          </div>

          {[
            { label: 'GitHub Owner (username / org)', value: githubOwner, set: setGithubOwner, placeholder: 'e.g. xDragonStudios' },
            { label: 'Repository Name', value: githubRepo, set: setGithubRepo, placeholder: 'e.g. archon-nexus' },
            { label: 'Personal Access Token (PAT)', value: githubPat, set: setGithubPat, placeholder: 'ghp_...', secret: true },
          ].map(field => (
            <div key={field.label} style={{ marginBottom: 14 }}>
              <label style={{ ...mono, fontSize: '0.58rem', color: T.textMuted, display: 'block', marginBottom: 4 }}>
                {field.label}
              </label>
              <input
                type={field.secret ? 'password' : 'text'}
                value={field.value} onChange={e => field.set(e.target.value)}
                placeholder={field.placeholder}
                style={{ width: '100%', ...mono, fontSize: '0.64rem', background: T.surface,
                  border: `1px solid ${T.border}`, color: T.text, padding: '6px 10px', borderRadius: 3, outline: 'none' }}
              />
            </div>
          ))}

          <div style={{ marginTop: 20, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
            <div style={{ ...mono, fontSize: '0.6rem', color: T.gold, letterSpacing: '0.15em', marginBottom: 12 }}>
              ◉ BRANCH INTERPRETER (LOCAL → GITHUB)
            </div>
            {(['mastercode', 'production', 'experimental'] as BranchTier[]).map(tier => (
              <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 100, ...mono, fontSize: '0.58rem', color: BRANCH_META[tier].color }}>{tier.toUpperCase()}</div>
                <div style={{ fontSize: '0.6rem', color: T.textMuted }}>→</div>
                <input
                  value={branchMapping[tier]}
                  onChange={e => setBranchMapping(prev => ({ ...prev, [tier]: e.target.value }))}
                  placeholder={`GitHub branch name`}
                  style={{ flex: 1, ...mono, fontSize: '0.64rem', background: T.surface,
                    border: `1px solid ${T.border}`, color: T.text, padding: '4px 8px', borderRadius: 3, outline: 'none' }}
                />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <button style={btn(T.gold)} onClick={saveGithubSettings}>Save Configuration</button>
            {saveConfirm && (
              <span style={{ ...mono, fontSize: '0.6rem', color: T.green }}>
                ✓ Saved — Mappings stored in GitFort state
              </span>
            )}
          </div>

          <div style={{ marginTop: 24, padding: 12, background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 4 }}>
            <div style={{ ...mono, fontSize: '0.56rem', color: T.textMuted, lineHeight: 1.8 }}>
              <div style={{ color: T.gold, marginBottom: 6 }}>◈ GitFort — Branch Protocol</div>
              <div><span style={{ color: BRANCH_META.mastercode.color }}>MASTERCODE</span> — Write-protected. Only receives promotions from Production. Contains all finalized, production-certified code.</div>
              <div style={{ marginTop: 4 }}><span style={{ color: BRANCH_META.production.color }}>PRODUCTION</span> — Gated merges only. Signed by AYO. Deployed to live infrastructure via Launcher API.</div>
              <div style={{ marginTop: 4 }}><span style={{ color: BRANCH_META.experimental.color }}>EXPERIMENTAL</span> — Free iteration zone. All AI-generated code lands here first. Not deployed until promoted.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}