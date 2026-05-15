import React, { FormEvent, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Envelope,
  RpcResponsePayload,
  SessionSummary,
  createEnvelope
} from "../shared/protocol.js";
import "./styles.css";

type LogItem = {
  id: string;
  ts: number;
  kind: string;
  body: unknown;
};

type Pending = {
  resolve: (value: RpcResponsePayload) => void;
  reject: (error: Error) => void;
};

const requestTimeoutMs = 120000;

function App() {
  const [pairingCode, setPairingCode] = useState(localStorage.getItem("pairingCode") ?? "");
  const [selectedSession, setSelectedSession] = useState(localStorage.getItem("sessionId") ?? "");
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<SessionSummary | undefined>();
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [replies, setReplies] = useState<LogItem[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cwd, setCwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("");

  const socketRef = useRef<WebSocket | undefined>(undefined);
  const pendingRef = useRef(new Map<string, Pending>());
  const currentTurnByThread = useRef(new Map<string, string>());
  const retryingWithoutSessionRef = useRef(false);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === currentThreadId),
    [threads, currentThreadId]
  );

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
    if (msg?.method === "turn/started" && msg.params?.threadId && msg.params?.turn?.id) {
      currentTurnByThread.current.set(msg.params.threadId, msg.params.turn.id);
    }
    if (msg?.method === "turn/completed" && msg.params?.threadId) {
      currentTurnByThread.current.delete(msg.params.threadId);
    }
  }

  function updateReplies(message: unknown) {
    const msg = message as any;
    if (msg?.method === "item/agentMessage/delta") {
      const params = msg.params ?? {};
      const itemId = params.itemId || params.turnId || "active";
      const delta = params.delta || "";
      if (!delta) {
        return;
      }
      setReplies((items) => {
        const existing = items.find((item) => item.id === itemId);
        if (existing) {
          return items.map((item) =>
            item.id === itemId ? { ...item, body: String(item.body ?? "") + delta } : item
          );
        }
        return [{ id: itemId, ts: Date.now(), kind: "Codex", body: delta }, ...items].slice(0, 20);
      });
    }

    if (msg?.method === "item/completed" && msg.params?.item?.type === "agentMessage") {
      const item = msg.params.item;
      setReplies((items) => {
        const existing = items.find((reply) => reply.id === item.id);
        if (existing) {
          return items.map((reply) => (reply.id === item.id ? { ...reply, body: item.text } : reply));
        }
        return [{ id: item.id, ts: Date.now(), kind: "Codex", body: item.text }, ...items].slice(0, 20);
      });
    }
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

  async function refreshThreads() {
    try {
      const response = await rpc("thread.list", { limit: 25, archived: false });
      if (!response.ok) {
        throw new Error(response.error);
      }

      const result = response.result as any;
      const list = result?.threads ?? result?.items ?? result?.data ?? result ?? [];
      setThreads(Array.isArray(list) ? list : []);
      if (!currentThreadId && Array.isArray(list) && list[0]?.id) {
        setCurrentThreadId(list[0].id);
      }
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : error);
    }
  }

  async function sendPrompt(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }

    setBusy(true);
    try {
      if (currentThreadId) {
        const selectedThread = threads.find((thread) => thread.id === currentThreadId);
        const response = await rpc("turn.start", {
          threadId: currentThreadId,
          prompt,
          cwd: selectedThread?.cwd
        });
        if (!response.ok) {
          throw new Error(response.error);
        }
      } else {
        const response = await rpc("thread.start", {
          prompt,
          cwd: cwd.trim() || undefined
        });
        if (!response.ok) {
          throw new Error(response.error);
        }
        const threadId = (response.result as any)?.thread?.id;
        if (threadId) {
          setCurrentThreadId(threadId);
        }
      }

      setPrompt("");
      await refreshThreads();
    } catch (error) {
      addLog("error", error instanceof Error ? error.message : error);
    } finally {
      setBusy(false);
    }
  }

  async function startNewThread() {
    setCurrentThreadId("");
    setPrompt("");
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
            <aside className="panel threads">
              <div className="panel-head">
                <h2>线程</h2>
                <button type="button" onClick={refreshThreads}>
                  刷新
                </button>
              </div>
              <button type="button" className="new-thread" onClick={startNewThread}>
                新线程
              </button>
              <div className="thread-list">
                {threads.map((thread) => (
                  <button
                    type="button"
                    key={thread.id}
                    className={thread.id === currentThreadId ? "thread selected" : "thread"}
                    onClick={() => setCurrentThreadId(thread.id)}
                  >
                    <strong>{thread.name || thread.preview || "Untitled"}</strong>
                    <span>{thread.cwd}</span>
                  </button>
                ))}
              </div>
            </aside>

          <section className="panel composer">
              <div className="panel-head">
                <h2>{currentThreadId ? activeThread?.name || activeThread?.preview || "继续线程" : "新线程"}</h2>
                <button type="button" onClick={interruptTurn}>
                  打断
                </button>
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
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="发给 Codex 的消息"
                  rows={8}
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
          </section>

          <section className="panel events">
            <div className="panel-head">
              <h2>Codex 回复</h2>
              <button type="button" onClick={() => setReplies([])}>
                清空
              </button>
            </div>
            <div className="event-list">
              {replies.length === 0 ? (
                <article className="event">
                  <pre>等待回复...</pre>
                </article>
              ) : (
                replies.map((item) => (
                  <article key={item.id} className="event">
                    <header>
                      <span>{item.kind}</span>
                      <time>{new Date(item.ts).toLocaleTimeString()}</time>
                    </header>
                    <pre>{String(item.body ?? "")}</pre>
                  </article>
                ))
              )}
            </div>
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
                  <pre>{JSON.stringify(item.body, null, 2)}</pre>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
