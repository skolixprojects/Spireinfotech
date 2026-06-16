"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Search, X, LogOut, Shield, Loader2 } from "lucide-react";
import { useMailAuth } from "@/lib/mail-auth-context";
import { useToast } from "@/components/ui/Toast";
import {
  listFolder, searchMessages, getThread, getMessage, patchMessage,
  softDelete, permanentDelete, unreadCounts,
  type MailMessageSummary, type MailThreadView, type MailMessageDetail, type UnreadCounts,
} from "@/lib/mail-client-api";
import {
  buildReply, buildReplyAll, buildForward, type ComposeInit,
} from "@/lib/mail-compose-api";
import { useMailEvents } from "@/lib/mail-events";
import { FolderRail } from "./_components/FolderRail";
import { MessageList } from "./_components/MessageList";
import { ReadingPane } from "./_components/ReadingPane";
import { ComposeWindow } from "./_components/ComposeWindow";

const LABELS: Record<string, string> = {
  INBOX: "Inbox", STARRED: "Starred", SENT: "Sent", DRAFTS: "Drafts", ARCHIVE: "Archive", TRASH: "Trash",
};

export default function MailClientPage() {
  const { account, status, logout } = useMailAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [folder, setFolder] = useState("INBOX");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [items, setItems] = useState<MailMessageSummary[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [selected, setSelected] = useState<MailMessageSummary | null>(null);
  const [thread, setThread] = useState<MailThreadView | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [unread, setUnread] = useState<UnreadCounts>({});
  const [compose, setCompose] = useState<ComposeInit | null>(null);

  // Monotonic guards so out-of-order responses from rapid navigation /
  // clicks can never apply a stale result over a newer one.
  const reqSeq = useRef(0);
  const openSeq = useRef(0);
  const composeNonce = useRef(0);
  // Stamp a fresh nonce on every compose so ComposeWindow remounts with
  // clean state (no stale draftId/recipients/body carried across actions).
  const openCompose = (init: ComposeInit) => setCompose({ ...init, nonce: ++composeNonce.current });

  const refreshCounts = useCallback(() => {
    unreadCounts().then(setUnread).catch(() => {});
  }, []);

  const loadList = useCallback(async (f: string, p: number, q: string) => {
    const seq = ++reqSeq.current;
    setListLoading(true);
    try {
      let nextItems: MailMessageSummary[];
      let nextTotal = 1;
      let unreadPatch: UnreadCounts | null = null;
      if (q) {
        const r = await searchMessages(q, p);
        nextItems = r.content; nextTotal = r.totalPages;
      } else if (f === "STARRED") {
        // Backend cross-folder finder (lowercase literal route /folders/starred).
        const r = await listFolder("starred", p);
        nextItems = r.content; nextTotal = r.totalPages;
        unreadPatch = { STARRED: r.unreadCount };
      } else {
        const r = await listFolder(f, p);
        nextItems = r.content; nextTotal = r.totalPages;
        unreadPatch = { [f]: r.unreadCount };
      }
      if (seq !== reqSeq.current) return;           // superseded — discard
      setItems(nextItems); setTotalPages(nextTotal);
      if (unreadPatch) setUnread((u) => ({ ...u, ...unreadPatch }));
    } catch (e) {
      if (seq !== reqSeq.current) return;
      toast("error", e instanceof Error ? e.message : "Failed to load mail");
      setItems([]); setTotalPages(1);
    } finally {
      if (seq === reqSeq.current) setListLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (status === "anonymous") { router.replace("/mail/login"); return; }
    if (status === "authenticated") { refreshCounts(); loadList("INBOX", 0, ""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Live new-mail stream — updates the SAME counts/list state. On NEW_MAIL bump
  // the INBOX badge (and refresh the list head if INBOX is open); on every
  // (re)connect resync counts + the current folder. Torn down on logout
  // (enabled flips false) / unmount.
  useMailEvents({
    enabled: status === "authenticated",
    onNewMail: () => {
      setUnread((u) => ({ ...u, INBOX: (u.INBOX ?? 0) + 1 }));
      if (folder === "INBOX" && page === 0 && !searchQuery) loadList("INBOX", 0, "");
    },
    onResync: () => { refreshCounts(); loadList(folder, page, searchQuery); },
  });

  if (status !== "authenticated" || !account) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 size={28} className="animate-spin text-[#0F766E]" /></div>;
  }

  const updateItem = (id: number, patch: Partial<MailMessageSummary>) =>
    setItems((prev) => prev.map((m) => (m.messageId === id ? { ...m, ...patch } : m)));
  const removeItem = (id: number) => setItems((prev) => prev.filter((m) => m.messageId !== id));

  const selectFolder = (f: string) => {
    setFolder(f); setSearchQuery(""); setSearchInput(""); setPage(0);
    setSelected(null); setThread(null); loadList(f, 0, "");
  };

  const doSearch = () => {
    const q = searchInput.trim();
    if (!q) return;
    setSearchQuery(q); setPage(0); setSelected(null); setThread(null); loadList(folder, 0, q);
  };
  const clearSearch = () => {
    setSearchQuery(""); setSearchInput(""); setPage(0); setSelected(null); setThread(null); loadList(folder, 0, "");
  };
  const changePage = (p: number) => { setPage(p); loadList(folder, p, searchQuery); };

  // Opening a draft row edits it in the composer rather than the reading pane.
  const openDraft = async (m: MailMessageSummary) => {
    try {
      const d = await getMessage(m.messageId);
      openCompose({
        mode: "draft", draftId: d.messageId,
        to: d.to ?? [], cc: d.cc ?? [], bcc: d.bcc ?? [],
        subject: d.subject ?? "", bodyHtml: d.bodyHtml ?? "", inReplyToId: d.inReplyToId ?? null,
        attachments: d.attachments ?? [],
      });
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not open draft");
    }
  };

  const openMessage = async (m: MailMessageSummary) => {
    if (m.folder === "DRAFTS") { openDraft(m); return; }
    const seq = ++openSeq.current;
    setSelected(m); setThread(null); setThreadLoading(true);
    try {
      const t = await getThread(m.threadId);
      if (seq !== openSeq.current) return;          // a newer message was opened
      setThread(t);
    } catch (e) {
      if (seq !== openSeq.current) return;          // stale error must not wipe a newer selection
      toast("error", e instanceof Error ? e.message : "Message not available");
      setSelected(null);
      setThreadLoading(false);
      return;
    }
    setThreadLoading(false);
    if (!m.read) {
      try {
        await patchMessage(m.messageId, { read: true });
        if (seq !== openSeq.current) return;        // don't mark/refresh for a superseded open
        updateItem(m.messageId, { read: true });
        setSelected((s) => (s && s.messageId === m.messageId ? { ...s, read: true } : s));
        refreshCounts();
      } catch { /* non-fatal */ }
    }
  };

  const toggleStar = async (m: MailMessageSummary) => {
    const next = !m.starred;
    updateItem(m.messageId, { starred: next });
    setSelected((s) => (s && s.messageId === m.messageId ? { ...s, starred: next } : s));
    try {
      await patchMessage(m.messageId, { starred: next });
      if (folder === "STARRED" && !next) removeItem(m.messageId);
    } catch {
      updateItem(m.messageId, { starred: !next });
      toast("error", "Could not update star");
    }
  };

  const toggleImportant = async () => {
    if (!selected) return;
    const next = !selected.important;
    setSelected((s) => (s ? { ...s, important: next } : s));
    updateItem(selected.messageId, { important: next });
    try { await patchMessage(selected.messageId, { important: next }); }
    catch { setSelected((s) => (s ? { ...s, important: !next } : s)); updateItem(selected.messageId, { important: !next }); toast("error", "Could not update"); }
  };

  const afterRemoveFromView = () => { setSelected(null); setThread(null); refreshCounts(); };

  const archive = async () => {
    if (!selected) return;
    try { await patchMessage(selected.messageId, { folder: "ARCHIVE" }); }
    catch (e) { toast("error", e instanceof Error ? e.message : "Failed"); return; }
    if (folder !== "ARCHIVE" || searchQuery) removeItem(selected.messageId);
    toast("success", "Archived"); afterRemoveFromView();
  };
  const trash = async () => {
    if (!selected) return;
    try { await softDelete(selected.messageId); }
    catch (e) { toast("error", e instanceof Error ? e.message : "Failed"); return; }
    if (folder !== "TRASH" || searchQuery) removeItem(selected.messageId);
    toast("success", "Moved to Trash"); afterRemoveFromView();
  };
  const permanent = async () => {
    if (!selected) return;
    try { await permanentDelete(selected.messageId); }
    catch (e) { toast("error", e instanceof Error ? e.message : "Failed"); return; }
    removeItem(selected.messageId); toast("success", "Deleted forever"); afterRemoveFromView();
  };

  // The message a reply/forward acts on = the opened message within the thread.
  const originalDetail = (): MailMessageDetail | null => {
    if (!thread || !selected) return null;
    return thread.messages.find((m) => m.messageId === selected.messageId)
      ?? thread.messages[thread.messages.length - 1] ?? null;
  };
  const doReply = () => { const o = originalDetail(); if (o) openCompose(buildReply(o)); };
  const doReplyAll = () => { const o = originalDetail(); if (o) openCompose(buildReplyAll(o, account.email)); };
  const doForward = () => { const o = originalDetail(); if (o) openCompose(buildForward(o)); };
  const onSent = () => { setCompose(null); refreshCounts(); loadList(folder, page, searchQuery); };

  const isAdmin = account.role === "ADMIN" || account.role === "SUPER_ADMIN";
  const title = searchQuery ? `Results for “${searchQuery}”` : LABELS[folder] ?? folder;

  return (
    <div className="flex h-screen flex-col bg-[#F0EDE8]">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F766E] text-white"><Mail size={16} /></div>
          <span className="hidden font-serif text-lg font-bold text-gray-900 sm:inline">{account.entityName} Mail</span>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); doSearch(); }} className="relative mx-auto w-full max-w-xl">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search mail"
            className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-9 pr-9 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#14B8A6]"
          />
          {searchQuery && (
            <button type="button" onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" title="Clear search">
              <X size={15} />
            </button>
          )}
        </form>
        <div className="flex items-center gap-3 shrink-0 text-sm">
          {isAdmin && (
            <Link href="/mail-admin" className="hidden items-center gap-1.5 text-gray-500 hover:text-[#0F766E] md:inline-flex" title="Admin console">
              <Shield size={14} /> Admin
            </Link>
          )}
          <span className="hidden text-gray-500 lg:inline">{account.email}</span>
          <button onClick={logout} className="inline-flex items-center gap-1.5 text-gray-500 hover:text-[#0F766E]" title="Logout">
            <LogOut size={14} /> <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Folder rail */}
        <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white lg:block">
          <FolderRail active={searchQuery ? "" : folder} unread={unread} onSelect={selectFolder} onCompose={() => openCompose({ mode: "new" })} />
        </aside>

        {/* Message list */}
        <section className={`${selected ? "hidden lg:flex" : "flex"} w-full flex-col border-r border-gray-200 bg-white lg:w-[400px] lg:shrink-0`}>
          {/* mobile folder selector (rail hidden < lg) */}
          <div className="border-b border-gray-200 p-2 lg:hidden">
            <select
              aria-label="Folder"
              value={searchQuery ? "" : folder}
              onChange={(e) => e.target.value && selectFolder(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {searchQuery && <option value="">Search results</option>}
              {["INBOX", "STARRED", "SENT", "DRAFTS", "ARCHIVE", "TRASH"].map((f) => (
                <option key={f} value={f}>{LABELS[f]}{unread[f] ? ` (${unread[f]})` : ""}</option>
              ))}
            </select>
          </div>
          <MessageList
            title={title}
            items={items}
            loading={listLoading}
            selectedId={selected?.messageId ?? null}
            folder={searchQuery ? "SEARCH" : folder}
            page={page}
            totalPages={totalPages}
            onOpen={openMessage}
            onToggleStar={toggleStar}
            onPage={changePage}
          />
        </section>

        {/* Reading pane */}
        <section className={`${selected ? "flex" : "hidden lg:flex"} w-full flex-1 flex-col bg-white`}>
          <ReadingPane
            thread={thread}
            selected={selected}
            loading={threadLoading}
            onBack={() => { setSelected(null); setThread(null); }}
            onStar={() => selected && toggleStar(selected)}
            onImportant={toggleImportant}
            onArchive={archive}
            onTrash={trash}
            onPermanent={permanent}
            onReply={doReply}
            onReplyAll={doReplyAll}
            onForward={doForward}
          />
        </section>
      </div>

      {compose && (
        <ComposeWindow key={compose.nonce} init={compose} onClose={() => setCompose(null)} onSent={onSent} />
      )}
    </div>
  );
}
