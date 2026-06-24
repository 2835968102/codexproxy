import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import WebSocket from "ws";
import { CodexTargetStatus, textInput } from "../shared/protocol.js";
import { isRecord } from "../shared/json.js";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
};

export type CodexEventHandler = (message: unknown) => void;
export type CodexStatusHandler = (status: CodexTargetStatus) => void;

export class CodexAppServerClient {
  private ws?: WebSocket;
  private appServerProcess?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<string | number, PendingRequest>();
  private readonly threadMetadata = new Map<string, { cwd?: string }>();
  private status: CodexTargetStatus = { connected: false };
  private stopped = false;

  constructor(
    private readonly options: {
      url: string;
      autoStart: boolean;
      codexBin: string;
      port: number;
      allowRawRpc: boolean;
    },
    private readonly onEvent: CodexEventHandler,
    private readonly onStatus: CodexStatusHandler
  ) {}

  async start() {
    this.stopped = false;
    if (this.options.autoStart) {
      this.startLocalAppServer();
    }

    await this.connectWithRetry();
  }

  stop() {
    this.stopped = true;
    this.ws?.removeAllListeners();
    this.ws?.close();
    this.ws = undefined;
    this.appServerProcess?.kill();
    this.appServerProcess = undefined;
    this.rejectAllPending(new Error("Codex app-server stopped."));
    this.setStatus({ connected: false });
  }

  getStatus() {
    return this.status;
  }

  async handleRpc(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "status":
        return this.status;
      case "thread.list":
        return this.listThreads(params);
      case "thread.read":
        return this.readThread(params);
      case "thread.turns.list":
        return this.listTurns(params);
      case "thread.start":
        return this.startThread(params);
      case "turn.start":
        return this.startTurn(params);
      case "turn.steer":
        return this.steerTurn(params);
      case "turn.interrupt":
        return this.request("turn/interrupt", params);
      case "serverRequest.respond":
        return this.respondToServerRequest(params);
      case "raw":
        if (!this.options.allowRawRpc) {
          throw new Error("Raw RPC is disabled. Set ALLOW_RAW_RPC=true on the bridge to enable it.");
        }
        return this.raw(params);
      default:
        throw new Error(`Unsupported Codex bridge method: ${method}`);
    }
  }

  private async listThreads(params: unknown) {
    const result = await this.request("thread/list", {
          limit: 25,
          archived: false,
          ...(isRecord(params) ? params : {})
        });
    this.rememberThreads(result);
    return this.withRememberedThreadMetadata(result);
  }

  private async readThread(params: unknown) {
    const result = await this.request("thread/read", {
          includeTurns: true,
          ...(isRecord(params) ? params : {})
        });
    this.rememberThreads(result);
    return this.withRememberedThreadMetadata(result);
  }

  private async listTurns(params: unknown) {
    const values = isRecord(params) ? params : {};
    const threadId = typeof values.threadId === "string" ? values.threadId : undefined;
    if (!threadId) {
      throw new Error("thread.turns.list requires threadId.");
    }

    return this.request("thread/turns/list", {
      limit: 100,
      sortDirection: "asc",
      ...values,
      threadId
    });
  }

  private startLocalAppServer() {
    if (this.appServerProcess) {
      return;
    }

    const args = ["app-server", "--listen", `ws://127.0.0.1:${this.options.port}`];
    this.appServerProcess = spawn(this.options.codexBin, args, {
      stdio: "pipe",
      windowsHide: true,
      shell: shouldUseShell(this.options.codexBin)
    });

    this.appServerProcess.on("error", (error) => {
      this.setStatus({
        connected: false,
        lastError: `Could not start Codex app-server with CODEX_BIN=${this.options.codexBin}: ${error.message}`
      });
      this.onEvent({
        method: "bridge/appServer/startError",
        params: {
          codexBin: this.options.codexBin,
          message: error.message
        }
      });
      this.appServerProcess = undefined;
    });
    this.appServerProcess.stderr.on("data", (chunk) => {
      const message = chunk.toString();
      if (message.toLowerCase().includes("error")) {
        this.onEvent({
          method: "bridge/appServer/stderr",
          params: { message }
        });
      }
    });
    this.appServerProcess.on("exit", (code, signal) => {
      this.onEvent({
        method: "bridge/appServer/exited",
        params: { code, signal }
      });
      this.appServerProcess = undefined;
    });
  }

  private async connectWithRetry() {
    let delay = 500;
    while (!this.stopped) {
      try {
        await this.connect();
        return;
      } catch (error) {
        if (this.stopped) {
          return;
        }
        this.setStatus({
          connected: false,
          lastError: error instanceof Error ? error.message : "Failed to connect to Codex app-server."
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 5000);
      }
    }
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.stopped) {
        resolve();
        return;
      }

      const ws = new WebSocket(this.options.url);
      let settled = false;
      let initialized = false;

      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          if (this.ws === ws) {
            this.ws = undefined;
          }
          ws.removeAllListeners();
          ws.close();
          this.rejectAllPending(error);
          reject(error);
        }
      };

      ws.once("open", async () => {
        this.ws = ws;
        ws.on("message", (raw) => this.handleMessage(raw.toString()));
        ws.on("close", () => {
          if (this.stopped) {
            return;
          }
          if (!initialized && settled) {
            return;
          }
          this.setStatus({ connected: false, lastError: "Codex app-server connection closed." });
          this.rejectAllPending(new Error("Codex app-server connection closed."));
          void this.connectWithRetry();
        });
        ws.on("error", () => {
          if (this.stopped) {
            return;
          }
          this.setStatus({ connected: false, lastError: "Codex app-server websocket error." });
        });

        try {
          const initResult = (await this.request("initialize", {
            clientInfo: {
              name: "codexproxy-bridge",
              title: "Codex Proxy Bridge",
              version: "0.1.0"
            },
            capabilities: null
          })) as Partial<CodexTargetStatus>;

          this.setStatus({
            connected: true,
            userAgent: typeof initResult.userAgent === "string" ? initResult.userAgent : undefined,
            codexHome: typeof initResult.codexHome === "string" ? initResult.codexHome : undefined,
            platformFamily:
              typeof initResult.platformFamily === "string" ? initResult.platformFamily : undefined,
            platformOs: typeof initResult.platformOs === "string" ? initResult.platformOs : undefined
          });
          initialized = true;
          settled = true;
          resolve();
        } catch (error) {
          fail(error instanceof Error ? error : new Error("Initialization failed."));
        }
      });

      ws.once("error", () => fail(new Error(`Could not connect to ${this.options.url}`)));
    });
  }

  private handleMessage(raw: string) {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      this.onEvent({
        method: "bridge/codex/nonJson",
        params: { raw }
      });
      return;
    }

    if (isRecord(message) && "id" in message && ("result" in message || "error" in message)) {
      const request = this.pending.get(message.id as string | number);
      if (request) {
        clearTimeout(request.timeout);
        this.pending.delete(message.id as string | number);
        if ("error" in message && message.error) {
          request.reject(new Error(JSON.stringify(message.error)));
        } else {
          request.resolve(message.result);
        }
      }
      return;
    }

    this.onEvent(message);
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Codex app-server is not connected.");
    }

    const id = this.nextId++;
    const message = params === undefined ? { id, method } : { id, method, params };
    ws.send(JSON.stringify(message));

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, 120000);

      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  private async startThread(params: unknown) {
    const values = isRecord(params) ? params : {};
    const prompt = typeof values.prompt === "string" ? values.prompt : "";
    const cwd = typeof values.cwd === "string" && values.cwd.trim() ? values.cwd : undefined;
    const threadResult = await this.request("thread/start", {
      cwd,
      model: typeof values.model === "string" ? values.model : undefined,
      approvalPolicy: typeof values.approvalPolicy === "string" ? values.approvalPolicy : undefined,
      sandbox: typeof values.sandbox === "string" ? values.sandbox : undefined
    });

    const thread = isRecord(threadResult) && isRecord(threadResult.thread) ? threadResult.thread : undefined;
    const threadId = typeof thread?.id === "string" ? thread.id : undefined;
    this.rememberThread(thread);
    if (threadId && cwd) {
      this.threadMetadata.set(threadId, { cwd });
    }
    if (prompt.trim() && threadId) {
      await this.request("turn/start", {
        threadId,
        cwd,
        input: [textInput(prompt)]
      });
    }

    return this.withRememberedThreadMetadata(threadResult);
  }

  private async startTurn(params: unknown) {
    const values = isRecord(params) ? params : {};
    const threadId = typeof values.threadId === "string" ? values.threadId : undefined;
    const prompt = typeof values.prompt === "string" ? values.prompt : undefined;
    const cwd =
      typeof values.cwd === "string" && values.cwd.trim()
        ? values.cwd
        : this.threadMetadata.get(threadId ?? "")?.cwd;
    if (!threadId || !prompt) {
      throw new Error("turn.start requires threadId and prompt.");
    }
    if (cwd) {
      this.threadMetadata.set(threadId, { cwd });
    }

    try {
      return await this.request("turn/start", {
        threadId,
        cwd,
        input: [textInput(prompt)]
      });
    } catch (error) {
      if (!isThreadNotFoundError(error)) {
        throw error;
      }

      const resumeResult = await this.request("thread/resume", cwd ? { threadId, cwd } : { threadId });
      if (isRecord(resumeResult) && isRecord(resumeResult.thread)) {
        this.rememberThread(resumeResult.thread);
      }
      return this.request("turn/start", {
        threadId,
        cwd,
        input: [textInput(prompt)]
      });
    }
  }

  private steerTurn(params: unknown) {
    const values = isRecord(params) ? params : {};
    const threadId = typeof values.threadId === "string" ? values.threadId : undefined;
    const expectedTurnId = typeof values.expectedTurnId === "string" ? values.expectedTurnId : undefined;
    const prompt = typeof values.prompt === "string" ? values.prompt : undefined;
    if (!threadId || !expectedTurnId || !prompt) {
      throw new Error("turn.steer requires threadId, expectedTurnId, and prompt.");
    }

    return this.request("turn/steer", {
      threadId,
      expectedTurnId,
      input: [textInput(prompt)]
    });
  }

  private respondToServerRequest(params: unknown) {
    const values = isRecord(params) ? params : {};
    const id = values.id;
    const result = values.result;
    if (typeof id !== "string" && typeof id !== "number") {
      throw new Error("serverRequest.respond requires an id.");
    }

    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Codex app-server is not connected.");
    }

    ws.send(JSON.stringify({ id, result }));
    return { sent: true };
  }

  private raw(params: unknown) {
    const values = isRecord(params) ? params : {};
    const method = typeof values.method === "string" ? values.method : undefined;
    if (!method) {
      throw new Error("raw requires method.");
    }

    return this.request(method, values.params);
  }

  private setStatus(status: CodexTargetStatus) {
    this.status = status;
    this.onStatus(status);
  }

  private rejectAllPending(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private rememberThreads(result: unknown) {
    if (isRecord(result)) {
      if (Array.isArray(result.data)) {
        result.data.forEach((thread) => this.rememberThread(thread));
      }
      if (Array.isArray(result.threads)) {
        result.threads.forEach((thread) => this.rememberThread(thread));
      }
      if (isRecord(result.thread)) {
        this.rememberThread(result.thread);
      }
    }
  }

  private rememberThread(thread: unknown) {
    if (!isRecord(thread) || typeof thread.id !== "string") {
      return;
    }
    const cwd = typeof thread.cwd === "string" ? thread.cwd : findCwd(thread);
    if (cwd) {
      this.threadMetadata.set(thread.id, { cwd });
    }
  }

  private withRememberedThreadMetadata(result: unknown) {
    if (!isRecord(result)) {
      return result;
    }
    if (Array.isArray(result.data)) {
      result.data.forEach((thread) => this.applyRememberedThreadMetadata(thread));
    }
    if (Array.isArray(result.threads)) {
      result.threads.forEach((thread) => this.applyRememberedThreadMetadata(thread));
    }
    if (Array.isArray(result.items)) {
      result.items.forEach((thread) => this.applyRememberedThreadMetadata(thread));
    }
    if (isRecord(result.thread)) {
      this.applyRememberedThreadMetadata(result.thread);
    }
    return result;
  }

  private applyRememberedThreadMetadata(thread: unknown) {
    if (!isRecord(thread) || typeof thread.id !== "string") {
      return;
    }
    const remembered = this.threadMetadata.get(thread.id);
    if (remembered?.cwd && typeof thread.cwd !== "string") {
      thread.cwd = remembered.cwd;
    }
  }
}

function shouldUseShell(command: string): boolean {
  if (process.platform !== "win32") {
    return false;
  }

  const lower = command.toLowerCase();
  return lower === "codex" || lower.endsWith(".cmd") || lower.endsWith(".bat") || lower.endsWith(".ps1");
}

function isThreadNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("thread not found");
}

function findCwd(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const cwd = findCwd(item);
      if (cwd) {
        return cwd;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.cwd === "string" && value.cwd.trim()) {
    return value.cwd;
  }

  for (const nested of Object.values(value)) {
    const cwd = findCwd(nested);
    if (cwd) {
      return cwd;
    }
  }
  return undefined;
}
