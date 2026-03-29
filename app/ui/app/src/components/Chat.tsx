import MessageList from "./MessageList";
import ChatForm from "./ChatForm";
import { FileUpload } from "./FileUpload";
import { DisplayUpgrade } from "./DisplayUpgrade";
import { DisplayStale } from "./DisplayStale";
import { DisplayLogin } from "./DisplayLogin";
import {
  useChat,
  useSendMessage,
  useIsStreaming,
  useIsWaitingForLoad,
  useDownloadProgress,
  useChatError,
  useShouldShowStaleDisplay,
  useDismissStaleModel,
} from "@/hooks/useChats";
import { useHealth } from "@/hooks/useHealth";
import { useMessageAutoscroll } from "@/hooks/useMessageAutoscroll";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useSelectedModel } from "@/hooks/useSelectedModel";
import { useUser } from "@/hooks/useUser";
import { useHasVisionCapability } from "@/hooks/useModelCapabilities";
import { Message } from "@/gotypes";

// ============================================================
//  Design tokens — sovereign dark gold
// ============================================================
const T = {
  gold:       '#c9a84c',
  goldDim:    '#6b5820',
  goldBorder: '#3a3020',
  black:      '#080808',
  surface:    '#0f0f0f',
  surface2:   '#161616',
  surface3:   '#202020',
  border:     '#282420',
  text:       '#f0ead8',
  textMuted:  '#7a7060',
  textDim:    '#3a3530',
  green:      '#4a9a6a',
  red:        '#c05040',
  teal:       '#5ab0c8',
  blue:       '#4a8aba',
  purple:     '#9a7ab0',
  orange:     '#d4805a',
  sage:       '#8aaa60',
} as const;

const mono: React.CSSProperties = {
  fontFamily: '"Menlo", "Monaco", "Consolas", monospace',
};

// ============================================================
//  Agent registry — mirrors super7.js
// ============================================================
interface AgentDef {
  id:     string;
  name:   string;
  title:  string;
  accent: string;
  sigil:  string;
  module: string;
}

const AGENTS: AgentDef[] = [
  { id:'archon',   name:'ARCHON',   title:'Digital CEO',               accent:T.gold,   sigil:'◈', module:'integration'  },
  { id:'modebola', name:'MODEBOLA', title:'Chief of Staff',            accent:T.purple, sigil:'◆', module:'integration'  },
  { id:'ayo',      name:'AYO',      title:'CTO & Head of Engineering', accent:T.gold,   sigil:'◈', module:'code_studio'  },
  { id:'kofi',     name:'KOFI',     title:'Chief Economist & CFO',     accent:T.blue,   sigil:'◎', module:'research_lab' },
  { id:'mei',      name:'MEI',      title:'Chief BI Officer',          accent:T.teal,   sigil:'◎', module:'research_lab' },
  { id:'aria',     name:'ARIA',     title:'Chief Creative Officer',    accent:T.purple, sigil:'◆', module:'design_studio'},
  { id:'kendra',   name:'KENDRA',   title:'Chief Growth Officer',      accent:T.orange, sigil:'◆', module:'design_studio'},
  { id:'tunde',    name:'TUNDE',    title:'Chief Legal Counsel',       accent:T.sage,   sigil:'◎', module:'legal_desk'   },
];

const MODULE_META: Record<string, { label:string; accent:string; agents:string[] }> = {
  code_studio:   { label:'Code Studio',    accent:T.gold,   agents:['AYO']                },
  research_lab:  { label:'Research Lab',   accent:T.blue,   agents:['KOFI','MEI','TUNDE'] },
  design_studio: { label:'Design Studio',  accent:T.purple, agents:['ARIA','KENDRA']       },
  integration:   { label:'Integration Hub',accent:T.red,    agents:['ARCHON','MODEBOLA']   },
  services:      { label:'Services',       accent:T.green,  agents:['AYO','ARCHON']        },
  legal_desk:    { label:'Legal Desk',     accent:T.sage,   agents:['TUNDE','MODEBOLA']    },
};

// Quick missions per module
const MODULE_MISSIONS: Record<string, string[]> = {
  code_studio:   [
    'Build a REST API endpoint in TypeScript',
    'Audit this function for security vulnerabilities',
    'Write unit tests with full coverage',
    'Refactor: extract service layer from controller',
  ],
  research_lab:  [
    'Analyse market sizing for a fintech product in West Africa',
    'Compare regulatory frameworks: Nigeria vs Kenya',
    'Build a competitive landscape report for this sector',
    'DeerFlow: run deep research on this topic',
  ],
  design_studio: [
    'Create a brand identity brief for a new product',
    'Write go-to-market landing page copy',
    'Generate user personas for our target segment',
    'Build a product positioning statement',
  ],
  integration:   [
    'Orchestrate a full mission across all agents',
    'Review and summarise all active Blueprint phases',
    'Generate an executive briefing from today\'s outputs',
    'Sync: consolidate findings into Sovereign Vault',
  ],
  services:      [
    'Audit all running services and report status',
    'Design deployment pipeline for this project',
    'Generate a Dockerfile for this service',
    'Write a production incident response runbook',
  ],
  legal_desk:    [
    'Review this contract for key risk clauses',
    'Summarise regulatory obligations for our sector',
    'Draft a data processing agreement outline',
    'Run compliance checklist on this proposal',
  ],
};


// ============================================================
//  Streaming cursor
// ============================================================
function StreamingCursor() {
  return (
    <span className="animate-pulse inline-block" style={{ color: T.gold, marginLeft: 2, fontWeight: 700 }}>
      ▌
    </span>
  );
}

// ============================================================
//  Module banner — thin persistent strip at top
// ============================================================
function ModuleBanner({ moduleId }: { moduleId: string }) {
  const meta = MODULE_META[moduleId];
  if (!meta) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '5px 16px',
      background: T.surface,
      borderBottom: `1px solid ${meta.accent}33`,
      flexShrink: 0,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.accent, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ ...mono, fontSize: '0.56rem', letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: meta.accent }}>
        {meta.label}
      </span>
      <span style={{ ...mono, fontSize: '0.52rem', color: T.textDim }}>·</span>
      <span style={{ ...mono, fontSize: '0.54rem', color: T.textDim, letterSpacing: '0.1em' }}>
        {meta.agents.join(' · ')}
      </span>
      <div style={{ flex: 1 }} />
      <span style={{ ...mono, fontSize: '0.5rem', letterSpacing: '0.14em', color: T.textDim, textTransform: 'uppercase' as const }}>
        ◈ ARCHON SUPERVISED
      </span>
    </div>
  );
}

// ============================================================
//  Agent status bar — visible only while streaming
// ============================================================
function AgentStatusBar({ moduleId, agentId }: { moduleId?: string; agentId?: string }) {
  const agent  = AGENTS.find(a => a.id === agentId) ?? AGENTS.find(a => a.module === moduleId) ?? AGENTS[0];
  const meta   = moduleId ? MODULE_META[moduleId] : null;
  const accent = meta?.accent ?? agent.accent;
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 flex-shrink-0"
      style={{ background: T.surface, borderBottom: `1px solid ${accent}44` }}>
      <span className="animate-pulse" style={{ color: accent, fontSize: '0.72rem', flexShrink: 0, fontWeight: 700 }}>
        {agent.sigil}
      </span>
      <span style={{ ...mono, fontSize: '0.6rem', color: accent, letterSpacing: '0.14em', textTransform: 'uppercase' as const }}>
        {agent.name}
      </span>
      <span style={{ ...mono, fontSize: '0.54rem', color: T.textDim }}>·</span>
      <span style={{ ...mono, fontSize: '0.54rem', color: T.textMuted, letterSpacing: '0.06em' }}>
        {agent.title}
      </span>
      <StreamingCursor />
    </div>
  );
}


// ============================================================
//  Welcome screen
// ============================================================
function WelcomeScreen({
  moduleId,
  onMission,
  isHealthy,
}: {
  moduleId?: string;
  onMission: (text: string) => void;
  isHealthy: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const activeMeta = moduleId ? MODULE_META[moduleId] : null;
  const missions   = MODULE_MISSIONS[moduleId ?? ''] ?? MODULE_MISSIONS.integration;
  const accent     = activeMeta?.accent ?? T.gold;

  return (
    <div className="flex flex-col items-center justify-center h-full select-none"
      style={{ background: T.black, padding: '0 24px 80px' }}>

      {/* Brand mark */}
      <div className="flex flex-col items-center mb-8" style={{ textAlign: 'center' }}>
        <div style={{ ...mono, fontSize: '0.52rem', letterSpacing: '0.36em', color: T.goldDim,
          textTransform: 'uppercase' as const, marginBottom: 8 }}>
          ARCHON NEXUS
        </div>
        <h1 style={{ fontFamily: '"Georgia", serif', fontSize: '2.2rem', fontWeight: 700,
          color: T.gold, letterSpacing: '0.03em', lineHeight: 1, marginBottom: 12 }}>
          xDragon Studio
        </h1>

        {activeMeta ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, display: 'inline-block' }} />
            <span style={{ ...mono, fontSize: '0.68rem', color: accent, letterSpacing: '0.12em',
              textTransform: 'uppercase' as const }}>
              {activeMeta.label}
            </span>
            <span style={{ ...mono, fontSize: '0.56rem', color: T.textDim }}>·</span>
            <span style={{ ...mono, fontSize: '0.6rem', color: T.textMuted, letterSpacing: '0.06em' }}>
              {activeMeta.agents.join(' + ')}
            </span>
          </div>
        ) : (
          <p style={{ ...mono, fontSize: '0.68rem', color: T.textMuted, letterSpacing: '0.08em' }}>
            Your sovereign AI execution engine
          </p>
        )}
      </div>

      {/* Agent roster (only when no module active) */}
      {!moduleId && (
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {AGENTS.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '4px 11px',
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 4,
            }}>
              <span style={{ ...mono, fontSize: '0.6rem', color: a.accent, fontWeight: 700 }}>{a.sigil}</span>
              <span style={{ ...mono, fontSize: '0.62rem', color: T.text }}>{a.name}</span>
              <span style={{ ...mono, fontSize: '0.52rem', color: T.textDim, letterSpacing: '0.04em' }}>
                {a.title.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Quick-mission launcher */}
      <div style={{ width: '100%', maxWidth: 560, marginBottom: 12 }}>
        <div style={{ ...mono, fontSize: '0.48rem', letterSpacing: '0.24em', textTransform: 'uppercase' as const,
          color: T.textDim, marginBottom: 8, textAlign: 'center' }}>
          Quick missions
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {missions.map((m, i) => (
            <button key={i} onClick={() => onMission(m)}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px',
                background: hovered === i ? T.surface2 : T.surface,
                border: `1px solid ${hovered === i ? accent + '66' : T.border}`,
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'all 0.12s',
                textAlign: 'left',
              }}>
              <span style={{ ...mono, fontSize: '0.6rem', color: accent, flexShrink: 0,
                opacity: hovered === i ? 1 : 0.4 }}>→</span>
              <span style={{ ...mono, fontSize: '0.72rem',
                color: hovered === i ? T.text : T.textMuted, lineHeight: 1.4 }}>{m}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Engine status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: isHealthy ? T.green : T.red,
          display: 'inline-block',
          boxShadow: isHealthy ? `0 0 7px ${T.green}99` : 'none',
        }} />
        <span style={{ ...mono, fontSize: '0.54rem', letterSpacing: '0.16em',
          color: T.textDim, textTransform: 'uppercase' as const }}>
          {isHealthy ? 'Engine online — assign a mission' : 'Engine offline — check Ollama'}
        </span>
      </div>

      {/* Sovereign badge */}
      <div style={{
        ...mono, fontSize: '0.5rem', letterSpacing: '0.2em',
        textTransform: 'uppercase' as const,
        padding: '3px 10px',
        border: `1px solid ${T.goldBorder}`,
        borderRadius: 3,
        color: T.goldDim,
        background: T.surface,
        marginTop: 12,
      }}>
        ◈ ARCHON SUPERVISED · 8 AGENTS · Alpha S7
      </div>
    </div>
  );
}

// ============================================================
//  Download progress bar
// ============================================================
function DownloadBar({ percent }: { percent: number }) {
  return (
    <div style={{ padding: '8px 16px 2px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ ...mono, fontSize: '0.56rem', color: T.textMuted, letterSpacing: '0.1em' }}>
          ⟳ Pulling model…
        </span>
        <span style={{ ...mono, fontSize: '0.56rem', color: T.gold }}>{percent}%</span>
      </div>
      <div style={{ height: 2, background: T.border, borderRadius: 1, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${percent}%`,
          background: T.gold, borderRadius: 1,
          transition: 'width 0.3s ease',
          boxShadow: `0 0 8px ${T.gold}66`,
        }} />
      </div>
    </div>
  );
}

// ============================================================
//  Loading state
// ============================================================
function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full" style={{ background: T.black }}>
      <div className="flex flex-col items-center gap-3">
        <div style={{ ...mono, fontSize: '0.56rem', letterSpacing: '0.3em', color: T.goldDim,
          textTransform: 'uppercase' as const }}>
          ARCHON NEXUS
        </div>
        <div style={{ ...mono, fontSize: '0.72rem', color: T.textMuted, letterSpacing: '0.1em' }}>
          Loading<span className="animate-pulse">...</span>
        </div>
      </div>
    </div>
  );
}


// ============================================================
//  Main Chat component
// ============================================================
export default function Chat({ chatId }: { chatId: string }) {
  const queryClient = useQueryClient();
  const navigate    = useNavigate();

  // Read module context from ?module= URL param if available
  let moduleId: string | undefined;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const search = useSearch({ strict: false }) as Record<string, string>;
    moduleId = search?.module ?? undefined;
  } catch {
    moduleId = undefined;
  }

  const chatQuery      = useChat(chatId === "new" ? "" : chatId);
  const chatErrorQuery = useChatError(chatId === "new" ? "" : chatId);
  const { selectedModel }      = useSelectedModel(chatId);
  const { user }               = useUser();
  const hasVisionCapability    = useHasVisionCapability(selectedModel?.model);
  const shouldShowStaleDisplay = useShouldShowStaleDisplay(selectedModel);
  const dismissStaleModel      = useDismissStaleModel();
  const { isHealthy }          = useHealth();

  const [editingMessage, setEditingMessage] = useState<{
    content: string;
    index: number;
    originalMessage: Message;
  } | null>(null);

  // Derive active agent from model name or module
  const activeAgentId = useMemo(() => {
    const m = selectedModel?.model?.toLowerCase() ?? '';
    if (m.includes('ayo') || m.includes('code'))    return 'ayo';
    if (m.includes('kofi') || m.includes('econ'))   return 'kofi';
    if (m.includes('aria') || m.includes('design')) return 'aria';
    if (m.includes('tunde') || m.includes('legal')) return 'tunde';
    if (m.includes('modebola'))                     return 'modebola';
    if (m.includes('mei'))                          return 'mei';
    if (m.includes('kendra'))                       return 'kendra';
    const primaryName = moduleId ? MODULE_META[moduleId]?.agents[0]?.toLowerCase() : undefined;
    return AGENTS.find(a => a.name.toLowerCase() === primaryName)?.id ?? 'archon';
  }, [selectedModel, moduleId]);

  const prevChatIdRef   = useRef<string>(chatId);
  const chatFormCallbackRef = useRef<
    | ((files: Array<{ filename: string; data: Uint8Array; type?: string }>,
        errors: Array<{ filename: string; error: string }>) => void)
    | null
  >(null);

  const handleFilesReceived = useCallback(
    (callback: (files: Array<{ filename: string; data: Uint8Array; type?: string }>,
                errors: Array<{ filename: string; error: string }>) => void) => {
      chatFormCallbackRef.current = callback;
    }, [],
  );

  const handleFilesProcessed = useCallback(
    (files: Array<{ filename: string; data: Uint8Array; type?: string }>,
     errors: Array<{ filename: string; error: string }> = []) => {
      chatFormCallbackRef.current?.(files, errors);
    }, [],
  );

  const allMessages       = chatQuery?.data?.chat?.messages ?? [];
  const browserToolResult = chatQuery?.data?.chat?.browser_state;
  const chatError         = chatErrorQuery.data;
  const messages          = allMessages;

  const isStreaming        = useIsStreaming(chatId);
  const isWaitingForLoad   = useIsWaitingForLoad(chatId);
  const downloadProgress   = useDownloadProgress(chatId);
  const isDownloadingModel = downloadProgress && !downloadProgress.done;
  const isDisabled         = !isHealthy;

  useEffect(() => { setEditingMessage(null); }, [chatId]);

  const sendMessageMutation = useSendMessage(chatId);
  const { containerRef, handleNewUserMessage, spacerHeight } =
    useMessageAutoscroll({ messages, isStreaming, chatId });

  useLayoutEffect(() => {
    if (prevChatIdRef.current !== chatId && containerRef.current && messages.length > 0 && chatId !== "new") {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    prevChatIdRef.current = chatId;
  }, [chatId, messages.length]);

  const handleChatFormSubmit = (
    message: string,
    options: {
      attachments?: Array<{ filename: string; data: Uint8Array }>;
      index?: number;
      webSearch?: boolean;
      fileTools?: boolean;
      think?: boolean | string;
    },
  ) => {
    sendMessageMutation.reset();
    if (chatError) clearChatError();
    const allAttachments = (options.attachments || []).map(att => ({
      filename: att.filename,
      data: att.data.length === 0 ? new Uint8Array(0) : att.data,
    }));
    sendMessageMutation.mutate({
      message,
      attachments: allAttachments,
      index:     editingMessage ? editingMessage.index : options.index,
      webSearch: options.webSearch,
      fileTools: options.fileTools,
      think:     options.think,
      onChatEvent: (event) => {
        if (event.eventName === "chat_created" && event.chatId) {
          navigate({ to: "/c/$chatId", params: { chatId: event.chatId } });
        }
      },
    });
    setEditingMessage(null);
    handleNewUserMessage();
  };

  // Quick-mission handler: submits text immediately as a new chat message
  const handleMission = useCallback((text: string) => {
    handleChatFormSubmit(text, {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEditMessage = (content: string, index: number) => {
    setEditingMessage({ content, index, originalMessage: messages[index] });
  };
  const handleCancelEdit = () => {
    setEditingMessage(null);
    if (chatError) clearChatError();
  };
  const clearChatError = () => {
    queryClient.setQueryData(["chatError", chatId === "new" ? "" : chatId], null);
  };

  const isWindows   = navigator.platform.toLowerCase().includes("win");
  const activeAgent = AGENTS.find(a => a.id === activeAgentId) ?? AGENTS[0];
  const activeMeta  = moduleId ? MODULE_META[moduleId] : null;
  const agentAccent = activeMeta?.accent ?? activeAgent.accent;

  // Download percent helper
  const dlPercent = downloadProgress?.total
    ? Math.round(((downloadProgress.completed ?? 0) / downloadProgress.total) * 100)
    : 0;

  // ============================================================
  //  Render
  // ============================================================
  return chatId === "new" || chatQuery ? (
    <FileUpload
      onFilesAdded={handleFilesProcessed}
      selectedModel={selectedModel}
      hasVisionCapability={hasVisionCapability}
    >
      {chatId === "new" ? (
        /* ━━━ New chat ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        <div className="flex flex-col h-screen relative" style={{ background: T.black }}>
          {moduleId && <ModuleBanner moduleId={moduleId} />}
          <div className="flex-1 min-h-0">
            <WelcomeScreen moduleId={moduleId} onMission={handleMission} isHealthy={isHealthy} />
          </div>
          <div className="flex-shrink-0 px-6 pb-8"
            style={{ background: `linear-gradient(to top, ${T.black} 75%, transparent)` }}>
            <ChatForm
              hasMessages={false}
              onSubmit={handleChatFormSubmit}
              chatId={chatId}
              autoFocus={true}
              editingMessage={editingMessage}
              onCancelEdit={handleCancelEdit}
              isDownloadingModel={isDownloadingModel}
              isDisabled={isDisabled}
              onFilesReceived={handleFilesReceived}
            />
          </div>
        </div>
      ) : (
        /* ━━━ Active chat ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        <main
          className="flex h-screen w-full flex-col relative allow-context-menu select-none"
          style={{ background: T.black }}
        >
          {/* Persistent module banner */}
          {moduleId && <ModuleBanner moduleId={moduleId} />}

          {/* Agent streaming bar — visible only while responding */}
          {isStreaming && <AgentStatusBar moduleId={moduleId} agentId={activeAgentId} />}

          {/* Message list */}
          <section
            key={chatId}
            ref={containerRef}
            className={`flex-1 overflow-y-auto overscroll-contain relative min-h-0 select-none ${isWindows ? "xl:pt-4" : "xl:pt-8"}`}
            style={{ background: T.black }}
          >
            <MessageList
              messages={messages}
              spacerHeight={spacerHeight}
              isWaitingForLoad={isWaitingForLoad}
              isStreaming={isStreaming}
              downloadProgress={downloadProgress}
              onEditMessage={(content: string, index: number) => handleEditMessage(content, index)}
              editingMessageIndex={editingMessage?.index}
              error={chatError}
              browserToolResult={browserToolResult}
            />
          </section>

          {/* Sticky bottom */}
          <div className="flex-shrink-0 sticky bottom-0 z-20"
            style={{ background: `linear-gradient(to top, ${T.black} 70%, transparent)` }}>

            {/* Download bar */}
            {isDownloadingModel && <DownloadBar percent={dlPercent} />}

            {/* Stale model */}
            {selectedModel && shouldShowStaleDisplay && (
              <div className="pb-2 px-4">
                <DisplayStale
                  model={selectedModel}
                  onDismiss={() => dismissStaleModel(selectedModel?.model || "")}
                  chatId={chatId}
                  onScrollToBottom={() => containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" })}
                />
              </div>
            )}

            {/* Usage limit */}
            {chatError && chatError.code === "usage_limit_upgrade" && (
              <div className="pb-2 px-4">
                <DisplayUpgrade
                  error={chatError}
                  onDismiss={clearChatError}
                  href={user?.plan === "pro" ? "https://ollama.com/settings/billing" : "https://ollama.com/upgrade"}
                />
              </div>
            )}

            {/* Auth error */}
            {chatError && chatError.code === "cloud_unauthorized" && (
              <div className="pb-2 px-4">
                <DisplayLogin error={chatError} />
              </div>
            )}

            {/* Active agent identity strip (non-streaming) */}
            {!isStreaming && messages.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 16px 0' }}>
                <span style={{ ...mono, fontSize: '0.5rem', color: agentAccent, letterSpacing: '0.12em',
                  textTransform: 'uppercase' as const }}>
                  {activeAgent.sigil} {activeAgent.name}
                </span>
                <span style={{ ...mono, fontSize: '0.48rem', color: T.textDim }}>
                  {activeAgent.title}
                </span>
              </div>
            )}

            {/* Chat form */}
            <ChatForm
              hasMessages={messages.length > 0}
              onSubmit={handleChatFormSubmit}
              chatId={chatId}
              autoFocus={true}
              editingMessage={editingMessage}
              onCancelEdit={handleCancelEdit}
              isDisabled={isDisabled}
              isDownloadingModel={isDownloadingModel}
              onFilesReceived={handleFilesReceived}
            />
          </div>
        </main>
      )}
    </FileUpload>
  ) : (
    <LoadingState />
  );
}
