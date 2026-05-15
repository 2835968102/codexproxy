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
    if (this.options.autoStart) {
      this.startLocalAppServer();
    }

    await this.connectWithRetry();
  }

  stop() {
    this.ws?.close();
    this.appServerProcess?.kill();
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
    return result;
  }

  private async readThread(params: unknown) {
    const result = await this.request("thread/read", {
          includeTurns: true,
          ...(isRecord(params) ? params : {})
        });
    this.rememberThreads(result);
    return result;
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
    for (;;) {
      try {
        await this.connect();
        return;
      } catch (error) {
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
      const ws = new WebSocket(this.options.url);
      let settled = false;

      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      ws.once("open", async () => {
        this.ws = ws;
        ws.on("message", (raw) => this.handleMessage(raw.toString()));
        ws.on("close", () => {
          this.setStatus({ connected: false, lastError: "Codex app-server connection closed." });
          this.rejectAllPending(new Error("Codex app-server connection closed."));
          void this.connectWithRetry();
        });
        ws.on("error", () => {
          this.setStatus({ connected: false, lastError: "Codex app-server websocket error." });
        });

        try {
          const initialized = (await this.request("initialize", {
            clientInfo: {
              name: "codexproxy-bridge",
              title: "Codex Proxy Bridge",
              version: "0.1.0"
            },
            capabilities: null
          })) as Partial<CodexTargetStatus>;

          this.setStatus({
            connected: true,
            userAgent: typeof initialized.userAgent === "string" ? initialized.userAgent : undefined,
            codexHome: typeof initialized.codexHome === "string" ? initialized.codexHome : undefined,
            platformFamily:
              typeof initialized.platformFamily === "string" ? initialized.platformFamily : undefined,
            platformOs: typeof initialized.platformOs === "string" ? initialized.platformOs : undefined
          });
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
    const threadResult = await this.request("thread/start", {
      cwd: typeof values.cwd === "string" ? values.cwd : undefined,
      model: typeof values.model === "string" ? values.model : undefined,
      approvalPolicy: typeof values.approvalPolicy === "string" ? values.approvalPolicy : undefined,
      sandbox: typeof values.sandbox === "string" ? values.sandbox : undefined
    });

    const thread = isRecord(threadResult) && isRecord(threadResult.thread) ? threadResult.thread : undefined;
    const threadId = typeof thread?.id === "string" ? thread.id : undefined;
    this.rememberThread(thread);
    if (prompt.trim() && threadId) {
      await this.request("turn/start", {
        threadId,
        cwd: typeof values.cwd === "string" ? values.cwd : undefined,
        input: [textInput(prompt)]
      });
    }

    return threadResult;
  }

  private async startTurn(params: unknown) {
    const values = isRecord(params) ? params : {};
    const threadId = typeof values.threadId === "string" ? values.threadId : undefined;
    const prompt = typeof values.prompt === "string" ? values.prompt : undefined;
    const cwd = typeof values.cwd === "string" ? values.cwd : this.threadMetadata.get(threadId ?? "")?.cwd;
    if (!threadId || !prompt) {
      throw new Error("turn.start requires threadId and prompt.");
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
    const cwd = typeof thread.cwd === "string" ? thread.cwd : undefined;
    if (cwd) {
      this.threadMetadata.set(thread.id, { cwd });
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
