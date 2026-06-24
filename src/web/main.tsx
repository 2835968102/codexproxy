import React, { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Envelope,
  RpcResponsePayload,
  SessionSummary,
  createEnvelope
} from "../shared/protocol.js";
import {
  ChatHistoryMessage,
  messagesFromCodexEvent,
  messagesFromThreadHistory,
  turnsFromThreadHistory
} from "../shared/thread-history.js";
import { activeTurnIdFromTurns, buildTurnSendRequest } from "../shared/turn-routing.js";
import "./styles.css";

installMobileViewportVars();

// Lightweight UI state types used by this single-page controller.
// The page talks to the relay over WebSocket, renders thread history as chat,
// and shows Codex runtime/tool progress as activity cards.
type LogItem = {
  id: string;
  ts: number;
  kind: string;
  body: unknown;
};

type ReplyItem = LogItem & {
  role: ChatHistoryMessage["role"];
};

type ActivityState = "running" | "waiting" | "done" | "error";

type ActivityItem = {
  id: string;
  ts: number;
  kind: string;
  title: string;
  detail?: string;
  state: ActivityState;
};

type ActivityDetailBlock =
  | { kind: "text"; text: string }
  | { kind: "command"; command: string; cwd?: string; exitCode?: string; output?: string }
  | { kind: "files"; files: { action: string; path: string }[] }
  | { kind: "plan"; explanation?: string; steps: { status: string; text: string }[] }
  | { kind: "tool"; name?: string; payload?: string; error?: string };

type WorkPhase = "idle" | "thinking" | "tool" | "waiting" | "replying" | "complete" | "error";

type WorkStatus = {
  phase: WorkPhase;
  label: string;
  detail?: string;
  updatedAt?: number;
};

type Pending = {
  resolve: (value: RpcResponsePayload) => void;
  reject: (error: Error) => void;
};

type ThreadSummary = {
  id: string;
  name?: string | null;
  preview?: string | null;
  cwd?: string | null;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
};

type WorkspaceGroup = {
  key: string;
  cwd: string;
  name: string;
  threads: ThreadSummary[];
};

const requestTimeoutMs = 120000;
const idleWorkStatus: WorkStatus = {
  phase: "idle",
  label: "Idle",
  detail: "Codex status appears here after you send a message."
};

// Mobile browser chrome changes the visible viewport while typing.
// This CSS variable keeps the composer above the keyboard/bottom bar.
function installMobileViewportVars() {
  const update = () => {
    const viewport = window.visualViewport;
    const bottomInset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    document.documentElement.style.setProperty("--mobile-browser-bottom", `${Math.round(bottomInset)}px`);
  };
  update();
  window.visualViewport?.addEventListener("resize", update);
  window.visualViewport?.addEventListener("scroll", update);
  window.addEventListener("orientationchange", update);
}

function App() {
  // Connection/session state. The browser is a "controller" peer connected
  // to the relay, while bridge sessions represent machines running Codex.
  const [pairingCode, setPairingCode] = useState(localStorage.getItem("pairingCode") ?? "");
  const [selectedSession, setSelectedSession] = useState(localStorage.getItem("sessionId") ?? "");
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<SessionSummary | undefined>();

  // Chat and activity state. Replies are user/assistant bubbles; activities are
  // status/tool/file-change summaries derived from Codex protocol events.
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [replies, setReplies] = useState<ReplyItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [workStatus, setWorkStatus] = useState<WorkStatus>(idleWorkStatus);

  // Thread/workspace state. Threads are grouped by working directory so the UI
  // can behave like a small project drawer on both desktop and mobile.
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cwd, setCwd] = useState("");
  const [workspaceOpenByKey, setWorkspaceOpenByKey] = useState<Record<string, boolean>>(() =>
    readWorkspaceOpenState()
  );
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("");
  const [threadListLoading, setThreadListLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [showChatBottomButton, setShowChatBottomButton] = useState(false);
  const [searchClearPulsing, setSearchClearPulsing] = useState(false);
  const [searchEmptyActionsExpanded, setSearchEmptyActionsExpanded] = useState(false);

  // Refs hold imperative objects that should not cause re-renders: WebSocket,
  // outstanding RPC promises, current thread metadata, and scroll/prompt nodes.
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const pendingRef = useRef(new Map<string, Pending>());
  const currentTurnByThread = useRef(new Map<string, string>());
  const currentThreadIdRef = useRef(currentThreadId);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const chatPinnedRef = useRef(true);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceSearchInputRef = useRef<HTMLInputElement | null>(null);
  const searchClearPulseTimerRef = useRef<number | undefined>(undefined);
  const activeReplyIdRef = useRef<string | undefined>(undefined);
  const retryingWithoutSessionRef = useRef(false);

  // Workspace search helpers keep the drawer usable on narrow screens:
  // clear/narrow/open-all are small UX actions around the same search query.
  function triggerSearchClearPulse() {
    if (searchClearPulseTimerRef.current) {
      window.clearTimeout(searchClearPulseTimerRef.current);
    }
    setSearchClearPulsing(true);
    searchClearPulseTimerRef.current = window.setTimeout(() => {
      setSearchClearPulsing(false);
      searchClearPulseTimerRef.current = undefined;
    }, 280);
  }

  function clearWorkspaceSearch() {
    setWorkspaceSearch("");
    workspaceSearchInputRef.current?.focus();
    triggerSearchClearPulse();
  }

  function focusWorkspaceSearchInput() {
    workspaceSearchInputRef.current?.focus();
  }

  function resetWorkspaceSearchAll() {
    clearWorkspaceSearch();
  }

  function narrowWorkspaceSearch() {
    const parts = workspaceSearch.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      clearWorkspaceSearch();
      return;
    }
    setWorkspaceSearch(parts.slice(0, -1).join(" "));
    workspaceSearchInputRef.current?.focus();
    triggerSearchClearPulse();
  }

  function restoreWorkspaceSearchAndOpenAll() {
    clearWorkspaceSearch();
    setAllWorkspaceGroupsOpen(true);
  }

  function setAllWorkspaceGroupsOpen(nextOpen: boolean) {
    setWorkspaceOpenByKey((current) => {
      const next = { ...current };
      for (const group of workspaceGroups) {
        next[group.key] = nextOpen;
      }
      saveWorkspaceOpenState(next);
      return next;
    });
  }

  useEffect(() => {
    currentThreadIdRef.current = currentThreadId;
  }, [currentThreadId]);

  useEffect(() => {
    if (connected && currentThreadId) {
      void refreshActiveTurn(currentThreadId);
    }
  }, [connected, currentThreadId]);

  useEffect(() => {
    const el = chatListRef.current;
    if (!el) {
      return;
    }
    if (chatPinnedRef.current) {
      scrollChatToBottomAfterLayout("auto");
    } else if (replies.length) {
      setShowChatBottomButton(true);
    }
  }, [replies, threadLoading]);

  useEffect(() => {
    resizePrompt();
  }, [prompt]);

  useEffect(() => {
    const onWorkspaceSearchShortcut = (event: globalThis.KeyboardEvent) => {
      if (!connected || event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as Element | null;
      if (!target || !(target instanceof Element)) {
        return;
      }
      const tag = target.tagName.toLowerCase();
      if (
        (target instanceof HTMLElement && target.isContentEditable) ||
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        tag === "button"
      ) {
        return;
      }
      if (event.key === "/" && document.activeElement !== workspaceSearchInputRef.current) {
        event.preventDefault();
        workspaceSearchInputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onWorkspaceSearchShortcut);
    return () => {
      document.removeEventListener("keydown", onWorkspaceSearchShortcut);
      if (searchClearPulseTimerRef.current) {
        window.clearTimeout(searchClearPulseTimerRef.current);
      }
    };
  }, [connected]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === currentThreadId),
    [threads, currentThreadId]
  );
  const isMobileWorkspaceTitle = typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;
  const workspaceGroups = useMemo(() => groupThreadsByCwd(threads), [threads]);
  const workspaceSearchQuery = workspaceSearch.trim();
  const workspaceSearchTerms = useMemo(() => workspaceSearchQuery.split(/\s+/).filter(Boolean), [workspaceSearchQuery]);
  const visibleWorkspaceGroups = useMemo(
    () => filterWorkspaceGroups(workspaceGroups, workspaceSearchQuery),
    [workspaceGroups, workspaceSearchQuery]
  );
  const visibleThreadCount = useMemo(
    () => visibleWorkspaceGroups.reduce((total, group) => total + group.threads.length, 0),
    [visibleWorkspaceGroups]
  );
  const hasWorkspaceSearch = workspaceSearchTerms.length > 0;
  const workspaceSearchHasMultipleTerms = workspaceSearchTerms.length > 1;
  const isWorkspaceSearchEmptyState = hasWorkspaceSearch && visibleWorkspaceGroups.length === 0;
  const isWorkspaceSearchEmptyActionsCompact = isMobileWorkspaceTitle && isWorkspaceSearchEmptyState;
  const isWorkspaceSearchEmptyActionsCollapsed = isWorkspaceSearchEmptyActionsCompact && !searchEmptyActionsExpanded;
  const emptySearchActionId = "workspace-search-empty-extra-actions";
  const emptySearchActionTabIndex = isWorkspaceSearchEmptyActionsCollapsed ? -1 : 0;
  const searchEmptyMoreLabel = isWorkspaceSearchEmptyActionsCollapsed ? "展开更多搜索操作" : "收起更多搜索操作";
  const searchEmptyActionsLabel = "会话搜索更多操作";
  const searchEmptyLabels = {
    noDataMessage: "当前暂无会话，先创建一条吧。",
    noDataHint: "点击上方“新会话”开始第一条对话。",
    open: "返回并显示全部会话列表",
    clear: "返回全部会话",
    clearSrLabel: "清空搜索条件并返回全部会话",
    clearTitle: "清空搜索条件并返回全部会话",
    continueSearchAction: "继续搜索",
    continueSearchSrLabel: "返回搜索框继续修改关键词",
    continueSearchHint: "改一个关键词，回车即可重试。",
    narrowMultiple: {
      action: "删一词",
      srLabel: "删除最后一个关键词并缩短搜索条件",
      title: "删除最后一个关键词并缩短搜索条件"
    },
    narrowSingle: {
      action: "改词重搜",
      srLabel: "清空关键词并改词重搜",
      title: "清空关键词并改词重搜"
    },
    restore: {
      action: "恢复全部",
      srLabel: "清空搜索并展开所有会话分组",
      title: "清空搜索并展开所有会话分组"
    },
    emptySearchMessage: hasWorkspaceSearch ? "未找到匹配会话。" : "未找到会话。"
  };
  const narrowWorkspaceSearchLabel = workspaceSearchHasMultipleTerms ? searchEmptyLabels.narrowMultiple : searchEmptyLabels.narrowSingle;
  const workspaceSearchEmptyMessage = searchEmptyLabels.emptySearchMessage;
  const allWorkspaceGroupsOpen = workspaceGroups.every((group) => workspaceOpenByKey[group.key] !== false);
  const workspaceSummaryHint = useMemo(() => {
    if (!hasWorkspaceSearch) {
      return "";
    }
    return "搜索中会按命中项展开显示，清空搜索后可继续使用“展开/收起全部”。";
  }, [hasWorkspaceSearch]);
  const workspaceSummaryStats = useMemo(
    () => {
      if (!workspaceGroups.length) {
        return {
          summary: isMobileWorkspaceTitle ? "暂无会话" : "暂无会话",
          pills: []
        };
      }

      if (hasWorkspaceSearch) {
        return {
          summary: isMobileWorkspaceTitle
            ? `${visibleWorkspaceGroups.length}组 · ${visibleThreadCount}命中`
            : `会话分组：${visibleWorkspaceGroups.length}组 · ${visibleThreadCount}条命中`,
          pills: [
            { label: `组 ${visibleWorkspaceGroups.length}`, type: "neutral" as const },
            { label: `命中 ${visibleThreadCount}`, type: "accent" as const }
          ]
        };
      }

      return {
        summary: isMobileWorkspaceTitle
          ? `${workspaceGroups.length}组 · ${threads.length}会话`
          : `会话分组：${workspaceGroups.length}组 · ${threads.length}个会话`,
        pills: [
          { label: `组 ${workspaceGroups.length}`, type: "neutral" as const },
          { label: `会话 ${threads.length}`, type: "accent" as const }
        ]
      };
    },
    [
      isMobileWorkspaceTitle,
      hasWorkspaceSearch,
      threads.length,
      visibleThreadCount,
      visibleWorkspaceGroups.length,
      workspaceGroups.length
    ]
  );
  const workspaceSummaryText = workspaceSummaryStats.summary;

  useEffect(() => {
    setSearchEmptyActionsExpanded(false);
  }, [workspaceSearchQuery, workspaceGroups.length, hasWorkspaceSearch]);
  const currentTitle = currentThreadId ? threadTitle(activeThread) : "New thread";
  const currentSubtitle = currentThreadId
    ? normalizeCwd(activeThread?.cwd) || "No working directory set"
    : cwd.trim() || "Choose a project or enter a working directory before sending your first message";

  function addLog(kind: string, body: unknown) {
    setLogs((items) =>
      [
        {
          id: crypto.randomUUID(),
          ts: Date.now(),
          kind,
          body
        },
        ...items
      ].slice(0, 120)
    );
  }

  function setWork(phase: WorkPhase, label: string, detail?: string) {
    setWorkStatus({ phase, label, detail, updatedAt: Date.now() });
  }

  function upsertActivity(next: Omit<ActivityItem, "ts">) {
    setActivities((items) => {
      const ts = Date.now();
      const existingIndex = items.findIndex((item) => item.id === next.id);
      if (existingIndex >= 0) {
        const updated = items.slice();
        updated[existingIndex] = { ...updated[existingIndex]!, ...next, ts };
        return updated.slice(0, 60);
      }
      return [{ ...next, ts }, ...items].slice(0, 60);
    });
  }

  function appendActivityDetail(id: string, seed: Omit<ActivityItem, "id" | "ts" | "detail">, detail: string) {
    if (!detail) {
      return;
    }
    setActivities((items) => {
      const ts = Date.now();
      const existingIndex = items.findIndex((item) => item.id === id);
      if (existingIndex >= 0) {
        const existing = items[existingIndex]!;
        const updated = items.slice();
        updated[existingIndex] = {
          ...existing,
          ...seed,
          ts,
          detail: shortenText([existing.detail, detail].filter(Boolean).join("\n"), 1800)
        };
        return updated.slice(0, 60);
      }
      return [{ id, ts, ...seed, detail: shortenText(detail, 1800) }, ...items].slice(0, 60);
    });
  }

  function pinChatToBottom() {
    chatPinnedRef.current = true;
    setShowChatBottomButton(false);
  }

  function scrollChatToBottom(behavior: ScrollBehavior = "smooth") {
    const el = chatListRef.current;
    if (!el) {
      return;
    }
    pinChatToBottom();
    el.scrollTo({ top: el.scrollHeight, behavior });
  }

  function scrollChatToBottomAfterLayout(behavior: ScrollBehavior = "smooth") {
    pinChatToBottom();
    requestAnimationFrame(() => {
      scrollChatToBottom(behavior);
      requestAnimationFrame(() => scrollChatToBottom("auto"));
    });
    window.setTimeout(() => scrollChatToBottom("auto"), 80);
    window.setTimeout(() => scrollChatToBottom("auto"), 220);
  }

  function updateChatPinnedState() {
    const el = chatListRef.current;
    if (!el) {
      return;
    }
    const pinned = isNearChatBottom(el);
    chatPinnedRef.current = pinned;
    if (pinned) {
      setShowChatBottomButton(false);
    }
  }

  function appendReplyMessage(message: ChatHistoryMessage, fallbackId: string) {
    if (!message.text) {
      return;
    }

    const id = message.role === "assistant" && activeReplyIdRef.current ? activeReplyIdRef.current : message.id || fallbackId;
    if (message.role === "assistant" && message.id) {
      activeReplyIdRef.current = message.id;
    }
    setReplies((items) => upsertReplyItems(items, {
      id,
      ts: timestampToMs(message.timestamp) || Date.now(),
      kind: labelForRole(message.role),
      role: message.role,
      body: message.text
    }));
  }

  // Replace the current chat transcript with persisted thread history returned
  // by Codex. Used when selecting an existing thread or reconnecting.
  function replaceRepliesFromHistory(thread: unknown) {
    const messages = messagesFromThreadHistory(thread);
    pinChatToBottom();
    setReplies(
      messages
        .map((message, index) => ({
          id: message.id || `history-${index}`,
          ts: timestampToMs(message.timestamp) || Date.now(),
          kind: labelForRole(message.role),
          role: message.role,
          body: message.text
        }))
        .slice(-80)
    );
  }

  // Open the controller WebSocket to the relay. After the socket opens we send
  // a protocol "hello" with the pairing code and optional target session ID.
  function connect(event?: FormEvent) {
    event?.preventDefault();
    const cleanPairingCode = pairingCode.trim();
    const cleanSessionId = selectedSession.trim();
    setConnecting(true);
    setConnectionMessage("Connecting...");
    localStorage.setItem("pairingCode", cleanPairingCode);
    if (cleanSessionId) {
      localStorage.setItem("sessionId", cleanSessionId);
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socketRef.current?.close();
    retryingWithoutSessionRef.current = false;
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify(
          createEnvelope("hello", {
            role: "controller",
            pairingCode: cleanPairingCode,
            sessionId: cleanSessionId || undefined
          })
        )
      );
    };

    ws.onmessage = (event) => {
      const envelope = JSON.parse(event.data) as Envelope;
      handleEnvelope(envelope);
    };

    ws.onclose = () => {
      setConnected(false);
      setConnecting(false);
      setConnectionMessage("Connection closed. Check the pairing code, address, and bridge status.");
      addLog("system", "Connection closed");
    };

    ws.onerror = () => {
      setConnecting(false);
      setConnectionMessage("WebSocket connection error. Check the address, firewall, and bridge status.");
      addLog("error", "WebSocket connection error");
    };
  }

  // Top-level relay envelope dispatcher. It handles controller handshakes,
  // relay errors, session updates, RPC responses, and streamed Codex events.
  function handleEnvelope(envelope: Envelope) {
    if (envelope.type === "hello.accepted") {
      setConnected(true);
      setConnecting(false);
      setConnectionMessage("");
      const payload = envelope.payload as any;
      setActiveSession(payload.summary);
      setSessions(payload.sessions ?? [payload.summary]);
      setSelectedSession(payload.sessionId);
      localStorage.setItem("sessionId", payload.sessionId);
      addLog("system", "Connected to server");
      void refreshThreads(undefined, { loadHistory: true });
      return;
    }

    if (envelope.type === "error") {
      const payload = envelope.payload as any;
      const message = payload?.message ?? "Connection failed";
      if (message === "Requested session is not connected." && !retryingWithoutSessionRef.current) {
        retryingWithoutSessionRef.current = true;
        setSelectedSession("");
        localStorage.removeItem("sessionId");
        setConnectionMessage("Old Session ID is invalid. Reconnecting without a session ID...");
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        socketRef.current?.close();
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        socketRef.current = ws;
        ws.onopen = () => {
          ws.send(
            JSON.stringify(
              createEnvelope("hello", {
                role: "controller",
                pairingCode: pairingCode.trim(),
                sessionId: undefined
              })
            )
          );
        };
        ws.onmessage = (event) => handleEnvelope(JSON.parse(event.data) as Envelope);
        ws.onclose = () => {
          setConnected(false);
          setConnecting(false);
          setConnectionMessage("Connection closed. Check the pairing code, address, and bridge status.");
        };
        ws.onerror = () => {
          setConnecting(false);
          setConnectionMessage("WebSocket connection error. Check the address, firewall, and bridge status.");
        };
        return;
      }
      setConnecting(false);
      setConnectionMessage(message);
      addLog("error", message);
      return;
    }

    if (envelope.type === "session.updated" || envelope.type === "session.selected") {
      const payload = envelope.payload as any;
      setActiveSession(payload.summary);
      setSessions(payload.sessions ?? []);
      return;
    }

    if (envelope.type === "rpc.response") {
      const pending = envelope.requestId ? pendingRef.current.get(envelope.requestId) : undefined;
      if (pending) {
        pendingRef.current.delete(envelope.requestId!);
        pending.resolve(envelope.payload as RpcResponsePayload);
      }
      return;
    }

    if (envelope.type === "codex.event") {
      const message = (envelope.payload as any).message;
      addLog("codex", message);
      updateTurnTracking(message);
      updateWorkActivity(message);
      updateReplies(message);
      return;
    }

    if (envelope.type === "bridge.status") {
      setActiveSession((session) => (session ? { ...session, codex: envelope.payload as any } : session));
      return;
    }

    addLog(envelope.type, envelope.payload);
  }

  // Track which Codex turn is active per thread, so follow-up prompts continue
  // the correct in-progress turn when possible.
  function updateTurnTracking(message: unknown) {
    const msg = message as any;
    if (msg?.method === "thread/started" && msg.params?.thread?.id && !currentThreadIdRef.current) {
      currentThreadIdRef.current = msg.params.thread.id;
      setCurrentThreadId(msg.params.thread.id);
      localStorage.setItem("threadId", msg.params.thread.id);
    }
    if (msg?.method === "turn/started" && msg.params?.threadId && msg.params?.turn?.id) {
      currentTurnByThread.current.set(msg.params.threadId, msg.params.turn.id);
      activeReplyIdRef.current = undefined;
    }
    if (msg?.method === "turn/completed" && msg.params?.threadId) {
      currentTurnByThread.current.delete(msg.params.threadId);
    }
  }

  // Convert Codex message events into chat bubbles. Delta events are appended
  // to the current assistant bubble to preserve streaming behavior.
  function updateReplies(message: unknown) {
    const msg = message as any;
    const selectedThreadId = currentThreadIdRef.current;
    if (msg?.params?.threadId && selectedThreadId && msg.params.threadId !== selectedThreadId) {
      addLog("debug", {
        reason: "ignored by selected thread filter",
        eventThreadId: msg.params.threadId,
        selectedThreadId,
        method: msg.method
      });
      return;
    }

    for (const chatMessage of messagesFromCodexEvent(message)) {
      appendReplyMessage(chatMessage, `${msg?.method ?? "event"}:${Date.now()}`);
    }

    if (msg?.method === "item/agentMessage/delta") {
      const params = msg.params ?? {};
      const itemId = params.itemId || params.turnId || "active";
      const delta = params.delta || "";
      if (!delta) {
        return;
      }
      activeReplyIdRef.current = itemId;
      setReplies((items) => {
        const existing = items.find((item) => item.id === itemId);
        if (existing) {
          return items.map((item) =>
            item.id === itemId ? { ...item, body: String(item.body ?? "") + delta } : item
          );
        }
        const next: ReplyItem = { id: itemId, ts: Date.now(), kind: "Codex", role: "assistant", body: delta };
        return [...items, next].slice(-80);
      });
    }
  }

  // Convert Codex protocol notifications into compact status/activity cards:
  // planning, command output, file changes, approvals, warnings, and errors.
  function updateWorkActivity(message: unknown) {
    const msg = message as any;
    if (!msg || typeof msg.method !== "string") {
      return;
    }

    const params = msg.params ?? {};
    const threadId = params.threadId ?? params.thread?.id;
    const selectedThreadId = currentThreadIdRef.current;
    if (threadId && selectedThreadId && threadId !== selectedThreadId) {
      return;
    }

    if (msg.id !== undefined && isServerRequestMethod(msg.method)) {
      handleServerRequestActivity(msg);
      return;
    }

    switch (msg.method) {
      case "thread/started":
        upsertActivity({
          id: `thread:${params.thread?.id ?? Date.now()}`,
          kind: "Status",
          title: "Thread created",
          detail: params.thread?.cwd ? `Working directory: ${params.thread.cwd}` : undefined,
          state: "done"
        });
        return;
      case "turn/started": {
        const turnId = params.turn?.id ?? params.turnId ?? "active";
        setWork("thinking", "Thinking", "Codex started processing this message.");
        upsertActivity({
          id: `turn:${turnId}`,
          kind: "Status",
          title: "Request started",
          detail: "Codex is analyzing context and planning the next step.",
          state: "running"
        });
        return;
      }
      case "turn/plan/updated": {
        const detail = formatPlanUpdate(params);
        const running = Array.isArray(params.plan) && params.plan.some((step: any) => step?.status === "inProgress");
        setWork("thinking", "Plan updated", currentPlanStep(params.plan) ?? "Codex is planning the next step.");
        upsertActivity({
          id: `plan:${params.turnId ?? "active"}`,
          kind: "Plan",
          title: "Plan updated",
          detail,
          state: running ? "running" : "done"
        });
        return;
      }
      case "item/started": {
        const activity = describeThreadItem(params.item, false);
        if (activity) {
          setWork(activity.phase, activity.title, activity.detail);
          upsertActivity(activity);
        }
        return;
      }
      case "item/completed": {
        const activity = describeThreadItem(params.item, true);
        if (activity) {
          setWork(activity.state === "error" ? "error" : activity.phase, activity.title, activity.detail);
          upsertActivity(activity);
        }
        return;
      }
      case "item/agentMessage/delta": {
        const id = params.itemId || params.turnId || "active";
        setWork("replying", "Replying", "Codex is streaming the answer.");
        upsertActivity({
          id: `reply:${id}`,
          kind: "Reply",
          title: "Generating reply",
          detail: "Answer content is streaming back.",
          state: "running"
        });
        return;
      }
      case "item/plan/delta": {
        const id = params.itemId || `plan:${params.turnId ?? "active"}`;
        setWork("thinking", "Updating plan", "Codex is organizing execution steps.");
        appendActivityDetail(
          id,
          { kind: "Plan", title: "Updating plan", state: "running" },
          String(params.delta ?? "")
        );
        return;
      }
      case "item/commandExecution/outputDelta": {
        const id = params.itemId || `command:${params.turnId ?? "active"}`;
        setWork("tool", "Command running", "Codex is running a command and streaming output.");
        appendActivityDetail(
          id,
          { kind: "Tool", title: "Command running", state: "running" },
          String(params.delta ?? "")
        );
        return;
      }
      case "item/fileChange/outputDelta": {
        const id = params.itemId || `file:${params.turnId ?? "active"}`;
        setWork("tool", "File change running", "Codex is editing files.");
        appendActivityDetail(
          id,
          { kind: "File", title: "File change running", state: "running" },
          String(params.delta ?? "")
        );
        return;
      }
      case "item/fileChange/patchUpdated": {
        const id = params.itemId || `file:${params.turnId ?? "active"}`;
        setWork("tool", "Patch updated", "Codex updated a file patch.");
        upsertActivity({
          id,
          kind: "File",
          title: "Patch updated",
          detail: formatFileChanges(params.changes),
          state: "running"
        });
        return;
      }
      case "item/mcpToolCall/progress": {
        const id = params.itemId || `mcp:${params.turnId ?? "active"}`;
        setWork("tool", "MCP tool running", String(params.message ?? "Tool progress updated."));
        upsertActivity({
          id,
          kind: "MCP",
          title: "MCP tool running",
          detail: String(params.message ?? ""),
          state: "running"
        });
        return;
      }
      case "item/reasoning/summaryPartAdded":
      case "item/reasoning/summaryTextDelta":
      case "item/reasoning/textDelta": {
        const id = params.itemId || `reasoning:${params.turnId ?? "active"}`;
        setWork("thinking", "Thinking", "Codex is reasoning about the task.");
        upsertActivity({
          id,
          kind: "Reasoning",
          title: "Thinking",
          detail: "Codex is analyzing the current request.",
          state: "running"
        });
        return;
      }
      case "hook/started":
        setWork("tool", "Hook running", formatHookRun(params.run));
        upsertActivity({
          id: `hook:${params.run?.id ?? Date.now()}`,
          kind: "Hook",
          title: "Hook running",
          detail: formatHookRun(params.run),
          state: "running"
        });
        return;
      case "hook/completed":
        setWork(params.run?.status === "failed" ? "error" : "tool", "Hook completed", formatHookRun(params.run));
        upsertActivity({
          id: `hook:${params.run?.id ?? Date.now()}`,
          kind: "Hook",
          title: params.run?.status === "failed" ? "Hook failed" : "Hook completed",
          detail: formatHookRun(params.run),
          state: params.run?.status === "failed" ? "error" : "done"
        });
        return;
      case "serverRequest/resolved":
        setWork("thinking", "Request resolved", "Codex resumed after the request was resolved.");
        upsertActivity({
          id: `request:${params.requestId ?? Date.now()}`,
          kind: "Request",
          title: "Request resolved",
          state: "done"
        });
        return;
      case "turn/completed": {
        const turnId = params.turn?.id ?? params.turnId ?? "active";
        const state = params.turn?.status === "failed" ? "error" : "done";
        const title =
          params.turn?.status === "interrupted"
            ? "Turn interrupted"
            : params.turn?.status === "failed"
              ? "Turn failed"
              : "Turn completed";
        const detail =
          params.turn?.error?.message ??
          (params.turn?.status === "interrupted" ? "The turn was interrupted." : "Codex finished this turn.");
        setWork(state === "error" ? "error" : "complete", title, detail);
        upsertActivity({
          id: `turn:${turnId}`,
          kind: "Status",
          title,
          detail,
          state
        });
        return;
      }
      case "error":
        setWork("error", "Codex error", String(params.message ?? "Unknown error"));
        upsertActivity({
          id: `error:${Date.now()}`,
          kind: "Error",
          title: "Codex error",
          detail: String(params.message ?? "Unknown error"),
          state: "error"
        });
        return;
      case "warning":
      case "guardianWarning":
      case "configWarning":
        upsertActivity({
          id: `${msg.method}:${Date.now()}`,
          kind: "Warning",
          title: "Codex warning",
          detail: String(params.message ?? params.warning ?? "Warning"),
          state: "error"
        });
        return;
      default:
        return;
    }
  }

  function handleServerRequestActivity(msg: any) {
    const params = msg.params ?? {};
    const id = `request:${msg.id}`;
    if (params.threadId && currentThreadIdRef.current && params.threadId !== currentThreadIdRef.current) {
      return;
    }

    const request = describeServerRequest(msg.method, params);
    setWork("waiting", request.title, request.detail);
    upsertActivity({
      id,
      kind: "Request",
      title: request.title,
      detail: request.detail,
      state: "waiting"
    });
  }

  function rpc(method: string, params?: unknown): Promise<RpcResponsePayload> {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to relay.");
    }

    const requestId = crypto.randomUUID();
    ws.send(
      JSON.stringify(
        createEnvelope(
          "rpc.request",
          {
            target: "codex",
            method,
            params
          },
          requestId
        )
      )
    );

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pendingRef.current.delete(requestId);
        reject(new Error("Codex request timed out."));
      }, requestTimeoutMs);

      pendingRef.current.set(requestId, {
        resolve: (value) => {
          window.clearTimeout(timeout);
          resolve(value);
        },
        reject
      });
    });
  }

  async function refreshThreads(
    preferredThreadId = currentThreadId,
    options: { loadHistory?: boolean } = {}
  ) {
    setThreadListLoading(true);
    try {
      const response = await rpc("thread.list", { limit: 25, archived: false });
      if (!response.ok) {
        throw new Error(response.error);
      }

      const result = response.result as any;
      const list = result?.threads ?? result?.items ?? result?.data ?? result ?? [];
      setThreads(Array.isArray(list) ? (list as ThreadSummary[]) : []);
      let selectedThreadId = "";
      if (preferredThreadId) {
        setCurrentThreadId(preferredThreadId);
        selectedThreadId = preferredThreadId;
      } else if (Array.isArray(list) && list[0]?.id) {
        setCurrentThreadId(list[0].id);
        selectedThreadId = list[0].id;
      }
      if (options.loadHistory && selectedThreadId) {
        pinChatToBottom();
        void loadThreadHistory(selectedThreadId);
      }
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : error);
    } finally {
      setThreadListLoading(false);
    }
  }

  async function refreshActiveTurn(threadId: string) {
    try {
      const response = await rpc("thread.read", { threadId, includeTurns: true });
      if (!response.ok) {
        throw new Error(response.error);
      }

      const turnId = activeTurnIdFromTurns((response.result as any)?.turns);
      if (turnId) {
        currentTurnByThread.current.set(threadId, turnId);
      } else {
        currentTurnByThread.current.delete(threadId);
      }
      return turnId;
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : error);
      return currentTurnByThread.current.get(threadId);
    }
  }

  async function loadThreadHistory(threadId: string) {
    pinChatToBottom();
    setThreadLoading(true);
    setWork("thinking", "Loading thread history", "Loading previous turns for this thread.");
    try {
      const response = await rpc("thread.read", { threadId, includeTurns: true });
      if (!response.ok) {
        throw new Error(response.error);
      }

      const turns = turnsFromThreadHistory(response.result);
      const turnId = activeTurnIdFromTurns(turns);
      if (turnId) {
        currentTurnByThread.current.set(threadId, turnId);
      } else {
        currentTurnByThread.current.delete(threadId);
      }
      replaceRepliesFromHistory(response.result);
      scrollChatToBottomAfterLayout("auto");
      setWork("complete", "History loaded", "Thread history loaded successfully.");
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : error);
      setWork("error", "Failed to load history", error instanceof Error ? error.message : String(error));
    } finally {
      setThreadLoading(false);
    }
  }

  async function sendPrompt(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }

    const submittedPrompt = prompt.trim();
    const userReplyId = `user-${Date.now()}-${crypto.randomUUID()}`;
    setBusy(true);
    setPrompt("");
    activeReplyIdRef.current = undefined;
    setActivities([]);
    setWork("thinking", "Sending to Codex", "Sending your prompt to Codex.");
    setReplies((items) => {
      const next: ReplyItem = { id: userReplyId, ts: Date.now(), kind: "User", role: "user", body: submittedPrompt };
      return [...items, next].slice(-80);
    });
    try {
      let sentThreadId = currentThreadId;
      if (currentThreadId) {
        const selectedThread = threads.find((thread) => thread.id === currentThreadId);
        const activeTurnId =
          currentTurnByThread.current.get(currentThreadId) ?? (await refreshActiveTurn(currentThreadId));
        const request = buildTurnSendRequest({
          threadId: currentThreadId,
          prompt: submittedPrompt,
          cwd: selectedThread?.cwd ?? undefined,
          activeTurnId
        });
        const response = await rpc(request.method, request.params);
        if (!response.ok) {
          throw new Error(response.error);
        }
      } else {
        const response = await rpc("thread.start", {
          prompt: submittedPrompt,
          cwd: cwd.trim() || undefined
        });
        if (!response.ok) {
          throw new Error(response.error);
        }
        const threadId = (response.result as any)?.thread?.id;
        if (threadId) {
          sentThreadId = threadId;
          setCurrentThreadId(threadId);
          replaceRepliesFromHistory(response.result);
        }
      }

      await refreshThreads(sentThreadId);
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : error);
      setWork("error", "Send failed", error instanceof Error ? error.message : String(error));
      upsertActivity({
        id: `send-error:${Date.now()}`,
        kind: "Error",
        title: "Send failed",
        detail: error instanceof Error ? error.message : String(error),
        state: "error"
      });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => promptRef.current?.focus());
    }
  }

  function updatePrompt(value: string) {
    setPrompt(value);
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    if (!busy && prompt.trim()) {
      event.currentTarget.form?.requestSubmit();
    }
  }

  function resizePrompt() {
    const el = promptRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }

  async function startNewThread() {
    pinChatToBottom();
    setThreadLoading(false);
    setCurrentThreadId("");
    setPrompt("");
    setReplies([]);
    setWork("idle", idleWorkStatus.label, idleWorkStatus.detail);
  }

  function selectThread(thread: ThreadSummary) {
    pinChatToBottom();
    setCurrentThreadId(thread.id);
    const nextCwd = normalizeCwd(thread.cwd);
    if (nextCwd) {
      setCwd(nextCwd);
    }
    void loadThreadHistory(thread.id);
  }

  function restoreRecentThreadFromEmptyState() {
    if (threadListLoading || !threads[0]) {
      return;
    }
    setSearchEmptyActionsExpanded(false);
    clearWorkspaceSearch();
    selectThread(threads[0]);
  }

  function startThreadInWorkspace(nextCwd: string) {
    pinChatToBottom();
    setThreadLoading(false);
    setCurrentThreadId("");
    setCwd(nextCwd);
    setPrompt("");
    setReplies([]);
    setWork("idle", idleWorkStatus.label, idleWorkStatus.detail);
  }

  function toggleWorkspace(key: string) {
    setWorkspaceOpenByKey((current) => {
      const next = { ...current, [key]: current[key] === false };
      saveWorkspaceOpenState(next);
      return next;
    });
  }

  async function interruptTurn() {
    const turnId = currentTurnByThread.current.get(currentThreadId);
    if (!currentThreadId || !turnId) {
      addLog("system", "No active turn is available.");
      return;
    }

    const response = await rpc("turn.interrupt", {
      threadId: currentThreadId,
      turnId
    });
    if (!response.ok) {
      addLog("error", response.error);
    }
  }

  async function approveLatest(decision: "accept" | "decline" | "cancel") {
    const request = logs.find((item) => {
      const body = (item.body as any) ?? {};
      return body?.id !== undefined && typeof body?.method === "string" && body.method.includes("request");
    });
    if (!request) {
      addLog("system", "No pending approval request found.");
      return;
    }

    const body = request.body as any;
    const response = await rpc("serverRequest.respond", {
      id: body.id,
      result: approvalResultFor(body.method, decision)
    });
    if (!response.ok) {
      addLog("error", response.error);
    }
  }

  function approvalResultFor(method: string, decision: "accept" | "decline" | "cancel") {
    if (method === "execCommandApproval" || method === "applyPatchApproval") {
      return {
        decision: decision === "accept" ? "approved" : decision === "decline" ? "denied" : "abort"
      };
    }
    return { decision };
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <h1>Codex Proxy</h1>
          <p>{connected ? "Connected to the relay and ready to use Codex." : "Connect to a Codex bridge to start."}</p>
        </div>
        <span className={connected ? "status online" : "status"}>{connected ? "Online" : "Offline"}</span>
      </section>

      {!connected ? (
        <form className="panel login" onSubmit={connect}>
          <label>
            Pairing code
            <input
              value={pairingCode}
              onChange={(event) => setPairingCode(event.target.value)}
              inputMode="numeric"
              autoFocus
            />
          </label>
          <label>
            Session ID
            <input
              value={selectedSession}
              onChange={(event) => setSelectedSession(event.target.value)}
              placeholder="Optional. Leave empty to use the first available bridge."
            />
          </label>
          {connectionMessage && <p className="login-message">{connectionMessage}</p>}
          <button type="submit" disabled={connecting || !pairingCode.trim()}>
            {connecting ? "Connecting..." : "Connect"}
          </button>
        </form>
      ) : (
        <>
          <section className="panel device">
            <div>
              <strong>{activeSession?.deviceName ?? "Codex Desktop"}</strong>
              <span>{activeSession?.sessionId}</span>
            </div>
            <div className="device-meta">
              <span>{activeSession?.bridgeOnline ? "bridge online" : "bridge offline"}</span>
              <span>{activeSession?.codex?.connected ? "Codex connected" : "Codex disconnected"}</span>
            </div>
          </section>

            <section className="grid">
            <aside className="sidebar">
              <div className="sidebar-head">
                <div className="workspace-summary-row">
                  <div className="workspace-header-line">
                    <h2>{isMobileWorkspaceTitle ? "会话" : "会话列表"}</h2>
                    <button type="button" className="secondary-button" onClick={() => refreshThreads()}>
                      {threadListLoading ? "刷新中" : "刷新"}
                    </button>
                  </div>
                  <div className="workspace-summary-line">
                    <p className="workspace-summary" role="status" aria-live="polite">
                      {workspaceSummaryText}
                    </p>
                    {workspaceSummaryStats.pills.length > 0 && (
                      <div className="workspace-summary-badges">
                        {workspaceGroups.length > 0 && !hasWorkspaceSearch && (
                          <button
                            type="button"
                            aria-pressed={allWorkspaceGroupsOpen}
                            className="workspace-toggle-all"
                            onClick={() => setAllWorkspaceGroupsOpen(!allWorkspaceGroupsOpen)}
                          >
                            {allWorkspaceGroupsOpen ? "收起全部" : "展开全部"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button type="button" className="new-thread" onClick={startNewThread}>
                新会话
              </button>
              <label aria-disabled={threadListLoading} aria-busy={threadListLoading ? "true" : undefined} className="workspace-search">
                <div className="workspace-search-top">
                  <span>搜索会话</span>
                  <span className="workspace-search-count" aria-live="polite">
                    {hasWorkspaceSearch ? `${visibleWorkspaceGroups.length}/${visibleThreadCount} 匹配` : ""}
                  </span>
                </div>
                <div className="workspace-search-control">
                  <input
                    ref={workspaceSearchInputRef}
                    type="search"
                    aria-label="搜索会话"
                    value={workspaceSearch}
                    inputMode="search"
                    onChange={(event) => setWorkspaceSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        clearWorkspaceSearch();
                      }
                    }}
                    autoCapitalize="off"
                    autoComplete="off"
                    disabled={threadListLoading}
                    enterKeyHint="search"
                    spellCheck={false}
                    placeholder="标题/内容/项目"
                  />
                    {workspaceSearch && (
                      <button
                        type="button"
                        aria-label="清空搜索"
                        className={`workspace-search-clear${searchClearPulsing ? " is-cleared" : ""}`}
                        disabled={threadListLoading}
                        title="清空搜索"
                        onClick={clearWorkspaceSearch}
                      >
                        <span aria-hidden="true">×</span>
                        <span className="sr-only">清空搜索</span>
                      </button>
                  )}
                </div>
              </label>
              <div className={threadListLoading ? "workspace-list loading" : "workspace-list"}>
                  {threadListLoading ? (
                    <div className="thread-list-loading" role="status" aria-live="polite">
                      <div className="empty-state">加载中…</div>
                      <div className="loading-skeleton">
                        <span className="loading-skeleton-line"></span>
                        <span className="loading-skeleton-line short"></span>
                        <span className="loading-skeleton-line medium"></span>
                        <span className="loading-skeleton-line long"></span>
                      </div>
                    </div>
                  ) : workspaceGroups.length === 0 ? (
                    <div className="empty-state">
                      <span className="empty-state-message empty-state-summary">{searchEmptyLabels.noDataMessage}</span>
                      <div
                        className="empty-state-action-block"
                        role="group"
                        aria-label="会话数据为空提示"
                      >
                        <span className="empty-state-subtitle">
                          <span aria-hidden="true" className="empty-state-subtitle-icon">
                            🧭
                          </span>
                          <span>快速开始</span>
                        </span>
                        <button
                          type="button"
                          className="empty-state-action empty-state-action-primary"
                          onClick={startNewThread}
                        >
                          <span aria-hidden="true" className="empty-state-action-icon-inline">＋</span>
                          立即新建会话
                        </button>
                        <button
                          type="button"
                          className="empty-state-action empty-state-action-secondary"
                          onClick={() => refreshThreads()}
                          title="刷新会话列表"
                          aria-label="刷新会话列表"
                        >
                          <span aria-hidden="true" className="empty-state-action-icon-inline">↻</span>
                          刷新列表
                        </button>
                        <p className="empty-state-mini-note">{searchEmptyLabels.noDataHint}</p>
                      </div>
                    </div>
                  ) : visibleWorkspaceGroups.length === 0 ? (
                    <div className="empty-state">
                      <span className="empty-state-message empty-state-summary">{workspaceSearchEmptyMessage}</span>
                      <div
                        className="empty-state-action-block"
                        role="group"
                        aria-label="会话搜索快速操作"
                      >
                        <span className="empty-state-subtitle">
                          <span aria-hidden="true" className="empty-state-subtitle-icon">
                            ⚡
                          </span>
                          <span>快速操作</span>
                        </span>
                        <div
                          className={`empty-state-actions ${
                            isWorkspaceSearchEmptyActionsCollapsed ? "empty-state-actions-collapsed" : "empty-state-actions-expanded"
                          }`}
                        >
                            <button
                              type="button"
                              className="empty-state-action empty-state-action-primary"
                              aria-label={searchEmptyLabels.open}
                              title={searchEmptyLabels.open}
                              onClick={resetWorkspaceSearchAll}
                            >
                              <span aria-hidden="true" className="empty-state-action-icon-inline">⌂</span>
                              所有会话
                            </button>
                            <button
                              type="button"
                              className="empty-state-action empty-state-action-secondary empty-state-action-priority"
                              aria-label={searchEmptyLabels.continueSearchSrLabel}
                              title={searchEmptyLabels.continueSearchAction}
                              onClick={focusWorkspaceSearchInput}
                            >
                              <span aria-hidden="true" className="empty-state-action-icon-inline">⌨</span>
                              {searchEmptyLabels.continueSearchAction}
                            </button>
                            <button
                              type="button"
                              className="empty-state-action"
                              aria-label={searchEmptyLabels.clearSrLabel}
                              title={searchEmptyLabels.clearTitle}
                              onClick={clearWorkspaceSearch}
                            >
                              <span aria-hidden="true" className="empty-state-action-icon-inline">↩</span>
                              {searchEmptyLabels.clear}
                            </button>
                            <span
                              id={emptySearchActionId}
                              role="region"
                              aria-label={searchEmptyActionsLabel}
                              aria-live="off"
                              className={`empty-state-extra-actions ${
                                isWorkspaceSearchEmptyActionsCollapsed ? "is-collapsed" : "is-expanded"
                              }`}
                              aria-hidden={isWorkspaceSearchEmptyActionsCollapsed ? "true" : "false"}
                            >
                              <button
                                type="button"
                                className="empty-state-action empty-state-action-secondary"
                                tabIndex={emptySearchActionTabIndex}
                                aria-label={narrowWorkspaceSearchLabel.srLabel}
                                onClick={narrowWorkspaceSearch}
                                title={narrowWorkspaceSearchLabel.title}
                              >
                                <span aria-hidden="true" className="empty-state-action-icon-inline">◂</span>
                                {narrowWorkspaceSearchLabel.action}
                              </button>
                              <button
                                type="button"
                                className="empty-state-action empty-state-action-secondary"
                                tabIndex={emptySearchActionTabIndex}
                                aria-label={searchEmptyLabels.restore.srLabel}
                                onClick={restoreWorkspaceSearchAndOpenAll}
                                title={searchEmptyLabels.restore.title}
                              >
                                <span aria-hidden="true" className="empty-state-action-icon-inline">↺</span>
                                {searchEmptyLabels.restore.action}
                              </button>
                            </span>
                          <p className="empty-state-mini-note">{searchEmptyLabels.continueSearchHint}</p>
                          <button
                            type="button"
                            className="empty-state-action empty-state-action-secondary"
                            onClick={() => refreshThreads()}
                            title="刷新会话列表"
                            aria-label="刷新会话列表"
                          >
                            <span aria-hidden="true" className="empty-state-action-icon-inline">↻</span>
                            刷新列表
                          </button>
                            <button
                              type="button"
                              className="empty-state-action empty-state-action-secondary"
                              aria-label="恢复最近会话"
                              onClick={restoreRecentThreadFromEmptyState}
                              disabled={threadListLoading || !threads[0]}
                            >
                              <span aria-hidden="true" className="empty-state-action-icon-inline">⟲</span>
                              恢复最近会话
                            </button>
                          {isMobileWorkspaceTitle && (
                            <button
                              type="button"
                              className={`empty-state-action empty-state-action-more ${
                                isWorkspaceSearchEmptyActionsCollapsed ? "empty-state-action-more-collapsed" : "empty-state-action-more-expanded"
                              }`}
                              aria-expanded={isWorkspaceSearchEmptyActionsCollapsed ? false : true}
                              aria-controls={emptySearchActionId}
                              aria-haspopup="true"
                              aria-label={isWorkspaceSearchEmptyActionsCollapsed ? "展开更多搜索操作" : "收起更多搜索操作"}
                              title={searchEmptyMoreLabel}
                              onClick={() => setSearchEmptyActionsExpanded((current) => !current)}
                            >
                              <span aria-hidden="true" className="empty-state-action-icon">
                                ▸
                              </span>
                              <span className="sr-only">
                                {searchEmptyMoreLabel}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                   visibleWorkspaceGroups.map((group) => {
                     const isOpen =
                       hasWorkspaceSearch ||
                       group.threads.some((thread) => thread.id === currentThreadId) ||
                       workspaceOpenByKey[group.key] !== false;
                     const threadListId = `threads-${safeDomId(group.key)}`;
                     return (
                       <section className="workspace-group" key={group.key}>
                         <button
                           type="button"
                           className="workspace-toggle"
                           aria-controls={threadListId}
                           aria-expanded={isOpen}
                           onClick={() => toggleWorkspace(group.key)}
                         >
                            <span className="workspace-chevron">▾</span>
                           <span className="workspace-title">
                             <strong>{highlightSearchTerm(group.name, workspaceSearch)}</strong>
                              <span>{highlightSearchTerm(group.cwd || "Unknown path", workspaceSearch)}</span>
                           </span>
                           <span className="workspace-count">{group.threads.length}</span>
                         </button>
                         {isOpen && (
                           <div className="thread-list" id={threadListId}>
                             {group.threads.map((thread) => (
                               <button
                                 type="button"
                                 key={thread.id}
                                 className={thread.id === currentThreadId ? "thread selected" : "thread"}
                                 onClick={() => selectThread(thread)}
                               >
                                 <strong>{highlightSearchTerm(threadTitle(thread), workspaceSearch)}</strong>
                                 <span>{formatThreadTime(thread)}</span>
                               </button>
                             ))}
                             <button
                               type="button"
                               className="workspace-new"
                               onClick={() => startThreadInWorkspace(group.cwd)}
                             >
                                New thread in this workspace
                              </button>
                           </div>
                         )}
                       </section>
                     );
                   })
                 )}
              </div>
              </aside>
              <section className="workspace-main">
                <div className="chat-head">
                  <div>
                    <h2>{currentTitle}</h2>
                    <p>{currentSubtitle}</p>
                  </div>
                  <div className="chat-head-actions">
                    <button type="button" className="secondary-button" onClick={() => setReplies([])}>
                      Loading thread history
                    </button>
                    <button type="button" className="secondary-button" onClick={interruptTurn}>
                      No messages yet
                    </button>
                  </div>
                </div>

                <div className="chat-shell">
                  <div className="chat-list" onScroll={updateChatPinnedState} ref={chatListRef}>
                    {threadLoading ? (
                      <article className="chat-empty">
                        <pre>Loading thread history...</pre>
                      </article>
                    ) : replies.length === 0 ? (
                    <article className="chat-empty">
                      <pre>Waiting for Codex response...</pre>
                    </article>
                    ) : (
                      replies.map((item) => (
                        <article key={item.id} className={`chat-row ${item.role}`}>
                          <div className="chat-bubble">
                            <header>
                              <span>{item.kind}</span>
                              <time>{new Date(item.ts).toLocaleTimeString()}</time>
                            </header>
                            <div className="chat-message">{renderChatText(String(item.body ?? ""))}</div>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                  {showChatBottomButton && (
                    <button className="chat-bottom-button" onClick={() => scrollChatToBottom()} type="button">
                      Scroll to latest
                    </button>
                  )}
                </div>

                {!currentThreadId && (
                  <label>
                    Working directory
                    <input
                      value={cwd}
                      onChange={(event) => setCwd(event.target.value)}
                      placeholder="For example: D:\\PROJECT\\CODE\\your-repo"
                    />
                  </label>
                )}
                <form onSubmit={sendPrompt}>
                  <textarea
                    ref={promptRef}
                    value={prompt}
                    onChange={(event) => updatePrompt(event.target.value)}
                    onKeyDown={handlePromptKeyDown}
                    placeholder="Ask Codex to edit, explain, or inspect this project."
                    rows={4}
                  />
                  <button type="submit" disabled={busy || !prompt.trim()}>
                    {busy ? "Sending..." : "Send"}
                  </button>
                </form>
                <div className="approval-row">
                  <button type="button" onClick={() => approveLatest("accept")}>
                    Approve
                  </button>
                  <button type="button" onClick={() => approveLatest("decline")}>
                    Decline
                  </button>
                </div>
                <div className={`work-status ${workStatus.phase}`}>
                  <span />
                  <div>
                    <strong>{workStatus.label}</strong>
                    {workStatus.detail && <p>{workStatus.detail}</p>}
                  </div>
                </div>
              </section>

              <section className="panel activity-panel">
                <div className="panel-head">
                  <h2>Activity</h2>
                </div>
                <div className="activity-list">
                  {activities.length === 0 ? (
                    <article className="activity-item empty">
                      <strong>No activity yet</strong>
                      <p>Codex activity, command output, file changes, and approval requests will appear here.</p>
                    </article>
                  ) : (
                    activities.map((item) => (
                      <article key={item.id} className={`activity-item ${item.state}`}>
                        <header>
                          <span>{item.kind}</span>
                          <time>{new Date(item.ts).toLocaleTimeString()}</time>
                        </header>
                        <strong>{item.title}</strong>
                        {item.detail && <ActivityDetail item={item} />}
                      </article>
                    ))
                  )}
                </div>
              </section>
            </section>

          <section className="panel events">
            <div className="panel-head">
              <h2>Logs</h2>
              <button type="button" onClick={() => setLogs([])}>
                Loading thread history
              </button>
            </div>
            <div className="event-list">
              {logs.map((item) => (
                <article key={item.id} className="event">
                  <header>
                    <span>{item.kind}</span>
                    <time>{new Date(item.ts).toLocaleTimeString()}</time>
                  </header>
                  <p>{eventSummary(item.body)}</p>
                  <details>
                    <summary>View JSON</summary>
                    <pre>{JSON.stringify(item.body, null, 2)}</pre>
                  </details>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

type ActivityDescriptor = Omit<ActivityItem, "ts"> & { phase: WorkPhase };

function isServerRequestMethod(method: string) {
  return (
    method === "item/commandExecution/requestApproval" ||
    method === "item/fileChange/requestApproval" ||
    method === "item/permissions/requestApproval" ||
    method === "item/tool/requestUserInput" ||
    method === "item/tool/call" ||
    method === "mcpServer/elicitation/request" ||
    method === "applyPatchApproval" ||
    method === "execCommandApproval" ||
    method === "account/chatgptAuthTokens/refresh"
  );
}

function describeServerRequest(method: string, params: any) {
  if (method === "item/commandExecution/requestApproval" || method === "execCommandApproval") {
    return {
      title: "Command approval required",
      detail: [params.command, params.cwd ? `Directory: ${params.cwd}` : "", params.reason].filter(Boolean).join("\n")
    };
  }
  if (method === "item/fileChange/requestApproval" || method === "applyPatchApproval") {
    return {
      title: "File change approval required",
      detail: [params.reason, params.grantRoot ? `Grant root: ${params.grantRoot}` : ""].filter(Boolean).join("\n")
    };
  }
  if (method === "item/tool/call") {
    return {
      title: "Tool call requested",
      detail: `${formatToolName(params.namespace, params.tool)}\n${formatJson(params.arguments)}`
    };
  }
  if (method === "mcpServer/elicitation/request") {
    return {
      title: "MCP elicitation requested",
      detail: [params.serverName, params.message, params.url].filter(Boolean).join("\n")
    };
  }
  if (method === "item/tool/requestUserInput") {
    return {
      title: "User input requested",
      detail: Array.isArray(params.questions)
        ? params.questions.map((question: any) => question.question || question.header || question.id).join("\n")
        : undefined
    };
  }
  if (method === "item/permissions/requestApproval") {
    return {
      title: "Permission approval required",
      detail: [params.reason, params.cwd ? `Directory: ${params.cwd}` : "", formatJson(params.permissions)]
        .filter(Boolean)
        .join("\n")
    };
  }
  return {
    title: "Codex request pending",
    detail: method
  };
}

function describeThreadItem(item: any, completed: boolean): ActivityDescriptor | undefined {
  if (!item || typeof item.type !== "string") {
    return undefined;
  }

  const itemId = typeof item.id === "string" ? item.id : `${item.type}:${Date.now()}`;
  if (item.type === "agentMessage") {
    return {
      id: `reply:${itemId}`,
      phase: "replying",
      kind: "Reply",
      title: completed ? "Reply completed" : "Generating reply",
      detail: completed ? "Assistant reply completed." : "Answer content is streaming back.",
      state: completed ? "done" : "running"
    };
  }
  if (item.type === "plan") {
    return {
      id: itemId,
      phase: "thinking",
      kind: "Plan",
      title: completed ? "Plan recorded" : "Making a plan",
      detail: typeof item.text === "string" ? item.text : undefined,
      state: completed ? "done" : "running"
    };
  }
  if (item.type === "reasoning") {
    return {
      id: itemId,
      phase: "thinking",
      kind: "Reasoning",
      title: completed ? "Reasoning completed" : "Thinking",
      detail: "Codex is analyzing context.",
      state: completed ? "done" : "running"
    };
  }
  if (item.type === "commandExecution") {
    const state = stateFromStatus(item.status, completed);
    return {
      id: itemId,
      phase: "tool",
      kind: "Tool",
      title: commandTitle(item.status, completed),
      detail: formatCommandItem(item),
      state
    };
  }
  if (item.type === "fileChange") {
    const state = stateFromStatus(item.status, completed);
    return {
      id: itemId,
      phase: "tool",
      kind: "File",
      title: state === "done" ? "File change completed" : state === "error" ? "File change failed" : "File change running",
      detail: formatFileChanges(item.changes),
      state
    };
  }
  if (item.type === "mcpToolCall") {
    const state = stateFromStatus(item.status, completed);
    return {
      id: itemId,
      phase: "tool",
      kind: "MCP",
      title: toolTitle("MCP tool", item.status, completed),
      detail: [
        `${item.server ?? "MCP"} / ${item.tool ?? "tool"}`,
        item.arguments ? formatJson(item.arguments) : "",
        item.error?.message ? `Error: ${item.error.message}` : ""
      ]
        .filter(Boolean)
        .join("\n"),
      state
    };
  }
  if (item.type === "dynamicToolCall") {
    const state = stateFromStatus(item.status, completed);
    return {
      id: itemId,
      phase: "tool",
      kind: "Tool",
      title: toolTitle("Tool call", item.status, completed),
      detail: [
        formatToolName(item.namespace, item.tool),
        item.arguments ? formatJson(item.arguments) : "",
        item.success === false ? "Result: failed" : ""
      ]
        .filter(Boolean)
        .join("\n"),
      state
    };
  }
  if (item.type === "collabAgentToolCall") {
    const state = stateFromStatus(item.status, completed);
    return {
      id: itemId,
      phase: "tool",
      kind: "Subtask",
      title: toolTitle("Subtask tool", item.status, completed),
      detail: [String(item.tool ?? ""), item.prompt ? shortenText(item.prompt, 800) : ""].filter(Boolean).join("\n"),
      state
    };
  }
  if (item.type === "webSearch") {
    return {
      id: itemId,
      phase: "tool",
      kind: "Search",
      title: completed ? "Search completed" : "Searching",
      detail: item.query,
      state: completed ? "done" : "running"
    };
  }
  if (item.type === "imageGeneration") {
    const state = stateFromStatus(item.status, completed);
    return {
      id: itemId,
      phase: "tool",
      kind: "Image",
      title: state === "done" ? "Image generated" : "Generating image",
      detail: [item.revisedPrompt, item.savedPath].filter(Boolean).join("\n"),
      state
    };
  }
  if (item.type === "imageView") {
    return {
      id: itemId,
      phase: "tool",
      kind: "Image",
      title: "View image",
      detail: item.path,
      state: completed ? "done" : "running"
    };
  }
  return {
    id: itemId,
    phase: "tool",
    kind: "Item",
    title: completed ? `${item.type} completed` : `${item.type} running`,
    state: completed ? "done" : "running"
  };
}

function formatPlanUpdate(params: any) {
  const explanation = typeof params.explanation === "string" && params.explanation.trim() ? params.explanation : "";
  const steps = Array.isArray(params.plan)
    ? params.plan
        .map((step: any) => `${statusLabel(step?.status)} ${String(step?.step ?? "")}`.trim())
        .filter(Boolean)
        .join("\n")
    : "";
  return [explanation, steps].filter(Boolean).join("\n");
}

function currentPlanStep(plan: unknown) {
  if (!Array.isArray(plan)) {
    return undefined;
  }
  const current = plan.find((step: any) => step?.status === "inProgress");
  return current?.step ? String(current.step) : undefined;
}

function filterWorkspaceGroups(groups: WorkspaceGroup[], query: string) {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) {
    return groups;
  }
  return groups
    .map((group) => {
      const groupMatches = [group.name, group.cwd].some((value) => value.toLowerCase().includes(cleanQuery));
      if (groupMatches) {
        return group;
      }
      const threads = group.threads.filter((thread) => threadMatchesQuery(thread, cleanQuery));
      return threads.length ? { ...group, threads } : undefined;
    })
    .filter((group): group is WorkspaceGroup => Boolean(group));
}

function threadMatchesQuery(thread: ThreadSummary, query: string) {
  return [thread.name, thread.preview, thread.cwd, thread.id]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .some((value) => value.toLowerCase().includes(query));
}

function highlightSearchTerm(value: string, query: string): React.ReactNode {
  const text = value || "";
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return text;
  }
  const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(escaped, "ig");
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text)) !== null) {
    const start = match.index;
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }
    nodes.push(
      <mark className="search-highlight" key={`mark-${start}`}>
        {match[0]}
      </mark>
    );
    lastIndex = matcher.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  if (!nodes.length) {
    return text;
  }

  return <>{nodes}</>;
}

function groupThreadsByCwd(list: ThreadSummary[]): WorkspaceGroup[] {
  const map = new Map<string, WorkspaceGroup>();
  for (const thread of list) {
    const cwd = normalizeCwd(thread.cwd);
    const key = workspaceKey(cwd);
    const existing = map.get(key);
    if (existing) {
      existing.threads.push(thread);
    } else {
      map.set(key, {
        key,
        cwd,
        name: workspaceName(cwd),
        threads: [thread]
      });
    }
  }

  return [...map.values()].map((group) => ({
    ...group,
    threads: group.threads.slice().sort(compareThreadsByUpdatedAt)
  }));
}

function compareThreadsByUpdatedAt(a: ThreadSummary, b: ThreadSummary) {
  return timestampToMs(b.updatedAt ?? b.createdAt) - timestampToMs(a.updatedAt ?? a.createdAt);
}

function normalizeCwd(cwd: unknown) {
  return typeof cwd === "string" ? cwd.trim() : "";
}

function workspaceName(cwd: string) {
  if (!cwd) {
    return "No working directory set";
  }
  const clean = cwd.replace(/[\\/]+$/, "");
  const parts = clean.split(/[\\/]/);
  return parts.at(-1) || clean;
}

function workspaceKey(cwd: string) {
  return cwd || "__none__";
}

function safeDomId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function threadTitle(thread: ThreadSummary | undefined) {
  return thread?.name || thread?.preview || thread?.id || "Untitled thread";
}

function formatThreadTime(thread: ThreadSummary) {
  const value = thread.updatedAt ?? thread.createdAt;
  const ms = timestampToMs(value);
  return ms ? new Date(ms).toLocaleString() : "No time information";
}

function timestampToMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1000000000000 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function upsertReplyItems(items: ReplyItem[], next: ReplyItem) {
  const existingIndex = items.findIndex((item) => item.id === next.id);
  if (existingIndex >= 0) {
    const updated = items.slice();
    updated[existingIndex] = { ...updated[existingIndex]!, ...next };
    return updated.slice(-80);
  }
  return [...items, next].slice(-80);
}

function isNearChatBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
}

function labelForRole(role: ChatHistoryMessage["role"]) {
  if (role === "user") {
    return "You";
  }
  if (role === "assistant") {
    return "Codex";
  }
  return "System";
}

function ActivityDetail({ item }: { item: ActivityItem }) {
  const blocks = activityDetailBlocks(item);
  return (
    <div className="activity-detail-blocks">
      {blocks.map((block, index) => {
        if (block.kind === "command") {
          return (
            <div className="activity-command" key={index}>
              <div className="activity-kv">
                <span>Command</span>
                <code>{block.command}</code>
              </div>
              {block.cwd && (
                <div className="activity-kv">
                  <span>Directory</span>
                  <code>{block.cwd}</code>
                </div>
              )}
              {block.exitCode && (
                <div className="activity-kv">
                  <span>Exit code</span>
                  <code>{block.exitCode}</code>
                </div>
              )}
              {block.output && <pre className="activity-output">{block.output}</pre>}
            </div>
          );
        }
        if (block.kind === "files") {
          return (
            <ul className="activity-file-list" key={index}>
              {block.files.map((file, fileIndex) => (
                <li key={fileIndex}>
                  <span>{file.action}</span>
                  <code>{file.path}</code>
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === "plan") {
          return (
            <div className="activity-plan" key={index}>
              {block.explanation && <p>{block.explanation}</p>}
              <ol>
                {block.steps.map((step, stepIndex) => (
                  <li className={`plan-step ${planStepClass(step.status)}`} key={stepIndex}>
                    <span>{step.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        }
        if (block.kind === "tool") {
          return (
            <div className="activity-tool" key={index}>
              {block.name && (
                <div className="activity-kv">
                  <span>Tool</span>
                  <code>{block.name}</code>
                </div>
              )}
              {block.payload && <pre className="activity-output">{block.payload}</pre>}
              {block.error && <p className="activity-error">{block.error}</p>}
            </div>
          );
        }
        return (
          <p className="activity-text" key={index}>
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

function activityDetailBlocks(item: ActivityItem): ActivityDetailBlock[] {
  const detail = item.detail?.trim();
  if (!detail) {
    return [];
  }
  if (item.kind === "Tool" && (detail.startsWith("$ ") || detail.includes("\nDirectory:") || detail.includes("\nExit code:"))) {
    return [parseCommandDetail(detail)];
  }
  if (item.kind === "File") {
    const files = detail
      .split("\n")
      .map(parseFileChangeLine)
      .filter((file): file is { action: string; path: string } => Boolean(file));
    if (files.length) {
      return [{ kind: "files", files }];
    }
  }
  if (item.kind === "Plan") {
    const plan = parsePlanDetail(detail);
    if (plan.steps.length) {
      return [plan];
    }
  }
  if (item.kind === "MCP" || item.kind === "Subtask" || (item.kind === "Tool" && !detail.startsWith("$ "))) {
    return [parseToolDetail(detail)];
  }
  return detail.split("\n\n").map((text) => ({ kind: "text", text }));
}

function parseCommandDetail(detail: string): ActivityDetailBlock {
  const lines = detail.split("\n");
  const command = lines[0]?.startsWith("$ ") ? lines.shift()!.slice(2) : "";
  let cwd = "";
  let exitCode = "";
  const output: string[] = [];
  for (const line of lines) {
    if (line.startsWith("Directory:")) {
      cwd = line.slice("Directory:".length);
    } else if (line.startsWith("Exit code:")) {
      exitCode = line.slice("Exit code:".length);
    } else {
      output.push(line);
    }
  }
  return { kind: "command", command: command || detail, cwd, exitCode, output: output.join("\n").trim() };
}

function parseFileChangeLine(line: string) {
  const match = /^(\S+)\s+(.+)$/.exec(line.trim());
  if (!match) {
    return line.trim() ? { action: "change", path: line.trim() } : undefined;
  }
  return { action: match[1]!, path: match[2]! };
}

function parsePlanDetail(detail: string): Extract<ActivityDetailBlock, { kind: "plan" }> {
  const steps: { status: string; text: string }[] = [];
  const explanation: string[] = [];
  for (const line of detail.split("\n")) {
    const match = /^([✓→·-])\s*(.+)$/.exec(line.trim());
    if (match) {
      steps.push({ status: match[1]!, text: match[2]!.trim() });
    } else if (line.trim()) {
      explanation.push(line.trim());
    }
  }
  return { kind: "plan", explanation: explanation.join("\n"), steps };
}

function parseToolDetail(detail: string): ActivityDetailBlock {
  const lines = detail.split("\n");
  const name = lines.shift()?.trim();
  const rest = lines.join("\n").trim();
  const errorLine = lines.find((line) => line.startsWith("Error:"));
  return {
    kind: "tool",
    name,
    payload: errorLine ? rest.replace(errorLine, "").trim() : rest,
    error: errorLine ? errorLine.slice("Error:".length) : undefined
  };
}

function planStepClass(status: string) {
  if (status === "✓") return "done";
  if (status === "→") return "running";
  if (status === "·") return "waiting";
  return "pending";
}

function eventSummary(body: unknown) {
  const value = body as any;
  const message = value?.message ?? value;
  const method = typeof message?.method === "string" ? message.method : "";
  if (!method) {
    return typeof body === "string" ? body : "Raw event";
  }
  const params = message.params ?? {};
  if (method === "item/commandExecution/outputDelta") return "Command output updated";
  if (method === "item/fileChange/patchUpdated") return "File patch updated";
  if (method === "item/agentMessage/delta") return "Assistant reply streaming";
  if (method === "turn/plan/updated") return currentPlanStep(params.plan) ?? "Plan updated";
  if (method === "item/completed" && params.item?.type) return `${params.item.type} completed`;
  return method;
}

type ChatTextPart =
  | { kind: "block"; type: "paragraph" | "heading" | "quote"; text: string; level?: number }
  | { kind: "rule" }
  | { kind: "list"; ordered: boolean; items: ChatListItem[] }
  | { kind: "table"; headers: string[]; rows: string[][]; aligns: ChatTableAlign[] }
  | { kind: "code"; code: string; language?: string };

type ChatListItem = {
  text: string;
  checked?: boolean;
};

type ChatTableAlign = "left" | "center" | "right" | undefined;

function renderChatText(text: string) {
  const parts = parseMarkdownBlocks(text);
  return parts.map((part, index) => {
    if (part.kind === "code") {
      return (
        <div className="chat-code" key={index}>
          <div className="chat-code-head">
            {part.language ? <span className="chat-code-lang">{part.language}</span> : <span />}
            <CodeCopyButton code={part.code} />
          </div>
          <pre>{part.code}</pre>
        </div>
      );
    }
    if (part.kind === "list") {
      const Tag = part.ordered ? "ol" : "ul";
      const taskList = part.items.some((item) => item.checked !== undefined);
      return (
        <Tag className={taskList ? "task-list" : undefined} key={index}>
          {part.items.map((item, itemIndex) => (
            <li className={item.checked !== undefined ? "task-list-item" : undefined} key={itemIndex}>
              {item.checked !== undefined && <input type="checkbox" checked={item.checked} readOnly tabIndex={-1} />}
              <span>{renderInlineMarkdown(item.text)}</span>
            </li>
          ))}
        </Tag>
      );
    }
    if (part.kind === "table") {
      return (
        <div className="chat-table-wrap" key={index}>
          <table className="chat-table">
            <thead>
              <tr>
                {part.headers.map((header, headerIndex) => (
                  <th key={headerIndex} style={styleForTableAlign(part.aligns[headerIndex])}>
                    {renderInlineMarkdown(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {part.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} style={styleForTableAlign(part.aligns[cellIndex])}>
                      {renderInlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (part.kind === "rule") {
      return <hr key={index} />;
    }
    if (part.kind === "block" && part.type === "heading") {
      const level = Math.min(Math.max(part.level ?? 3, 1), 4);
      if (level === 1) return <h1 key={index}>{renderInlineMarkdown(part.text)}</h1>;
      if (level === 2) return <h2 key={index}>{renderInlineMarkdown(part.text)}</h2>;
      if (level === 4) return <h4 key={index}>{renderInlineMarkdown(part.text)}</h4>;
      return <h3 key={index}>{renderInlineMarkdown(part.text)}</h3>;
    }
    if (part.kind === "block" && part.type === "quote") {
      return <blockquote key={index}>{renderInlineMarkdown(part.text)}</blockquote>;
    }
    if (part.kind === "block") {
      return <p key={index}>{renderInlineMarkdown(part.text)}</p>;
    }
    return null;
  });
}

function parseMarkdownBlocks(text: string): ChatTextPart[] {
  const parts: ChatTextPart[] = [];
  const fence = "```";
  let cursor = 0;

  while (cursor < text.length) {
    const fenceStart = text.indexOf(fence, cursor);
    if (fenceStart === -1) {
      break;
    }

    if (fenceStart > cursor) {
      parts.push(...parseTextBlocks(text.slice(cursor, fenceStart)));
    }

    const infoStart = fenceStart + fence.length;
    const lineEnd = text.indexOf("\n", infoStart);
    if (lineEnd === -1) {
      parts.push({
        kind: "code",
        language: text.slice(infoStart).trim() || undefined,
        code: ""
      });
      cursor = text.length;
      break;
    }

    const codeStart = lineEnd + 1;
    const fenceEnd = text.indexOf(fence, codeStart);
    parts.push({
      kind: "code",
      language: text.slice(infoStart, lineEnd).trim() || undefined,
      code: fenceEnd === -1 ? text.slice(codeStart) : text.slice(codeStart, fenceEnd)
    });
    if (fenceEnd === -1) {
      cursor = text.length;
      break;
    }
    cursor = fenceEnd + fence.length;
  }

  if (cursor < text.length) {
    parts.push(...parseTextBlocks(text.slice(cursor)));
  }

  return parts.length ? parts : [{ kind: "block", type: "paragraph", text }];
}

function parseTextBlocks(text: string): ChatTextPart[] {
  const blocks: ChatTextPart[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: ChatListItem[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "block", type: "paragraph", text: paragraph.join("\n").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
      list = null;
    }
  };

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index]!;
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const nextLine = lines[index + 1]?.trimEnd();
    if (nextLine && isTableDivider(nextLine) && splitTableRow(line).length > 1) {
      flushParagraph();
      flushList();
      const headers = splitTableRow(line);
      const aligns = tableAlignsFromDivider(nextLine, headers.length);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const tableLine = lines[index]!.trimEnd();
        if (!tableLine.trim() || !isTableRow(tableLine)) {
          index--;
          break;
        }
        rows.push(normalizeTableCells(splitTableRow(tableLine), headers.length));
        index++;
      }
      blocks.push({ kind: "table", headers, rows, aligns });
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "rule" });
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "block", type: "heading", level: heading[1]!.length, text: heading[2]!.trim() });
      continue;
    }

    const quote = /^>\s?(.+)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "block", type: "quote", text: quote[1]!.trim() });
      continue;
    }

    const unordered = /^\s*[-*]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push(parseListItem(ordered?.[1] ?? unordered?.[1] ?? "", Boolean(unordered)));
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function renderInlineMarkdown(text: string) {
  const nodes: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]\n]+\]\([^\s)]+(?:\s+"[^"]*")?\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(<code key={nodes.length}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[")) {
      const link = /^\[([^\]\n]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)$/.exec(token);
      const href = link ? safeLinkHref(link[2]!) : undefined;
      if (link && href) {
        nodes.push(
          <a href={href} key={nodes.length} rel="noreferrer" target="_blank">
            {link[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(<strong key={nodes.length}>{token.slice(2, -2)}</strong>);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function parseListItem(value: string, allowTask: boolean): ChatListItem {
  const task = allowTask ? /^\[([ xX])\]\s+(.+)$/.exec(value.trim()) : null;
  if (task) {
    return {
      text: task[2]!.trim(),
      checked: task[1]!.toLowerCase() === "x"
    };
  }
  return { text: value.trim() };
}

function splitTableRow(line: string) {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  return value.split("|").map((cell) => cell.trim());
}

function isTableRow(line: string) {
  return line.includes("|") && splitTableRow(line).length > 1;
}

function isTableDivider(line: string) {
  const cells = splitTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function tableAlignsFromDivider(line: string, width: number): ChatTableAlign[] {
  return normalizeTableCells(splitTableRow(line), width).map((cell) => {
    const value = cell.replace(/\s+/g, "");
    if (value.startsWith(":") && value.endsWith(":")) return "center";
    if (value.endsWith(":")) return "right";
    if (value.startsWith(":")) return "left";
    return undefined;
  });
}

function normalizeTableCells(cells: string[], width: number) {
  return Array.from({ length: width }, (_, index) => cells[index] ?? "");
}

function styleForTableAlign(align: ChatTableAlign): React.CSSProperties | undefined {
  return align ? { textAlign: align } : undefined;
}

function safeLinkHref(href: string) {
  const value = href.trim();
  if (/^(https?:|mailto:|tel:)/i.test(value) || value.startsWith("/") || value.startsWith("#")) {
    return value;
  }
  return undefined;
}

function CodeCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await copyTextToClipboard(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button className="chat-code-copy" onClick={copyCode} type="button">
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function readWorkspaceOpenState(): Record<string, boolean> {
  try {
    const value = JSON.parse(localStorage.getItem("workspaceOpenByKey") || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveWorkspaceOpenState(value: Record<string, boolean>) {
  localStorage.setItem("workspaceOpenByKey", JSON.stringify(value));
}

function formatCommandItem(item: any) {
  const parts = [
    item.command ? `$ ${item.command}` : "",
    item.cwd ? `Directory: ${item.cwd}` : "",
    item.exitCode !== null && item.exitCode !== undefined ? `Exit code: ${item.exitCode}` : "",
    item.aggregatedOutput ? shortenText(String(item.aggregatedOutput), 1800) : ""
  ];
  return parts.filter(Boolean).join("\n");
}

function formatFileChanges(changes: unknown) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return "";
  }
  return changes
    .map((change: any) => `${change.kind ?? "change"} ${change.path ?? ""}`.trim())
    .filter(Boolean)
    .join("\n");
}

function formatHookRun(run: any) {
  if (!run) {
    return "";
  }
  return [run.eventName, run.handlerType, run.statusMessage, run.sourcePath].filter(Boolean).join("\n");
}

function stateFromStatus(status: unknown, completed: boolean): ActivityState {
  const value = String(status ?? "").toLowerCase();
  if (["failed", "declined", "errored", "blocked", "error"].includes(value)) {
    return "error";
  }
  if (["pending", "pendinginit", "waiting"].includes(value)) {
    return "waiting";
  }
  if (completed || ["completed", "success", "succeeded"].includes(value)) {
    return "done";
  }
  return "running";
}

function commandTitle(status: unknown, completed: boolean) {
  const state = stateFromStatus(status, completed);
  if (state === "done") {
    return "Command completed";
  }
  if (state === "error") {
    return "Command failed";
  }
  if (state === "waiting") {
    return "Command waiting";
  }
  return "Command running";
}

function toolTitle(name: string, status: unknown, completed: boolean) {
  const state = stateFromStatus(status, completed);
  if (state === "done") {
    return `${name} completed`;
  }
  if (state === "error") {
    return `${name} failed`;
  }
  if (state === "waiting") {
    return `${name} waiting`;
  }
  return `${name} running`;
}

function statusLabel(status: unknown) {
  switch (status) {
    case "completed":
      return "✓";
    case "inProgress":
      return "→";
    case "pending":
      return "·";
    default:
      return "-";
  }
}

function formatToolName(namespace: unknown, tool: unknown) {
  return [namespace, tool].filter(Boolean).join(".") || "tool";
}

function formatJson(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  try {
    return shortenText(JSON.stringify(value, null, 2), 1200);
  } catch {
    return shortenText(String(value), 1200);
  }
}

function shortenText(text: string, max: number) {
  if (!text || text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}\n...truncated ${text.length - max} characters`;
}

createRoot(document.getElementById("root")!).render(<App />);
