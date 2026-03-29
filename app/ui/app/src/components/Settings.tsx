import { useEffect, useState, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Settings as SettingsType } from "@/gotypes";
import { useNavigate } from "@tanstack/react-router";
import { useUser } from "@/hooks/useUser";
import { useCloudStatus } from "@/hooks/useCloudStatus";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ServicesPanel from "@/components/ServicesPanel";
import { ArchonTunnel } from "@/lib/archon-tunnel";
import type { TunnelStatus, TunnelLogEntry } from "@/lib/archon-tunnel";
import { SovereignVault } from "@/lib/sovereign-vault";
import { ARCHON_BACKEND_URL, OLLAMA_URL } from "@/lib/config";
import {
  getSettings,
  type CloudStatusResponse,
  updateCloudSetting,
  updateSettings,
  getInferenceCompute,
} from "@/api";

export default function Settings() {
  const queryClient = useQueryClient();
  const [showSaved, setShowSaved] = useState(false);
  const [restartMessage, setRestartMessage] = useState(false);
  const {
    user,
    isAuthenticated,
    refreshUser,
    isRefreshing,
    refetchUser,
    fetchConnectUrl,
    isLoading,
    disconnectUser,
  } = useUser();
  const [isAwaitingConnection, setIsAwaitingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);
  const navigate = useNavigate();
  const {
    cloudDisabled,
    cloudStatus,
    isLoading: cloudStatusLoading,
  } = useCloudStatus();

  const {
    data: settingsData,
    isLoading: loading,
  } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const settings = settingsData?.settings || null;

  const { data: inferenceComputeResponse } = useQuery({
    queryKey: ["inferenceCompute"],
    queryFn: getInferenceCompute,
  });

  const defaultContextLength = inferenceComputeResponse?.defaultContextLength;

  const updateSettingsMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 1500);
    },
  });

  const updateCloudMutation = useMutation({
    mutationFn: (enabled: boolean) => updateCloudSetting(enabled),
    onMutate: async (enabled: boolean) => {
      await queryClient.cancelQueries({ queryKey: ["cloudStatus"] });

      const previous = queryClient.getQueryData<CloudStatusResponse | null>([
        "cloudStatus",
      ]);
      const envForcesDisabled =
        previous?.source === "env" || previous?.source === "both";

      queryClient.setQueryData<CloudStatusResponse | null>(
        ["cloudStatus"],
        previous
          ? {
              ...previous,
              disabled: !enabled || envForcesDisabled,
            }
          : {
              disabled: !enabled,
              source: "config",
            },
      );

      return { previous };
    },
    onError: (_error, _enabled, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["cloudStatus"], context.previous);
      }
    },
    onSuccess: (status) => {
      queryClient.setQueryData<CloudStatusResponse | null>(
        ["cloudStatus"],
        status,
      );
      queryClient.invalidateQueries({ queryKey: ["models"] });
      queryClient.invalidateQueries({ queryKey: ["cloudStatus"] });

      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 1500);
    },
  });

  useEffect(() => {
    refetchUser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleFocus = () => {
      if (isAwaitingConnection && pollingInterval) {
        // Stop polling when window gets focus
        clearInterval(pollingInterval);
        setPollingInterval(null);
        // Reset awaiting connection state
        setIsAwaitingConnection(false);
        // Make one last refresh request
        refreshUser();
      }
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [isAwaitingConnection, refreshUser, pollingInterval]);

  // Check if user is authenticated after refresh
  useEffect(() => {
    if (isAwaitingConnection && isAuthenticated) {
      setIsAwaitingConnection(false);
      setConnectionError(null);
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    }
  }, [isAuthenticated, isAwaitingConnection, pollingInterval]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const handleChange = useCallback(
    (field: keyof SettingsType, value: boolean | string | number) => {
      if (settings) {
        const updatedSettings = new SettingsType({
          ...settings,
          [field]: value,
        });

        // If context length is being changed, show restart message
        if (field === "ContextLength" && value !== settings.ContextLength) {
          setRestartMessage(true);
          // Hide restart message after 3 seconds
          setTimeout(() => setRestartMessage(false), 3000);
        }

        updateSettingsMutation.mutate(updatedSettings);
      }
    },
    [settings, updateSettingsMutation],
  );

  const handleResetToDefaults = () => {
    if (settings) {
      const defaultSettings = new SettingsType({
        Expose: false,
        Browser: false,
        Models: "",
        Agent: false,
        Tools: false,
        ContextLength: 0,
      });
      updateSettingsMutation.mutate(defaultSettings);
    }
  };

  const cloudOverriddenByEnv =
    cloudStatus?.source === "env" || cloudStatus?.source === "both";
  const cloudToggleDisabled =
    cloudStatusLoading || updateCloudMutation.isPending || cloudOverriddenByEnv;

  const handleConnectOllamaAccount = async () => {
    setConnectionError(null);

    // If user is already authenticated, no need to connect
    if (isAuthenticated) {
      return;
    }

    try {
      // If we don't have a user or user has no name, get connect URL
      if (!user || !user?.name) {
        const { data: connectUrl } = await fetchConnectUrl();
        if (connectUrl) {
          window.open(connectUrl, "_blank");
          setIsAwaitingConnection(true);
          // Start polling every 5 seconds
          const interval = setInterval(() => {
            refreshUser();
          }, 5000);
          setPollingInterval(interval);
        } else {
          setConnectionError("Failed to get connect URL");
        }
      }
    } catch (error) {
      console.error("Error connecting to Ollama account:", error);
      setConnectionError(
        error instanceof Error
          ? error.message
          : "Failed to connect to Ollama account",
      );
      setIsAwaitingConnection(false);
    }
  };

  // ── Agent model assignment (localStorage) ─────────────────────────
  const AGENTS_LIST = [
    { id:'ARCHON',   name:'The Archon',           color:'#c9a84c', title:'Supreme Orchestrator'        },
    { id:'MODEBOLA', name:'Modebola Awolowo',      color:'#9a7ab0', title:'Chief of Staff'              },
    { id:'AYO',      name:'Ayo Hastruup',          color:'#c9a84c', title:'CTO & Head of Engineering'   },
    { id:'KOFI',     name:'Kofi Perempe',          color:'#4a8aba', title:'Chief Economist & CFO'       },
    { id:'MEI',      name:'Mei Zhu-Adeyemi',       color:'#5ab0c8', title:'Chief Business Intelligence' },
    { id:'ARIA',     name:'Aria Okonkwo-Santos',   color:'#b04a9a', title:'Chief Creative Officer'      },
    { id:'KENDRA',   name:'Kendra Mwangi-Carter',  color:'#d4805a', title:'Chief Growth Officer'        },
    { id:'TUNDE',    name:'Tunde Balogun',         color:'#8aaa60', title:'Chief Legal Counsel & PRO'   },
  ];

  const { data: modelsData } = useQuery({
    queryKey: ["models"],
    queryFn: async () => {
      const r = await fetch(`${OLLAMA_URL}/api/tags`);
      if (!r.ok) return { models: [] };
      return r.json();
    },
  });
  const availableModels: string[] = (modelsData?.models ?? []).map((m: {name:string}) => m.name);

  // ── Ollama serve health (separate from desktop settings API) ─────────
  const { data: ollamaHealth } = useQuery({
    queryKey: ["ollamaHealth"],
    queryFn: async () => {
      const r = await fetch(`${OLLAMA_URL}/api/version`);
      if (!r.ok) return null;
      return r.json();
    },
    retry: false,
    refetchInterval: 5000,
  });
  const ollamaRunning = !!ollamaHealth;

  const [agentModels, setAgentModels] = useState<Record<string,string>>(() => {
    try { return JSON.parse(localStorage.getItem("archon_agent_models") ?? "{}"); }
    catch { return {}; }
  });

  const setAgentModel = (agentId: string, model: string) => {
    const updated = { ...agentModels, [agentId]: model };
    setAgentModels(updated);
    localStorage.setItem("archon_agent_models", JSON.stringify(updated));
  };

  // ── Daemon config (localStorage) ────────────────────────────────────
  const [daemonConfig, setDaemonConfigState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("archon_daemon_config") ?? "{}");
    } catch { return {}; }
  });

  const setDaemonField = (field: string, value: string | boolean) => {
    const updated = { ...daemonConfig, [field]: value };
    setDaemonConfigState(updated);
    localStorage.setItem("archon_daemon_config", JSON.stringify(updated));
  };

  // ── Archon Bridge state ────────────────────────────────────────────
  const tunnel = ArchonTunnel.getInstance();
  const [gatewayKey,      setGatewayKeyInput] = useState(tunnel.getGatewayKey());
  const [tunnelStatus,    setTunnelStatus]    = useState<TunnelStatus>(tunnel.status);
  const [tunnelLogs,      setTunnelLogs]      = useState<TunnelLogEntry[]>([]);
  const [vaultMeta,       setVaultMeta]       = useState(() => SovereignVault.getMeta());
  const [supabaseUrl,     setSupabaseUrl]     = useState(() => {
    try { return JSON.parse(localStorage.getItem("archon_vault_supabase") || "{}").url || ""; } catch { return ""; }
  });
  const [supabaseKey,     setSupabaseKey]     = useState(() => {
    try { return JSON.parse(localStorage.getItem("archon_vault_supabase") || "{}").serviceKey || ""; } catch { return ""; }
  });

  useEffect(() => {
    const unsubStatus = tunnel.onStatusChange(s => setTunnelStatus(s));
    const unsubLog    = tunnel.onLog(entry => setTunnelLogs(prev => [entry, ...prev].slice(0, 60)));
    return () => { unsubStatus(); unsubLog(); };
  }, []);

  const saveGatewayKey = useCallback(() => {
    tunnel.setGatewayKey(gatewayKey.trim());
    if (gatewayKey.trim()) {
      tunnel.connect();
    } else {
      tunnel.disconnect();
    }
  }, [gatewayKey, tunnel]);

  const saveSupabaseConfig = useCallback(() => {
    SovereignVault.setSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim());
    setVaultMeta(SovereignVault.getMeta());
  }, [supabaseUrl, supabaseKey]);

  const tunnelStatusColor = {
    connected:    '#4a9a6a',
    connecting:   '#c9a84c',
    reconnecting: '#c9a84c',
    disconnected: '#7a7060',
    error:        '#c05040',
  }[tunnelStatus] || '#7a7060';

  if (loading) {
    return null;
  }

  // settings = null when running bare `ollama serve` (no desktop app Go backend).
  // ollamaAvailable = desktop Go backend with /api/settings is running.
  // ollamaRunning   = standard ollama serve at :11434 is reachable.
  // Both can coexist or be independent.
  const ollamaAvailable = !!settings;

  const isWindows = navigator.platform.toLowerCase().includes("win");



  const T = {
    gold:'#c9a84c', goldDim:'#6b5820', goldBorder:'#3a3020',
    black:'#080808', surface:'#0f0f0f', surface2:'#161616', surface3:'#202020',
    border:'#282420', text:'#f0ead8', textMuted:'#7a7060', textDim:'#3a3530',
    green:'#4a9a6a', red:'#c05040', teal:'#5ab0c8', blue:'#4a8aba', sage:'#8aaa60',
  };
  const mono = { fontFamily:'"Menlo","Monaco","Consolas","Courier New",monospace' };

  const sectionStyle: React.CSSProperties = {
    background: T.surface2,
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  };
  const sectionHeader: React.CSSProperties = {
    display:'flex', alignItems:'center', gap:10,
    padding:'10px 16px',
    background: T.surface3,
    borderBottom: `1px solid ${T.border}`,
  };
  const rowStyle: React.CSSProperties = {
    display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'10px 16px',
    borderBottom: `1px solid ${T.border}`,
    gap: 12,
  };
  const labelStyle: React.CSSProperties = {
    ...mono, fontSize:'0.72rem', color: T.text, letterSpacing:'0.04em',
  };
  const descStyle: React.CSSProperties = {
    ...mono, fontSize:'0.6rem', color: T.textMuted, marginTop:2, lineHeight:1.5,
  };
  const inputStyle: React.CSSProperties = {
    background: T.surface, border:`1px solid ${T.border}`,
    borderRadius:4, color: T.text, fontSize:'0.68rem', padding:'5px 8px',
    outline:'none', width:'100%', ...mono,
  };
  const selectStyle: React.CSSProperties = {
    background: T.surface3, border:`1px solid ${T.border}`,
    borderRadius:4, color: T.text, fontSize:'0.65rem',
    padding:'4px 8px', cursor:'pointer', outline:'none', ...mono,
    minWidth: 180,
  };

  return (
    <main style={{ display:'flex', flexDirection:'column', height:'100vh', background: T.black, color: T.text, ...mono }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        height:52, padding:'0 16px',
        background: T.surface2,
        borderBottom: `1px solid ${T.goldBorder}`,
        flexShrink:0,
      }}
        onMouseDown={() => (window as any).drag?.()}
        onDoubleClick={() => (window as any).doubleClick?.()}
      >
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {isWindows && (
            <button
              onClick={() => navigate({ to:'/playground' })}
              style={{ background:'transparent', border:`1px solid ${T.border}`, color:T.textMuted,
                borderRadius:4, padding:'4px 8px', cursor:'pointer', fontSize:'0.65rem', ...mono }}
            >
              ← Back
            </button>
          )}
          <span style={{ color:T.gold, fontSize:'0.7rem', letterSpacing:'0.15em' }}>◈</span>
          <span style={{ fontSize:'0.8rem', fontWeight:700, color:T.gold, letterSpacing:'0.1em', textTransform:'uppercase' }}>
            Settings
          </span>
          <span style={{ fontSize:'0.58rem', color:T.textDim, letterSpacing:'0.08em' }}>
            ARCHON NEXUS · xDragon
          </span>
          <span style={{ ...mono, fontSize:'0.56rem', marginLeft:8,
            color: ollamaRunning ? T.green : T.red,
            border:`1px solid ${ollamaRunning ? T.green : T.red}40`,
            borderRadius:3, padding:'2px 7px' }}>
            {ollamaRunning ? '● SERVE RUNNING' : '● OLLAMA OFFLINE'}
          </span>
        </div>
        {!isWindows && (
          <button
            onClick={() => navigate({ to:'/playground' })}
            style={{ background:'transparent', border:`1px solid ${T.border}`, color:T.textMuted,
              borderRadius:4, padding:'4px 8px', cursor:'pointer', fontSize:'0.65rem', ...mono }}
          >
            ✕
          </button>
        )}
      </header>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        <div style={{ maxWidth:720, margin:'0 auto' }}>

          {/* ── 0. SERVICES PANEL ───────────────────────────── */}
          <ServicesPanel launcherUrl="http://localhost:3002" />

          {/* ── 1. OLLAMA ACCOUNT ───────────────────────────────────── */}
          <div style={sectionStyle}>
            <div style={sectionHeader}>
              <span style={{ color:T.gold, fontSize:'0.65rem', letterSpacing:'0.15em' }}>◈</span>
              <span style={{ fontSize:'0.68rem', fontWeight:700, color:T.gold, letterSpacing:'0.12em', textTransform:'uppercase' }}>
                Ollama Account
              </span>
            </div>
            <div style={{ padding:'12px 16px' }}>
              {!ollamaAvailable ? (
                /* ── xDragon standalone mode — Go backend /api/settings unavailable ── */
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                  <div>
                    <div style={{ ...mono, fontSize:'0.72rem', color:T.textMuted }}>Ollama Account</div>
                    <div style={{ ...mono, fontSize:'0.6rem', color:T.textDim, marginTop:3, lineHeight:1.6 }}>
                      {ollamaRunning
                        ? <>
                            <span style={{ color:T.green }}>● ollama serve is running</span>
                            {' '}— but the xDragon Go backend is not.<br />
                            Account sign-in requires the compiled xDragon binary (<code style={{ color:T.sage }}>go build</code>).
                            The rest of this settings page is fully functional.
                          </>
                        : <>
                            <span style={{ color:T.red }}>● ollama serve not detected</span>
                            {' '}on {OLLAMA_URL}.<br />
                            Run <code style={{ color:T.sage }}>ollama serve</code> to enable model inference.
                          </>
                      }
                    </div>
                  </div>
                  <div style={{ ...mono, fontSize:'0.58rem',
                    color: ollamaRunning ? T.green : T.red,
                    border:`1px solid ${ollamaRunning ? T.green : T.red}50`,
                    borderRadius:3, padding:'3px 8px', flexShrink:0 }}>
                    {ollamaRunning ? 'SERVE ●' : 'OFFLINE'}
                  </div>
                </div>
              ) : isLoading ? (
                <div style={{ color:T.textMuted, fontSize:'0.65rem' }}>Loading…</div>
              ) : user && user.name ? (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                  <div>
                    <div style={{ fontSize:'0.72rem', color:T.text, fontWeight:600 }}>{user.name}</div>
                    <div style={{ fontSize:'0.6rem', color:T.textMuted, marginTop:2 }}>{user.email}</div>
                    <div style={{ display:'flex', gap:8, marginTop:8 }}>
                      {user.plan === 'free' && (
                        <button
                          onClick={() => window.open('https://ollama.com/upgrade','_blank')}
                          style={{ ...mono, fontSize:'0.62rem', padding:'4px 10px', borderRadius:4,
                            background:T.gold, color:T.black, border:'none', cursor:'pointer', fontWeight:700 }}
                        >
                          Upgrade
                        </button>
                      )}
                      <button
                        onClick={() => window.open('https://ollama.com/settings','_blank')}
                        style={{ ...mono, fontSize:'0.62rem', padding:'4px 10px', borderRadius:4,
                          background:'transparent', color:T.textMuted, border:`1px solid ${T.border}`, cursor:'pointer' }}
                      >
                        Manage
                      </button>
                      <button
                        onClick={() => disconnectUser()}
                        style={{ ...mono, fontSize:'0.62rem', padding:'4px 10px', borderRadius:4,
                          background:'transparent', color:T.red, border:`1px solid ${T.red}40`, cursor:'pointer' }}
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                  {user.avatarurl && (
                    <img src={user.avatarurl} alt={user.name}
                      style={{ width:40, height:40, borderRadius:'50%', border:`2px solid ${T.goldBorder}` }}
                      onError={e => { (e.target as HTMLImageElement).style.display='none'; }}
                    />
                  )}
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontSize:'0.72rem', color:T.text }}>Ollama Account</div>
                    <div style={{ fontSize:'0.6rem', color:T.textMuted, marginTop:2 }}>Not connected</div>
                  </div>
                  <button
                    onClick={handleConnectOllamaAccount}
                    disabled={isRefreshing || isAwaitingConnection}
                    style={{ ...mono, fontSize:'0.65rem', padding:'5px 14px', borderRadius:4,
                      background:T.gold, color:T.black, border:'none', cursor:'pointer', fontWeight:700,
                      opacity: (isRefreshing || isAwaitingConnection) ? 0.5 : 1 }}
                  >
                    {isRefreshing || isAwaitingConnection ? 'Connecting…' : 'Sign In'}
                  </button>
                </div>
              )}
              {connectionError && ollamaAvailable && (
                <div style={{ marginTop:10, padding:'8px 12px', background:`${T.red}18`,
                  border:`1px solid ${T.red}50`, borderRadius:4,
                  fontSize:'0.62rem', color:T.red }}>
                  {connectionError}
                </div>
              )}
            </div>
          </div>

          {/* ── 2. LOCAL CONFIGURATION ──────────────────────────────── */}
          <div style={sectionStyle}>
            <div style={sectionHeader}>
              <span style={{ color:T.gold, fontSize:'0.65rem', letterSpacing:'0.15em' }}>◈</span>
              <span style={{ fontSize:'0.68rem', fontWeight:700, color:T.gold, letterSpacing:'0.12em', textTransform:'uppercase' }}>
                Local Configuration
              </span>
            </div>

            {!ollamaAvailable && (
              <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}` }}>
                <div style={{ ...mono, fontSize:'0.62rem', color:T.textMuted }}>
                  ⚠ Ollama settings API unavailable — running in bare <code style={{color:T.sage}}>ollama serve</code> mode.
                  Archon configuration below is fully functional.
                </div>
              </div>
            )}

            {/* Cloud toggle */}
            {ollamaAvailable && (
            <div style={rowStyle}>
              <div>
                <div style={labelStyle}>Cloud</div>
                <div style={descStyle}>
                  {cloudOverriddenByEnv
                    ? 'Forced off by OLLAMA_NO_CLOUD environment variable.'
                    : 'Enable cloud models and web search.'}
                </div>
              </div>
              <Switch
                checked={!cloudDisabled}
                disabled={cloudToggleDisabled}
                onChange={checked => { if (!cloudOverriddenByEnv) updateCloudMutation.mutate(checked); }}
              />
            </div>
            )}

            {/* Auto-update */}
            {ollamaAvailable && (
            <div style={rowStyle}>
              <div>
                <div style={labelStyle}>Auto-download updates</div>
                <div style={descStyle}>Automatically download updates when available.</div>
              </div>
              <Switch
                checked={settings?.AutoUpdateEnabled ?? false}
                onChange={checked => handleChange('AutoUpdateEnabled', checked)}
              />
            </div>
            )}

            {/* Expose to network */}
            {ollamaAvailable && (
            <div style={rowStyle}>
              <div>
                <div style={labelStyle}>Expose Ollama to network</div>
                <div style={descStyle}>Allow other devices or services to access Ollama.</div>
              </div>
              <Switch
                checked={settings?.Expose ?? false}
                onChange={checked => handleChange('Expose', checked)}
              />
            </div>
            )}

            {/* Model directory */}
            {ollamaAvailable && (
            <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}` }}>
              <div style={labelStyle}>Model location</div>
              <div style={descStyle}>Directory where Ollama models are stored.</div>
              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                <input
                  value={settings?.Models ?? ''}
                  onChange={e => handleChange('Models', e.target.value)}
                  readOnly
                  style={{ ...inputStyle, flex:1 }}
                />
                <button
                  onClick={async () => {
                    if ((window as any).webview?.selectModelsDirectory) {
                      try {
                        const dir = await (window as any).webview.selectModelsDirectory();
                        if (dir) handleChange('Models', dir);
                      } catch { /* ignore */ }
                    }
                  }}
                  style={{ ...mono, fontSize:'0.62rem', padding:'4px 12px', borderRadius:4,
                    background:'transparent', color:T.textMuted, border:`1px solid ${T.border}`, cursor:'pointer' }}
                >
                  Browse
                </button>
              </div>
            </div>
            )}

            {/* Context length */}
            {ollamaAvailable && (
            <div style={{ padding:'10px 16px' }}>
              <div style={labelStyle}>Context length</div>
              <div style={descStyle}>
                How much conversation context local models retain. Higher = more memory used.
              </div>
              <div style={{ marginTop:10 }}>
                <Slider
                  value={settings?.ContextLength ?? defaultContextLength ?? 0}
                  onChange={value => handleChange('ContextLength', value)}
                  disabled={!defaultContextLength}
                  options={[
                    { value:4096,   label:'4k'   },
                    { value:8192,   label:'8k'   },
                    { value:16384,  label:'16k'  },
                    { value:32768,  label:'32k'  },
                    { value:65536,  label:'64k'  },
                    { value:131072, label:'128k' },
                    { value:262144, label:'256k' },
                  ]}
                />
              </div>
            </div>
            )}
          </div>

          {/* ── 3. AGENT MODE (conditional) ─────────────────────────── */}
          {(window as any).OLLAMA_TOOLS && (
            <div style={sectionStyle}>
              <div style={sectionHeader}>
                <span style={{ color:T.gold, fontSize:'0.65rem', letterSpacing:'0.15em' }}>◈</span>
                <span style={{ fontSize:'0.68rem', fontWeight:700, color:T.gold, letterSpacing:'0.12em', textTransform:'uppercase' }}>
                  Agent Mode
                </span>
              </div>
              <div style={rowStyle}>
                <div>
                  <div style={labelStyle}>Enable Agent Mode</div>
                  <div style={descStyle}>Multi-turn tool use to fulfill requests.</div>
                </div>
                <Switch checked={settings?.Agent ?? false} onChange={checked => handleChange('Agent', checked)} />
              </div>
              <div style={{ ...rowStyle, borderBottom:'none' }}>
                <div>
                  <div style={labelStyle}>Enable Tools Mode</div>
                  <div style={descStyle}>Single-turn tool use to fulfill requests.</div>
                </div>
                <Switch checked={settings?.Tools ?? false} onChange={checked => handleChange('Tools', checked)} />
              </div>
            </div>
          )}

          {/* ── 4. ARCHON NEXUS — AGENT MODEL ASSIGNMENT ────────────── */}
          <div style={sectionStyle}>
            <div style={sectionHeader}>
              <span style={{ color:T.gold, fontSize:'0.65rem', letterSpacing:'0.15em' }}>◈</span>
              <span style={{ fontSize:'0.68rem', fontWeight:700, color:T.gold, letterSpacing:'0.12em', textTransform:'uppercase' }}>
                Agent Model Assignment
              </span>
              <span style={{ fontSize:'0.58rem', color:T.textDim, marginLeft:'auto' }}>
                Stored locally · Applied on next request
              </span>
            </div>
            <div style={{ padding:'8px 0' }}>
              {availableModels.length === 0 && (
                <div style={{ padding:'8px 16px', fontSize:'0.62rem', color:T.textMuted }}>
                  No models found — ensure Ollama is running on {OLLAMA_URL}
                </div>
              )}
              {AGENTS_LIST.map((agent, idx) => (
                <div
                  key={agent.id}
                  style={{
                    display:'flex', alignItems:'center', gap:12,
                    padding:'8px 16px',
                    borderBottom: idx < AGENTS_LIST.length - 1 ? `1px solid ${T.border}` : 'none',
                  }}
                >
                  {/* Agent sigil + name */}
                  <div style={{ display:'flex', alignItems:'center', gap:7, minWidth:200 }}>
                    <span style={{ color:agent.color, fontSize:'0.65rem' }}>◈</span>
                    <div>
                      <div style={{ fontSize:'0.68rem', fontWeight:700, color:agent.color }}>
                        {agent.id}
                      </div>
                      <div style={{ fontSize:'0.56rem', color:T.textMuted, lineHeight:1.4 }}>
                        {agent.title}
                      </div>
                    </div>
                  </div>

                  {/* Model selector */}
                  <select
                    value={agentModels[agent.id] ?? ''}
                    onChange={e => setAgentModel(agent.id, e.target.value)}
                    style={{ ...selectStyle, flex:1, borderColor: agentModels[agent.id] ? `${agent.color}60` : T.border }}
                  >
                    <option value="">— use default model —</option>
                    {availableModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>

                  {/* Clear */}
                  {agentModels[agent.id] && (
                    <button
                      onClick={() => setAgentModel(agent.id, '')}
                      style={{ background:'transparent', border:'none', color:T.textDim,
                        cursor:'pointer', fontSize:'0.65rem', padding:'2px 6px', ...mono }}
                      title="Clear assignment"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── 5. DAEMON & BROWSER PROXY ───────────────────────────── */}
          <div style={sectionStyle}>
            <div style={sectionHeader}>
              <span style={{ color:T.teal, fontSize:'0.65rem', letterSpacing:'0.15em' }}>◈</span>
              <span style={{ fontSize:'0.68rem', fontWeight:700, color:T.teal, letterSpacing:'0.12em', textTransform:'uppercase' }}>
                Daemon & Services
              </span>
            </div>

            {/* Ollama URL */}
            <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}` }}>
              <div style={labelStyle}>Ollama endpoint</div>
              <div style={descStyle}>xDragon daemon and model inference URL.</div>
              <input
                value={daemonConfig.ollamaUrl ?? OLLAMA_URL}
                onChange={e => setDaemonField('ollamaUrl', e.target.value)}
                style={{ ...inputStyle, marginTop:8 }}
                placeholder={OLLAMA_URL}
              />
            </div>

            {/* Browse proxy URL */}
            <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}` }}>
              <div style={labelStyle}>Browse proxy endpoint</div>
              <div style={descStyle}>
                Camoufox stealth browser proxy (browse-proxy.js). Run: <code style={{ color:T.sage }}>node browse-proxy.js</code>
              </div>
              <input
                value={daemonConfig.browseProxyUrl ?? 'http://localhost:3001'}
                onChange={e => setDaemonField('browseProxyUrl', e.target.value)}
                style={{ ...inputStyle, marginTop:8 }}
                placeholder="http://localhost:3001"
              />
            </div>

            {/* DeerFlow URL */}
            <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}` }}>
              <div style={labelStyle}>DeerFlow endpoint</div>
              <div style={descStyle}>Deep research multi-agent server (Research Lab).</div>
              <input
                value={daemonConfig.deerflowUrl ?? 'http://localhost:8000'}
                onChange={e => setDaemonField('deerflowUrl', e.target.value)}
                style={{ ...inputStyle, marginTop:8 }}
                placeholder="http://localhost:8000"
              />
            </div>

            {/* Vault namespace */}
            <div style={{ padding:'10px 16px' }}>
              <div style={labelStyle}>Sovereign Vault namespace</div>
              <div style={descStyle}>pgvector namespace for shared agent memory.</div>
              <input
                value={daemonConfig.vaultNamespace ?? 'sovereign_vault'}
                onChange={e => setDaemonField('vaultNamespace', e.target.value)}
                style={{ ...inputStyle, marginTop:8 }}
                placeholder="sovereign_vault"
              />
            </div>
          </div>

          {/* ── 6. SOVEREIGN VAULT STATUS ───────────────────────────── */}
          <div style={sectionStyle}>
            <div style={sectionHeader}>
              <span style={{ color:T.sage, fontSize:'0.65rem', letterSpacing:'0.15em' }}>◈</span>
              <span style={{ fontSize:'0.68rem', fontWeight:700, color:T.sage, letterSpacing:'0.12em', textTransform:'uppercase' }}>
                Sovereign Vault
              </span>
              <span style={{ fontSize:'0.58rem', color:T.textDim, marginLeft:'auto' }}>
                pgvector memory substrate
              </span>
            </div>
            {AGENTS_LIST.map((agent, idx) => (
              <div key={agent.id} style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'7px 16px',
                borderBottom: idx < AGENTS_LIST.length - 1 ? `1px solid ${T.border}` : 'none',
                fontSize:'0.62rem',
              }}>
                <span style={{ color:agent.color, fontSize:'0.6rem' }}>◈</span>
                <span style={{ color:agent.color, fontWeight:700, minWidth:80 }}>{agent.id}</span>
                <span style={{ color:T.textDim, ...mono, fontSize:'0.58rem' }}>
                  {agent.id.toLowerCase()}_memory
                </span>
                {(agent.id === 'ARCHON' || agent.id === 'MODEBOLA') && (
                  <span style={{ marginLeft:'auto', color:T.gold, fontSize:'0.56rem',
                    border:`1px solid ${T.goldBorder}`, borderRadius:3, padding:'1px 6px' }}>
                    VAULT WRITE
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* ── 7. ARCHON BRIDGE — xDragon ↔ Archon WebSocket tunnel ── */}
          <div style={sectionStyle}>
            <div style={sectionHeader}>
              <span style={{ color:T.gold, fontSize:'0.65rem', letterSpacing:'0.15em' }}>◉</span>
              <span style={{ fontSize:'0.68rem', fontWeight:700, color:T.gold, letterSpacing:'0.12em', textTransform:'uppercase' }}>
                Archon Bridge
              </span>
              <span style={{ ...mono, fontSize:'0.56rem', marginLeft:12,
                color: tunnelStatusColor,
                border:`1px solid ${tunnelStatusColor}40`, borderRadius:3, padding:'1px 8px' }}>
                {tunnelStatus.toUpperCase()}
              </span>
              <span style={{ fontSize:'0.56rem', color:T.textDim, marginLeft:'auto' }}>
                {ARCHON_BACKEND_URL}
              </span>
            </div>

            {/* Gateway key */}
            <div style={{ padding:'12px 16px', borderBottom:`1px solid ${T.border}` }}>
              <div style={{ ...mono, fontSize:'0.64rem', color:T.text, marginBottom:3 }}>Gateway Key</div>
              <div style={{ ...mono, fontSize:'0.58rem', color:T.textMuted, marginBottom:8, lineHeight:1.6 }}>
                Shared secret between xDragon and Archon backend. Generate on the Archon dashboard
                and paste here. Required for agents to operate xDragon remotely.
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <input
                  type="password"
                  value={gatewayKey}
                  onChange={e => setGatewayKeyInput(e.target.value)}
                  placeholder="archon_gw_..."
                  style={{ ...inputStyle, flex:1 }}
                />
                <button onClick={saveGatewayKey}
                  style={{ ...mono, fontSize:'0.62rem', padding:'4px 14px', borderRadius:4,
                    background: T.goldDim, color:T.text, border:`1px solid ${T.gold}`, cursor:'pointer' }}>
                  {tunnelStatus === 'connected' ? '✓ Connected' : 'Connect'}
                </button>
                {tunnelStatus === 'connected' && (
                  <button onClick={() => tunnel.disconnect()}
                    style={{ ...mono, fontSize:'0.62rem', padding:'4px 12px', borderRadius:4,
                      background:'transparent', color:T.red, border:`1px solid ${T.red}40`, cursor:'pointer' }}>
                    Disconnect
                  </button>
                )}
              </div>
            </div>

            {/* What agents can do */}
            <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}` }}>
              <div style={{ ...mono, fontSize:'0.58rem', color:T.textMuted, marginBottom:8 }}>Agent Capabilities Registered</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {[
                  ['AYO',      'code.generate · code.review · code.deploy · gitfort.*',    '#c9a84c'],
                  ['ARIA',     'design.penpot.* · design.export',                          '#b04a9a'],
                  ['KENDRA',   'vault.store (marketing) · studio.navigate',                '#d4805a'],
                  ['MEI',      'vault.* · research.brief',                                 '#5ab0c8'],
                  ['KOFI',     'research.brief · services.report',                         '#4a8aba'],
                  ['TUNDE',    'legal.create_issue · legal.compliance_check',              '#8aaa60'],
                  ['MODEBOLA', 'vault.store · studio.navigate',                            '#9a7ab0'],
                  ['ARCHON',   'services.report · training.sync_to_archon · vault.*',      '#c9a84c'],
                ].map(([agent, caps, color]) => (
                  <div key={agent as string} style={{ background:T.surface3, border:`1px solid ${T.border}`,
                    borderLeft:`2px solid ${color as string}`, borderRadius:3, padding:'5px 10px', flex:1, minWidth:220 }}>
                    <div style={{ ...mono, fontSize:'0.58rem', color: color as string, fontWeight:700, marginBottom:2 }}>{agent}</div>
                    <div style={{ ...mono, fontSize:'0.52rem', color:T.textDim, lineHeight:1.6 }}>{caps}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Live tunnel log */}
            <div style={{ padding:'10px 16px' }}>
              <div style={{ ...mono, fontSize:'0.56rem', color:T.textMuted, marginBottom:6, display:'flex', justifyContent:'space-between' }}>
                <span>TUNNEL LOG</span>
                <button onClick={() => setTunnelLogs([])}
                  style={{ background:'transparent', border:'none', color:T.textDim, cursor:'pointer', ...mono, fontSize:'0.54rem' }}>
                  Clear
                </button>
              </div>
              <div style={{ background:T.black, borderRadius:4, padding:10, maxHeight:140, overflowY:'auto', border:`1px solid ${T.border}` }}>
                {tunnelLogs.length === 0 && (
                  <div style={{ ...mono, fontSize:'0.58rem', color:T.textDim }}>No activity yet...</div>
                )}
                {tunnelLogs.map((entry, i) => (
                  <div key={i} style={{ ...mono, fontSize:'0.58rem', lineHeight:1.8,
                    color: entry.level === 'success' ? '#4a9a6a' : entry.level === 'error' ? '#c05040' : entry.level === 'warn' ? '#c9a84c' : '#7a7060' }}>
                    <span style={{ color:'#3a3530' }}>[{new Date(entry.ts).toLocaleTimeString('en-GB',{hour12:false})}]</span>
                    {' '}<span style={{ color:'#4a8aba' }}>{entry.source}</span>
                    {' '}{entry.message}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── 8. SOVEREIGN VAULT DATABASE ───────────────────────────── */}
          <div style={sectionStyle}>
            <div style={sectionHeader}>
              <span style={{ color:T.sage, fontSize:'0.65rem', letterSpacing:'0.15em' }}>◈</span>
              <span style={{ fontSize:'0.68rem', fontWeight:700, color:T.sage, letterSpacing:'0.12em', textTransform:'uppercase' }}>
                Sovereign Vault
              </span>
              <span style={{ fontSize:'0.56rem', color:T.textDim, marginLeft:'auto' }}>
                {vaultMeta.totalEntries} entries · {vaultMeta.lastIndexed ? `indexed ${new Date(vaultMeta.lastIndexed).toLocaleDateString('en-GB')}` : 'not indexed'}
              </span>
            </div>

            {/* Category counts */}
            <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}` }}>
              <div style={{ ...mono, fontSize:'0.56rem', color:T.textMuted, marginBottom:8 }}>STORED ENTRIES BY CATEGORY</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:6 }}>
                {(Object.entries(vaultMeta.categories) as [string, number][]).map(([cat, count]) => (
                  <div key={cat} style={{ background:T.surface3, borderRadius:3, padding:'5px 8px', textAlign:'center' }}>
                    <div style={{ ...mono, fontSize:'0.72rem', fontWeight:700, color: count > 0 ? T.sage : T.textDim }}>{count}</div>
                    <div style={{ ...mono, fontSize:'0.46rem', color:T.textDim, textTransform:'uppercase', letterSpacing:'0.08em' }}>{cat}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Supabase config */}
            <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}` }}>
              <div style={{ ...mono, fontSize:'0.62rem', color:T.text, marginBottom:3 }}>Supabase (pgvector remote sync)</div>
              <div style={{ ...mono, fontSize:'0.56rem', color:T.textMuted, marginBottom:8, lineHeight:1.6 }}>
                When configured, vault entries sync to Supabase for semantic search and cross-device access.
                Create a <code style={{ color:T.sage }}>vault_entries</code> table in your Supabase project.
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <div>
                  <label style={{ ...mono, fontSize:'0.52rem', color:T.textMuted, display:'block', marginBottom:3 }}>Project URL</label>
                  <input value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)}
                    placeholder="https://xxx.supabase.co" style={{ ...inputStyle }} />
                </div>
                <div>
                  <label style={{ ...mono, fontSize:'0.52rem', color:T.textMuted, display:'block', marginBottom:3 }}>Service Role Key</label>
                  <input type="password" value={supabaseKey} onChange={e => setSupabaseKey(e.target.value)}
                    placeholder="eyJhbGci..." style={{ ...inputStyle }} />
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={saveSupabaseConfig}
                  style={{ ...mono, fontSize:'0.62rem', padding:'4px 12px', borderRadius:4,
                    background:T.goldDim, color:T.text, border:`1px solid ${T.gold}`, cursor:'pointer' }}>
                  Save Supabase Config
                </button>
                <button onClick={() => { SovereignVault.index().then(() => setVaultMeta(SovereignVault.getMeta())); }}
                  style={{ ...mono, fontSize:'0.62rem', padding:'4px 12px', borderRadius:4,
                    background:'transparent', color:T.teal, border:`1px solid ${T.teal}40`, cursor:'pointer' }}>
                  Sync & Index Vault
                </button>
                <button onClick={() => {
                  const data = SovereignVault.export();
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(new Blob([data], { type:'application/json' }));
                  a.download = `sovereign-vault-${Date.now()}.json`;
                  a.click();
                }}
                  style={{ ...mono, fontSize:'0.62rem', padding:'4px 12px', borderRadius:4,
                    background:'transparent', color:T.textMuted, border:`1px solid ${T.border}`, cursor:'pointer' }}>
                  Export JSON
                </button>
              </div>
            </div>

            {/* Agent memory namespaces */}
            <div style={{ padding:'8px 0' }}>
              {AGENTS_LIST.map((agent, idx) => (
                <div key={agent.id} style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding:'7px 16px',
                  borderBottom: idx < AGENTS_LIST.length - 1 ? `1px solid ${T.border}` : 'none',
                  fontSize:'0.62rem',
                }}>
                  <span style={{ color:agent.color, fontSize:'0.6rem' }}>◈</span>
                  <span style={{ color:agent.color, fontWeight:700, minWidth:80 }}>{agent.id}</span>
                  <span style={{ color:T.textDim, ...mono, fontSize:'0.58rem' }}>
                    vault:training:{agent.id.toLowerCase()} · vault:memory:{agent.id.toLowerCase()}
                  </span>
                  {(agent.id === 'ARCHON' || agent.id === 'MODEBOLA') && (
                    <span style={{ marginLeft:'auto', color:T.gold, fontSize:'0.56rem',
                      border:`1px solid ${T.goldBorder}`, borderRadius:3, padding:'1px 6px' }}>
                      VAULT WRITE
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Reset ───────────────────────────────────────────────── */}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:8, paddingBottom:32 }}>
            <button
              onClick={() => {
                localStorage.removeItem('archon_agent_models');
                localStorage.removeItem('archon_daemon_config');
                setAgentModels({});
                setDaemonConfigState({});
                tunnel.disconnect();
                setGatewayKeyInput('');
                setVaultMeta(SovereignVault.getMeta());
              }}
              style={{ ...mono, fontSize:'0.62rem', padding:'5px 14px', borderRadius:4,
                background:'transparent', color:T.red, border:`1px solid ${T.red}40`, cursor:'pointer' }}
            >
              Reset Archon config
            </button>
            <button
              onClick={() => { SovereignVault.clearLocal(); setVaultMeta(SovereignVault.getMeta()); }}
              style={{ ...mono, fontSize:'0.62rem', padding:'5px 14px', borderRadius:4,
                background:'transparent', color:T.red, border:`1px solid ${T.red}30`, cursor:'pointer' }}
            >
              Clear Vault (local)
            </button>
            <button
              onClick={handleResetToDefaults}
              style={{ ...mono, fontSize:'0.62rem', padding:'5px 14px', borderRadius:4,
                background:'transparent', color:T.textMuted, border:`1px solid ${T.border}`, cursor:'pointer' }}
            >
              Reset Ollama defaults
            </button>
          </div>

        </div>

        {/* Saved toast */}
        {(showSaved || restartMessage) && (
          <div style={{ position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)',
            background:T.green, color:T.black, borderRadius:4, padding:'5px 16px',
            fontSize:'0.68rem', fontWeight:700, ...mono, zIndex:9999 }}>
            ✓ Saved
          </div>
        )}
      </div>
    </main>
  );
}