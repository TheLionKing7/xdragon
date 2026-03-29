import { useChats } from "@/hooks/useChats";
import { useRenameChat } from "@/hooks/useRenameChat";
import { useDeleteChat } from "@/hooks/useDeleteChat";
import { useQueryClient } from "@tanstack/react-query";
import { getChat } from "@/api";
import { Link } from "@/components/ui/link";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ChatsResponse } from "@/gotypes";
import xDragonLogo from "@/assets/xdragon-logo.png";

// ============================================================
//  ARCHON NEXUS — xDragon Sidebar  (Updated: Security + all modules)
// ============================================================
const T = {
  gold: '#c9a84c', goldDim: '#6b5820', goldBorder: '#3a3020',
  black: '#080808', surface: '#0f0f0f', surface2: '#161616', surface3: '#202020',
  border: '#282420', text: '#f0ead8', textMuted: '#7a7060', textDim: '#3a3530',
} as const;

const mono: React.CSSProperties = {
  fontFamily: '"Menlo","Monaco","Consolas",monospace',
};

const DEBUG_SHIFT_CLICKS_REQUIRED = 5;
const DEBUG_SHIFT_CLICK_WINDOW_MS = 7000;

interface NavModule { id: string; name: string; agents: string; href: string; accent: string; Icon: () => React.ReactNode; }

const IconCode = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
    <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
  </svg>
);

const IconResearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const IconDesign = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <circle cx="11" cy="11" r="2" />
  </svg>
);

const IconIntegration = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
    <path d="M12 2v20M2 12h20" />
  </svg>
);

const IconServices = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
    <rect x="2" y="2" width="20" height="8" rx="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" />
    <line x1="6" y1="6" x2="6" y2="6" />
    <line x1="6" y1="18" x2="6" y2="18" />
  </svg>
);

const IconLegal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
    <path d="M12 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M16 3h5v5M10 14L21 3" />
  </svg>
);

const IconTraining = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

const IconSecurity = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const IconNewChat = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}>
    <path d="M12 4a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H5a1 1 0 110-2h6V5a1 1 0 011-1z" />
  </svg>
);

// ── xDragon brand logo ─────────────────────────────────────────────
const XDragonBrandMark = () => (
  <img
    src={xDragonLogo}
    alt="xDragon Studio"
    style={{ width: 40, height: 40, flexShrink: 0, objectFit: 'contain' }}
  />
);

const MODULES: NavModule[] = [
  { id: 'code_studio',  name: 'Code Studio',     agents: 'AYO',                         href: '/playground?module=code_studio',  accent: '#c9a84c', Icon: IconCode },
  { id: 'research_lab', name: 'Research Lab',     agents: 'KOFI · MEI · TUNDE',          href: '/playground?module=research_lab', accent: '#4a9aba', Icon: IconResearch },
  { id: 'design_studio',name: 'Design Studio',    agents: 'ARIA · KENDRA',                href: '/playground?module=design_studio',accent: '#b04a9a', Icon: IconDesign },
  { id: 'integration',  name: 'Integration Hub',  agents: 'MODEBOLA · ARCHON · AYO',     href: '/playground?module=integration',  accent: '#9a7ab0', Icon: IconIntegration },
  { id: 'services',     name: 'Services',          agents: 'AYO · ARCHON',                href: '/playground?module=services',     accent: '#4a9a6a', Icon: IconServices },
  { id: 'security',     name: 'Security',          agents: 'ARCHON',                      href: '/playground?module=security',     accent: '#c05040', Icon: IconSecurity },
  { id: 'legal_desk',   name: 'Legal Desk',        agents: 'TUNDE · MODEBOLA',            href: '/playground?module=legal_desk',   accent: '#8aaa60', Icon: IconLegal },
  { id: 'training',     name: 'Training Studio',   agents: 'ARCHON · AYO · KOFI',         href: '/playground?module=training',     accent: '#c9a84c', Icon: IconTraining },
];

interface ChatSidebarProps { currentChatId?: string; }

export function ChatSidebar({ currentChatId }: ChatSidebarProps) {
  const { data, isLoading, error } = useChats();
  const queryClient = useQueryClient();
  const renameMutation = useRenameChat();
  const deleteMutation = useDeleteChat();
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [shiftClicks, setShiftClicks] = useState<Record<string, number[]>>({});
  const [copiedChatId, setCopiedChatId] = useState<string | null>(null);

  const handleMouseEnter = useCallback((chatId: string) => {
    queryClient.prefetchQuery({ queryKey: ["chat", chatId], queryFn: () => getChat(chatId), staleTime: 1500 });
  }, [queryClient]);

  const startEditing = useCallback((chatId: string, currentTitle: string) => {
    setEditingChatId(chatId);
    setEditValue(currentTitle);
  }, []);

  const saveRename = useCallback(async () => {
    if (!editingChatId || !editValue.trim()) { setEditingChatId(null); return; }
    const newTitle = editValue.trim();
    const chatId = editingChatId;
    setEditingChatId(null);
    setEditValue("");
    queryClient.setQueryData(["chats"], (oldData: ChatsResponse | undefined) => {
      if (!oldData?.chatInfos) return oldData;
      return { ...oldData, chatInfos: oldData.chatInfos.map(c => c.id === chatId ? { ...c, title: newTitle } : c) };
    });
    try {
      await renameMutation.mutateAsync({ chatId, title: newTitle });
    } catch (_err: unknown) {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    }
  }, [editingChatId, editValue, renameMutation, queryClient]);

  useEffect(() => {
    if (editingChatId && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editingChatId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) saveRename();
    };
    if (editingChatId) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [editingChatId, editValue, saveRename]);

  const handleDeleteChat = useCallback(async (chatId: string) => {
    if (!window.confirm("Are you sure you want to remove this chat?")) return;
    try { await deleteMutation.mutateAsync(chatId); }
    catch (err) { console.error("Failed to delete chat:", err); }
  }, [deleteMutation]);

  const handleShiftClick = useCallback(async (e: React.MouseEvent, chatId: string) => {
    if (!e.shiftKey) return false;
    e.preventDefault();
    const now = Date.now();
    const clicks = (shiftClicks[chatId] || []).filter(t => now - t < DEBUG_SHIFT_CLICK_WINDOW_MS).concat(now);
    setShiftClicks(prev => ({ ...prev, [chatId]: clicks }));
    if (clicks.length >= DEBUG_SHIFT_CLICKS_REQUIRED) {
      try {
        const chatData = await getChat(chatId);
        await navigator.clipboard.writeText(JSON.stringify(chatData, null, 2));
        setCopiedChatId(chatId);
        setTimeout(() => setCopiedChatId(null), 2000);
        setShiftClicks(prev => ({ ...prev, [chatId]: [] }));
      } catch (err) { console.error("Failed to copy chat data:", err); }
    }
    return true;
  }, [shiftClicks]);

  const handleContextMenu = useCallback(async (_: React.MouseEvent, chatId: string, chatTitle: string) => {
    const selectedAction = await window.menu([{ label: "Rename", enabled: true }, { label: "Delete", enabled: true }]);
    if (selectedAction === "Rename") startEditing(chatId, chatTitle);
    else if (selectedAction === "Delete") handleDeleteChat(chatId);
  }, [startEditing, handleDeleteChat]);

  const sortedChats = useMemo(() => {
    if (!data?.chatInfos) return [];
    return [...data.chatInfos].sort((a, b) => {
      const diff = b.updatedAt.getTime() - a.updatedAt.getTime();
      return diff !== 0 ? diff : b.id.localeCompare(a.id);
    });
  }, [data?.chatInfos]);

  const isToday = (d: Date) => { const t = new Date(); return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear(); };
  const isThisWeek = (d: Date) => d > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) && !isToday(d);

  const groupedChats = useMemo(() => {
    const g = { today: [] as typeof sortedChats, thisWeek: [] as typeof sortedChats, older: [] as typeof sortedChats };
    sortedChats.forEach(c => {
      if (isToday(c.updatedAt)) g.today.push(c);
      else if (isThisWeek(c.updatedAt)) g.thisWeek.push(c);
      else g.older.push(c);
    });
    return g;
  }, [sortedChats]);

  const chatGroups = useMemo(() => [
    { name: "Today", chats: groupedChats.today },
    { name: "This week", chats: groupedChats.thisWeek },
    { name: "Older", chats: groupedChats.older },
  ].filter(g => g.chats.length > 0), [groupedChats]);

  const sectionLabel: React.CSSProperties = {
    ...mono, fontSize: '0.54rem', letterSpacing: '0.2em',
    textTransform: 'uppercase' as const, color: T.textDim,
    padding: '8px 8px 4px', display: 'block',
  };

  if (isLoading) return (
    <nav className="flex min-h-0 flex-col" style={{ background: T.surface }}>
      <div style={{ ...mono, fontSize: '0.75rem', color: T.textDim, padding: 16 }}>Loading...</div>
    </nav>
  );

  if (error) return (
    <nav className="flex min-h-0 flex-col" style={{ background: T.surface }}>
      <div style={{ ...mono, fontSize: '0.75rem', color: '#c05040', padding: 16 }}>Error loading chats</div>
    </nav>
  );

  return (
    <nav className="flex flex-1 flex-col min-h-0 select-none" style={{ background: T.surface, color: T.text }}>

      {/* ── BRAND BLOCK — xDragon logo ─────────────────────────────── */}
      <div style={{ padding: '10px 12px 8px', borderBottom: `1px solid ${T.goldBorder}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <XDragonBrandMark />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: '"Georgia",serif', fontSize: '0.88rem', color: T.gold, fontWeight: 700, lineHeight: 1.2 }}>
              xDragon Studio
            </div>
            <div style={{ ...mono, fontSize: '0.5rem', color: T.textDim, marginTop: 3, letterSpacing: '0.08em' }}>
              Alpha S7 · 8 Agents · Archon Supervised
            </div>
          </div>
        </div>
      </div>

      {/* ── New Chat ─────────────────────────────────────────────── */}
      <header className="flex flex-col gap-0.5 px-3 pt-2 pb-1 flex-shrink-0">
        <Link
          href="/c/new" mask={{ to: "/" }} draggable={false}
          className="flex w-full items-center gap-2.5 rounded px-2 py-2 text-left"
          style={{
            ...mono, fontSize: '0.75rem',
            color: currentChatId === "new" ? T.text : T.textMuted,
            background: currentChatId === "new" ? T.surface3 : 'transparent',
            borderLeft: `2px solid ${currentChatId === "new" ? T.gold : 'transparent'}`,
          }}
        >
          <span style={{ color: currentChatId === "new" ? T.gold : T.textDim, flexShrink: 0 }}><IconNewChat /></span>
          <span style={{ fontWeight: 600 }}>New Chat</span>
        </Link>
        {/* Settings navigates to /settings page — linked at bottom of sidebar */}
      </header>

      <div style={{ height: 1, background: T.border, margin: '4px 12px 0' }} />

      {/* ── Studio Modules ─────────────────────────────────────────── */}
      <div className="px-3 pt-1 pb-1 flex-shrink-0">
        <span style={sectionLabel}>Studio Modules</span>
        <div className="flex flex-col gap-0">
          {MODULES.map(mod => (
            <Link
              key={mod.id} href={mod.href} draggable={false}
              className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left transition-all duration-100"
              style={{ borderLeft: '2px solid transparent' }}
            >
              <span style={{ color: mod.accent, flexShrink: 0 }}><mod.Icon /></span>
              <div className="flex flex-col min-w-0">
                <span style={{ ...mono, fontSize: '0.72rem', fontWeight: 600, color: T.text, lineHeight: 1.2 }}>{mod.name}</span>
                <span style={{ ...mono, fontSize: '0.5rem', color: mod.accent, lineHeight: 1.3, letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mod.agents}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: T.border, margin: '0 12px 4px' }} />

      {/* ── Chat history ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col px-3 py-1 overflow-y-auto overscroll-auto min-h-0">
        <div className="flex flex-col gap-3 pt-1">
          {chatGroups.map(group => (
            <div key={group.name} className="flex flex-col gap-0.5">
              <span style={sectionLabel}>{group.name}</span>
              {group.chats.map(chat => {
                const isActive = chat.id === currentChatId;
                const chatTitle = chat.title || chat.userExcerpt || chat.createdAt.toLocaleString();
                return (
                  <div
                    key={chat.id}
                    className="allow-context-menu flex items-center relative rounded transition-all duration-100"
                    style={{ background: isActive ? T.surface3 : 'transparent', borderLeft: `2px solid ${isActive ? T.gold : 'transparent'}` }}
                    onMouseEnter={() => handleMouseEnter(chat.id)}
                    onContextMenu={e => handleContextMenu(e, chat.id, chatTitle)}
                  >
                    {editingChatId === chat.id ? (
                      <div className="flex-1 flex items-center min-w-0 px-2 py-2 rounded" style={{ background: T.surface3 }}>
                        <input
                          ref={inputRef} type="text" value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); saveRename(); }
                            if (e.key === 'Escape') { setEditingChatId(null); setEditValue(""); }
                          }}
                          className="bg-transparent border-0 focus:outline-none w-full"
                          style={{ ...mono, fontSize: '0.75rem', color: T.text, padding: 0, margin: 0 }}
                        />
                      </div>
                    ) : (
                      <Link
                        to="/c/$chatId" params={{ chatId: chat.id }} draggable={false}
                        className="flex-1 flex items-center min-w-0 px-2 py-2 select-none"
                        onClick={e => handleShiftClick(e, chat.id)}
                      >
                        <span className="truncate" style={{ ...mono, fontSize: '0.72rem', color: isActive ? T.text : T.textMuted, lineHeight: 1.4 }}>
                          {chatTitle}
                        </span>
                        {copiedChatId === chat.id && (
                          <span className="ml-2 flex-shrink-0" style={{ ...mono, fontSize: '0.56rem', color: '#4a9a6a', letterSpacing: '0.06em' }}>COPIED</span>
                        )}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Settings link — pinned above footer ──────────────────────── */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}` }}>
        <Link
          href="/settings"
          draggable={false}
          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left"
          style={{ ...mono, fontSize: '0.72rem', color: T.textMuted, textDecoration: 'none' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14, color: T.textDim, flexShrink: 0 }}>
            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Settings</span>
          <span style={{ ...mono, fontSize: '0.52rem', color: T.textDim, marginLeft: 'auto' }}>↗</span>
        </Link>
      </div>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <div className="px-4 py-2 flex-shrink-0 flex items-center justify-between" style={{ borderTop: `1px solid ${T.goldBorder}` }}>
        <span style={{ ...mono, fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: T.goldDim }}>◈ ARCHON SUPERVISED</span>
        <span style={{ ...mono, fontSize: '0.48rem', letterSpacing: '0.12em', color: T.textDim, textTransform: 'uppercase' }}>v2.1</span>
      </div>
    </nav>
  );
}