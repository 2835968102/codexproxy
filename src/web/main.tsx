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
  label: "空闲",
  detail: "发送消息后会显示 Codex 的实时状态。"
};

function App() {
  const [pairingCode, setPairingCode] = useState(localStorage.getItem("pairingCode") ?? "");
  const [selectedSession, setSelectedSession] = useState(localStorage.getItem("sessionId") ?? "");
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<SessionSummary | undefined>();
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [replies, setReplies] = useState<ReplyItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [workStatus, setWorkStatus] = useState<WorkStatus>(idleWorkStatus);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cwd, setCwd] = useState("");
  const [workspaceOpenByKey, setWorkspaceOpenByKey] = useState<Record<string, boolean>>(() =>
    readWorkspaceOpenState()
  );
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("");
  const [threadListLoading, setThreadListLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [showChatBottomButton, setShowChatBottomButton] = useState(false);

  const socketRef = useRef<WebSocket | undefined>(undefined);
  const pendingRef = useRef(new Map<string, Pending>());
  const currentTurnByThread = useRef(new Map<string, string>());
  const currentThreadIdRef = useRef(currentThreadId);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const chatPinnedRef = useRef(true);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const activeReplyIdRef = useRef<string | undefined>(undefined);
  const retryingWithoutSessionRef = useRef(false);

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
      requestAnimationFrame(() => scrollChatToBottom("auto"));
    } else if (replies.length) {
      setShowChatBottomButton(true);
    }
  }, [replies]);

  useEffect(() => {
    resizePrompt();
  }, [prompt]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === currentThreadId),
    [threads, currentThreadId]
  );
  const workspaceGroups = useMemo(() => groupThreadsByCwd(threads), [threads]);
  const currentTitle = currentThreadId ? threadTitle(activeThread) : "新线程";
  const currentSubtitle = currentThreadId
    ? normalizeCwd(activeThread?.cwd) || "未设置工作目录"
    : cwd.trim() || "选择项目或输入工作目录后发送第一条消息";

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

  function scrollChatToBottom(behavior: ScrollBehavior = "smooth") {
    const el = chatListRef.current;
    if (!el) {
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior });
    chatPinnedRef.current = true;
    setShowChatBottomButton(false);
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

  function replaceRepliesFromHistory(thread: unknown) {
    const messages = messagesFromThreadHistory(thread);
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

  function connect(event?: FormEvent) {
    event?.preventDefault();
    const cleanPairingCode = pairingCode.trim();
    const cleanSessionId = selectedSession.trim();
    setConnecting(true);
    setConnectionMessage("正在连接...");
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
      setConnectionMessage("连接已断开。请确认配对码、地址和 bridge 状态。");
      addLog("system", "连接已断开");
    };

    ws.onerror = () => {
      setConnecting(false);
      setConnectionMessage("WebSocket 连接错误。请确认手机能访问这个地址，或检查防火墙。");
      addLog("error", "WebSocket 连接错误");
    };
  }

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
      addLog("system", "已连接服务器");
      void refreshThreads();
      return;
    }

    if (envelope.type === "error") {
      const payload = envelope.payload as any;
      const message = payload?.message ?? "连接失败";
      if (message === "Requested session is not connected." && !retryingWithoutSessionRef.current) {
        retryingWithoutSessionRef.current = true;
        setSelectedSession("");
        localStorage.removeItem("sessionId");
        setConnectionMessage("旧 Session ID 已失效，正在自动改为留空重连...");
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
          setConnectionMessage("连接已断开。请确认配对码、地址和 bridge 状态。");
        };
        ws.onerror = () => {
          setConnecting(false);
          setConnectionMessage("WebSocket 连接错误。请确认手机能访问这个地址，或检查防火墙。");
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
          kind: "状态",
          title: "已创建对话",
          detail: params.thread?.cwd ? `工作目录：${params.thread.cwd}` : undefined,
          state: "done"
        });
        return;
      case "turn/started": {
        const turnId = params.turn?.id ?? params.turnId ?? "active";
        setWork("thinking", "正在思考", "Codex 已开始处理这条消息。");
        upsertActivity({
          id: `turn:${turnId}`,
          kind: "状态",
          title: "开始处理请求",
          detail: "正在分析上下文、规划下一步。",
          state: "running"
        });
        return;
      }
      case "turn/plan/updated": {
        const detail = formatPlanUpdate(params);
        const running = Array.isArray(params.plan) && params.plan.some((step: any) => step?.status === "inProgress");
        setWork("thinking", "计划已更新", currentPlanStep(params.plan) ?? "Codex 正在规划下一步。");
        upsertActivity({
          id: `plan:${params.turnId ?? "active"}`,
          kind: "计划",
          title: "计划已更新",
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
        setWork("replying", "正在回复", "Codex 正在输出回答。");
        upsertActivity({
          id: `reply:${id}`,
          kind: "回复",
          title: "正在生成回复",
          detail: "回答内容正在流式返回。",
          state: "running"
        });
        return;
      }
      case "item/plan/delta": {
        const id = params.itemId || `plan:${params.turnId ?? "active"}`;
        setWork("thinking", "正在更新计划", "Codex 正在整理执行步骤。");
        appendActivityDetail(
          id,
          { kind: "计划", title: "正在更新计划", state: "running" },
          String(params.delta ?? "")
        );
        return;
      }
      case "item/commandExecution/outputDelta": {
        const id = params.itemId || `command:${params.turnId ?? "active"}`;
        setWork("tool", "命令正在输出", "Codex 调用的命令正在返回结果。");
        appendActivityDetail(
          id,
          { kind: "工具", title: "命令正在输出", state: "running" },
          String(params.delta ?? "")
        );
        return;
      }
      case "item/fileChange/outputDelta": {
        const id = params.itemId || `file:${params.turnId ?? "active"}`;
        setWork("tool", "文件修改中", "Codex 正在应用文件变更。");
        appendActivityDetail(
          id,
          { kind: "文件", title: "文件修改输出", state: "running" },
          String(params.delta ?? "")
        );
        return;
      }
      case "item/fileChange/patchUpdated": {
        const id = params.itemId || `file:${params.turnId ?? "active"}`;
        setWork("tool", "文件改动已更新", "Codex 正在准备或应用补丁。");
        upsertActivity({
          id,
          kind: "文件",
          title: "文件改动已更新",
          detail: formatFileChanges(params.changes),
          state: "running"
        });
        return;
      }
      case "item/mcpToolCall/progress": {
        const id = params.itemId || `mcp:${params.turnId ?? "active"}`;
        setWork("tool", "MCP 工具运行中", String(params.message ?? "工具正在返回进度。"));
        upsertActivity({
          id,
          kind: "MCP",
          title: "MCP 工具运行中",
          detail: String(params.message ?? ""),
          state: "running"
        });
        return;
      }
      case "item/reasoning/summaryPartAdded":
      case "item/reasoning/summaryTextDelta":
      case "item/reasoning/textDelta": {
        const id = params.itemId || `reasoning:${params.turnId ?? "active"}`;
        setWork("thinking", "正在思考", "Codex 正在分析上下文。");
        upsertActivity({
          id,
          kind: "思考",
          title: "正在思考",
          detail: "收到推理进度更新。",
          state: "running"
        });
        return;
      }
      case "hook/started":
        setWork("tool", "Hook 运行中", formatHookRun(params.run));
        upsertActivity({
          id: `hook:${params.run?.id ?? Date.now()}`,
          kind: "Hook",
          title: "Hook 运行中",
          detail: formatHookRun(params.run),
          state: "running"
        });
        return;
      case "hook/completed":
        setWork(params.run?.status === "failed" ? "error" : "tool", "Hook 已完成", formatHookRun(params.run));
        upsertActivity({
          id: `hook:${params.run?.id ?? Date.now()}`,
          kind: "Hook",
          title: params.run?.status === "failed" ? "Hook 失败" : "Hook 已完成",
          detail: formatHookRun(params.run),
          state: params.run?.status === "failed" ? "error" : "done"
        });
        return;
      case "serverRequest/resolved":
        setWork("thinking", "审批已处理", "Codex 继续执行当前任务。");
        upsertActivity({
          id: `request:${params.requestId ?? Date.now()}`,
          kind: "审批",
          title: "审批已处理",
          state: "done"
        });
        return;
      case "turn/completed": {
        const turnId = params.turn?.id ?? params.turnId ?? "active";
        const state = params.turn?.status === "failed" ? "error" : "done";
        const title =
          params.turn?.status === "interrupted"
            ? "已打断"
            : params.turn?.status === "failed"
              ? "处理失败"
              : "处理完成";
        const detail =
          params.turn?.error?.message ??
          (params.turn?.status === "interrupted" ? "这次回复已被打断。" : "Codex 已完成这次回复。");
        setWork(state === "error" ? "error" : "complete", title, detail);
        upsertActivity({
          id: `turn:${turnId}`,
          kind: "状态",
          title,
          detail,
          state
        });
        return;
      }
      case "error":
        setWork("error", "Codex 返回错误", String(params.message ?? "未知错误"));
        upsertActivity({
          id: `error:${Date.now()}`,
          kind: "错误",
          title: "Codex 返回错误",
          detail: String(params.message ?? "未知错误"),
          state: "error"
        });
        return;
      case "warning":
      case "guardianWarning":
      case "configWarning":
        upsertActivity({
          id: `${msg.method}:${Date.now()}`,
          kind: "警告",
          title: "Codex 警告",
          detail: String(params.message ?? params.warning ?? "收到警告。"),
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
      kind: "审批",
      title: request.title,
      detail: request.detail,
      state: "waiting"
    });
  }

  function rpc(method: string, params?: unknown): Promise<RpcResponsePayload> {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("尚未连接");
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
        reject(new Error("请求超时"));
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

  async function refreshThreads(preferredThreadId = currentThreadId) {
    setThreadListLoading(true);
    try {
      const response = await rpc("thread.list", { limit: 25, archived: false });
      if (!response.ok) {
        throw new Error(response.error);
      }

      const result = response.result as any;
      const list = result?.threads ?? result?.items ?? result?.data ?? result ?? [];
      setThreads(Array.isArray(list) ? (list as ThreadSummary[]) : []);
      if (preferredThreadId) {
        setCurrentThreadId(preferredThreadId);
      } else if (Array.isArray(list) && list[0]?.id) {
        setCurrentThreadId(list[0].id);
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
    setThreadLoading(true);
    setWork("thinking", "正在加载历史记录", "正在读取这个对话的消息和活动状态。");
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
      setWork("complete", "历史记录已加载", "已切换到选中的对话。");
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : error);
      setWork("error", "历史加载失败", error instanceof Error ? error.message : String(error));
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
    setWork("thinking", "等待 Codex 开始处理", "请求已发出，正在等待 Codex 事件流。");
    setReplies((items) => {
      const next: ReplyItem = { id: userReplyId, ts: Date.now(), kind: "你", role: "user", body: submittedPrompt };
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
      setWork("error", "发送失败", error instanceof Error ? error.message : String(error));
      upsertActivity({
        id: `send-error:${Date.now()}`,
        kind: "错误",
        title: "发送失败",
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
    chatPinnedRef.current = true;
    setShowChatBottomButton(false);
    setThreadLoading(false);
    setCurrentThreadId("");
    setPrompt("");
    setReplies([]);
    setWork("idle", idleWorkStatus.label, idleWorkStatus.detail);
  }

  function selectThread(thread: ThreadSummary) {
    chatPinnedRef.current = true;
    setShowChatBottomButton(false);
    setCurrentThreadId(thread.id);
    const nextCwd = normalizeCwd(thread.cwd);
    if (nextCwd) {
      setCwd(nextCwd);
    }
    void loadThreadHistory(thread.id);
  }

  function startThreadInWorkspace(nextCwd: string) {
    chatPinnedRef.current = true;
    setShowChatBottomButton(false);
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
      addLog("system", "当前线程没有正在运行的 turn");
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
      addLog("system", "没有找到待审批请求");
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
          <p>{connected ? "手机控制台已连接" : "输入配对码连接服务器上的 Codex bridge"}</p>
        </div>
        <span className={connected ? "status online" : "status"}>{connected ? "在线" : "离线"}</span>
      </section>

      {!connected ? (
        <form className="panel login" onSubmit={connect}>
          <label>
            配对码
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
              placeholder="可选，只有多台 bridge 时需要"
            />
          </label>
          {connectionMessage && <p className="login-message">{connectionMessage}</p>}
          <button type="submit" disabled={connecting || !pairingCode.trim()}>
            {connecting ? "连接中" : "连接"}
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
              <span>{activeSession?.bridgeOnline ? "bridge 在线" : "bridge 离线"}</span>
              <span>{activeSession?.codex?.connected ? "Codex 已连接" : "Codex 未连接"}</span>
            </div>
          </section>

          <section className="grid">
            <aside className="sidebar">
              <div className="sidebar-head">
                <div>
                  <h2>项目</h2>
                  <p>{workspaceGroups.length ? `${workspaceGroups.length} 个文件夹 · ${threads.length} 个对话` : "暂无项目"}</p>
                </div>
                <button type="button" className="secondary-button" onClick={() => refreshThreads()}>
                  {threadListLoading ? "刷新中" : "刷新"}
                </button>
              </div>
              <button type="button" className="new-thread" onClick={startNewThread}>
                新线程
              </button>
              <div className="workspace-list">
                {workspaceGroups.length === 0 ? (
                  <div className="empty-state">
                    还没有历史对话。输入工作目录并发送消息后，这里会按项目自动归档。
                  </div>
                ) : (
                  workspaceGroups.map((group) => {
                    const isOpen =
                      group.threads.some((thread) => thread.id === currentThreadId) ||
                      workspaceOpenByKey[group.key] !== false;
                    return (
                      <section className="workspace-group" key={group.key}>
                        <button
                          type="button"
                          className="workspace-toggle"
                          aria-expanded={isOpen}
                          onClick={() => toggleWorkspace(group.key)}
                        >
                          <span className="workspace-chevron">›</span>
                          <span className="workspace-title">
                            <strong>{group.name}</strong>
                            <span>{group.cwd || "未设置工作目录"}</span>
                          </span>
                          <span className="workspace-count">{group.threads.length}</span>
                        </button>
                        {isOpen && (
                          <div className="thread-list">
                            {group.threads.map((thread) => (
                              <button
                                type="button"
                                key={thread.id}
                                className={thread.id === currentThreadId ? "thread selected" : "thread"}
                                onClick={() => selectThread(thread)}
                              >
                                <strong>{threadTitle(thread)}</strong>
                                <span>{formatThreadTime(thread)}</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              className="workspace-new"
                              onClick={() => startThreadInWorkspace(group.cwd)}
                            >
                              在此项目新建
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
              <section className="panel chat-panel">
                <div className="chat-head">
                  <div>
                    <h2>{currentTitle}</h2>
                    <p>{currentSubtitle}</p>
                  </div>
                  <div className="chat-head-actions">
                    <button type="button" className="secondary-button" onClick={() => setReplies([])}>
                      清空
                    </button>
                    <button type="button" className="secondary-button" onClick={interruptTurn}>
                      打断
                    </button>
                  </div>
                </div>

                <div className="chat-shell">
                  <div className="chat-list" onScroll={updateChatPinnedState} ref={chatListRef}>
                    {threadLoading ? (
                      <article className="chat-empty">
                        <pre>正在加载历史记录...</pre>
                      </article>
                    ) : replies.length === 0 ? (
                    <article className="chat-empty">
                      <pre>等待回复...</pre>
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
                      新消息，到底部
                    </button>
                  )}
                </div>

                {!currentThreadId && (
                  <label>
                    工作目录
                    <input
                      value={cwd}
                      onChange={(event) => setCwd(event.target.value)}
                      placeholder="例如 D:\\PROJECT\\CODE\\your-repo"
                    />
                  </label>
                )}
                <form onSubmit={sendPrompt}>
                  <textarea
                    ref={promptRef}
                    value={prompt}
                    onChange={(event) => updatePrompt(event.target.value)}
                    onKeyDown={handlePromptKeyDown}
                    placeholder="发给 Codex 的消息"
                    rows={4}
                  />
                  <button type="submit" disabled={busy || !prompt.trim()}>
                    {busy ? "发送中" : "发送"}
                  </button>
                </form>
                <div className="approval-row">
                  <button type="button" onClick={() => approveLatest("accept")}>
                    同意最新审批
                  </button>
                  <button type="button" onClick={() => approveLatest("decline")}>
                    拒绝
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
                  <h2>活动</h2>
                </div>
                <div className="activity-list">
                  {activities.length === 0 ? (
                    <article className="activity-item empty">
                      <strong>暂无活动</strong>
                      <p>发送消息后，这里会显示思考、计划、工具调用和审批状态。</p>
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
          </section>

          <section className="panel events">
            <div className="panel-head">
              <h2>事件</h2>
              <button type="button" onClick={() => setLogs([])}>
                清空
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
                    <summary>查看 JSON</summary>
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
      title: "等待命令审批",
      detail: [params.command, params.cwd ? `目录：${params.cwd}` : "", params.reason].filter(Boolean).join("\n")
    };
  }
  if (method === "item/fileChange/requestApproval" || method === "applyPatchApproval") {
    return {
      title: "等待文件修改审批",
      detail: [params.reason, params.grantRoot ? `授权目录：${params.grantRoot}` : ""].filter(Boolean).join("\n")
    };
  }
  if (method === "item/tool/call") {
    return {
      title: "工具调用中",
      detail: `${formatToolName(params.namespace, params.tool)}\n${formatJson(params.arguments)}`
    };
  }
  if (method === "mcpServer/elicitation/request") {
    return {
      title: "等待 MCP 输入",
      detail: [params.serverName, params.message, params.url].filter(Boolean).join("\n")
    };
  }
  if (method === "item/tool/requestUserInput") {
    return {
      title: "等待用户输入",
      detail: Array.isArray(params.questions)
        ? params.questions.map((question: any) => question.question || question.header || question.id).join("\n")
        : undefined
    };
  }
  if (method === "item/permissions/requestApproval") {
    return {
      title: "等待权限审批",
      detail: [params.reason, params.cwd ? `目录：${params.cwd}` : "", formatJson(params.permissions)]
        .filter(Boolean)
        .join("\n")
    };
  }
  return {
    title: "等待 Codex 请求",
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
      kind: "回复",
      title: completed ? "回复已完成" : "正在生成回复",
      detail: completed ? "最终回答已返回。" : "回答内容正在流式返回。",
      state: completed ? "done" : "running"
    };
  }
  if (item.type === "plan") {
    return {
      id: itemId,
      phase: "thinking",
      kind: "计划",
      title: completed ? "计划已记录" : "正在制定计划",
      detail: typeof item.text === "string" ? item.text : undefined,
      state: completed ? "done" : "running"
    };
  }
  if (item.type === "reasoning") {
    return {
      id: itemId,
      phase: "thinking",
      kind: "思考",
      title: completed ? "思考阶段完成" : "正在思考",
      detail: "Codex 正在分析上下文。",
      state: completed ? "done" : "running"
    };
  }
  if (item.type === "commandExecution") {
    const state = stateFromStatus(item.status, completed);
    return {
      id: itemId,
      phase: "tool",
      kind: "工具",
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
      kind: "文件",
      title: state === "done" ? "文件修改完成" : state === "error" ? "文件修改失败" : "文件修改中",
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
      title: toolTitle("MCP 工具", item.status, completed),
      detail: [
        `${item.server ?? "MCP"} / ${item.tool ?? "tool"}`,
        item.arguments ? formatJson(item.arguments) : "",
        item.error?.message ? `错误：${item.error.message}` : ""
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
      kind: "工具",
      title: toolTitle("工具调用", item.status, completed),
      detail: [
        formatToolName(item.namespace, item.tool),
        item.arguments ? formatJson(item.arguments) : "",
        item.success === false ? "结果：失败" : ""
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
      kind: "子任务",
      title: toolTitle("子任务工具", item.status, completed),
      detail: [String(item.tool ?? ""), item.prompt ? shortenText(item.prompt, 800) : ""].filter(Boolean).join("\n"),
      state
    };
  }
  if (item.type === "webSearch") {
    return {
      id: itemId,
      phase: "tool",
      kind: "搜索",
      title: completed ? "搜索已完成" : "正在搜索",
      detail: item.query,
      state: completed ? "done" : "running"
    };
  }
  if (item.type === "imageGeneration") {
    const state = stateFromStatus(item.status, completed);
    return {
      id: itemId,
      phase: "tool",
      kind: "图片",
      title: state === "done" ? "图片已生成" : "图片生成中",
      detail: [item.revisedPrompt, item.savedPath].filter(Boolean).join("\n"),
      state
    };
  }
  if (item.type === "imageView") {
    return {
      id: itemId,
      phase: "tool",
      kind: "图片",
      title: "查看图片",
      detail: item.path,
      state: completed ? "done" : "running"
    };
  }
  return {
    id: itemId,
    phase: "tool",
    kind: "项目",
    title: completed ? `${item.type} 已完成` : `${item.type} 进行中`,
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
    return "未设置工作目录";
  }
  const clean = cwd.replace(/[\\/]+$/, "");
  const parts = clean.split(/[\\/]/);
  return parts.at(-1) || clean;
}

function workspaceKey(cwd: string) {
  return cwd || "__none__";
}

function threadTitle(thread: ThreadSummary | undefined) {
  return thread?.name || thread?.preview || thread?.id || "未命名对话";
}

function formatThreadTime(thread: ThreadSummary) {
  const value = thread.updatedAt ?? thread.createdAt;
  const ms = timestampToMs(value);
  return ms ? new Date(ms).toLocaleString() : "无时间信息";
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
    return "你";
  }
  if (role === "assistant") {
    return "Codex";
  }
  return "系统";
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
                <span>命令</span>
                <code>{block.command}</code>
              </div>
              {block.cwd && (
                <div className="activity-kv">
                  <span>目录</span>
                  <code>{block.cwd}</code>
                </div>
              )}
              {block.exitCode && (
                <div className="activity-kv">
                  <span>退出码</span>
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
                  <span>工具</span>
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
  if (item.kind === "工具" && (detail.startsWith("$ ") || detail.includes("\n目录：") || detail.includes("\n退出码："))) {
    return [parseCommandDetail(detail)];
  }
  if (item.kind === "文件") {
    const files = detail
      .split("\n")
      .map(parseFileChangeLine)
      .filter((file): file is { action: string; path: string } => Boolean(file));
    if (files.length) {
      return [{ kind: "files", files }];
    }
  }
  if (item.kind === "计划") {
    const plan = parsePlanDetail(detail);
    if (plan.steps.length) {
      return [plan];
    }
  }
  if (item.kind === "MCP" || item.kind === "子任务" || (item.kind === "工具" && !detail.startsWith("$ "))) {
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
    if (line.startsWith("目录：")) {
      cwd = line.slice("目录：".length);
    } else if (line.startsWith("退出码：")) {
      exitCode = line.slice("退出码：".length);
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
  const errorLine = lines.find((line) => line.startsWith("错误："));
  return {
    kind: "tool",
    name,
    payload: errorLine ? rest.replace(errorLine, "").trim() : rest,
    error: errorLine ? errorLine.slice("错误：".length) : undefined
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
    return typeof body === "string" ? body : "原始事件";
  }
  const params = message.params ?? {};
  if (method === "item/commandExecution/outputDelta") return "命令输出更新";
  if (method === "item/fileChange/patchUpdated") return "文件补丁已更新";
  if (method === "item/agentMessage/delta") return "助手回复流式返回";
  if (method === "turn/plan/updated") return currentPlanStep(params.plan) ?? "计划状态更新";
  if (method === "item/completed" && params.item?.type) return `${params.item.type} 完成`;
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
    if (part.type === "heading") {
      const Tag = `h${Math.min(Math.max(part.level ?? 3, 1), 4)}` as "h1" | "h2" | "h3" | "h4";
      return <Tag key={index}>{renderInlineMarkdown(part.text)}</Tag>;
    }
    if (part.type === "quote") {
      return <blockquote key={index}>{renderInlineMarkdown(part.text)}</blockquote>;
    }
    return <p key={index}>{renderInlineMarkdown(part.text)}</p>;
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
      {copied ? "已复制" : "复制"}
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
    item.cwd ? `目录：${item.cwd}` : "",
    item.exitCode !== null && item.exitCode !== undefined ? `退出码：${item.exitCode}` : "",
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
    return "命令已完成";
  }
  if (state === "error") {
    return "命令失败";
  }
  if (state === "waiting") {
    return "命令等待中";
  }
  return "命令运行中";
}

function toolTitle(name: string, status: unknown, completed: boolean) {
  const state = stateFromStatus(status, completed);
  if (state === "done") {
    return `${name}已完成`;
  }
  if (state === "error") {
    return `${name}失败`;
  }
  if (state === "waiting") {
    return `${name}等待中`;
  }
  return `${name}运行中`;
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
  return `${text.slice(0, max)}\n...已截断 ${text.length - max} 字符`;
}

createRoot(document.getElementById("root")!).render(<App />);
