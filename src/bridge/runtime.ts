import WebSocket from "ws";
import type { BridgeConfig } from "./config.js";
import { CodexAppServerClient } from "./codex-client.js";
import {
  createEnvelope,
  parseEnvelope,
  rpcRequestSchema,
  type CodexTargetStatus
} from "../shared/protocol.js";

export type BridgeRuntimeLog = {
  level: "info" | "warn" | "error";
  message: string;
  data?: unknown;
};

export type BridgeRuntimeStatus = {
  relayConnected: boolean;
  configuredSessionId?: string;
  acceptedSessionId?: string;
  deviceName: string;
  codex: CodexTargetStatus;
};

export type BridgeRuntimeHandlers = {
  onLog?: (entry: BridgeRuntimeLog) => void;
  onStatus?: (status: BridgeRuntimeStatus) => void;
};

export class BridgeRuntime {
  private relay?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private stopped = true;
  private acceptedSessionId?: string;
  private codexStatus: CodexTargetStatus = { connected: false };
  private readonly codex: CodexAppServerClient;

  constructor(
    private readonly config: BridgeConfig,
    private readonly handlers: BridgeRuntimeHandlers = {}
  ) {
    this.codex = new CodexAppServerClient(
      {
        url: config.codexAppServerUrl,
        autoStart: config.autoStartAppServer,
        codexBin: config.codexBin,
        port: config.codexAppServerPort,
        allowRawRpc: config.allowRawRpc
      },
      (message) => this.sendRelay("codex.event", { direction: "from-codex", message }),
      (status) => {
        this.codexStatus = status;
        this.sendRelay("bridge.status", status);
        this.emitStatus();
      }
    );
  }

  start() {
    if (!this.stopped) {
      return;
    }

    this.stopped = false;
    this.log("info", "Starting bridge runtime.");
    void this.codex.start();
    this.connectRelay();
    this.emitStatus();
  }

  stop() {
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.relay?.removeAllListeners();
    this.relay?.close();
    this.relay = undefined;
    this.acceptedSessionId = undefined;
    this.codex.stop();
    this.log("info", "Bridge runtime stopped.");
    this.emitStatus();
  }

  getStatus(): BridgeRuntimeStatus {
    return {
      relayConnected: this.relay?.readyState === WebSocket.OPEN,
      configuredSessionId: this.config.sessionId,
      acceptedSessionId: this.acceptedSessionId,
      deviceName: this.config.deviceName,
      codex: this.codexStatus
    };
  }

  private connectRelay() {
    if (this.stopped) {
      return;
    }

    this.log("info", `Connecting relay ${this.config.relayUrl}`);
    const ws = new WebSocket(this.config.relayUrl);
    this.relay = ws;

    ws.on("open", () => {
      this.sendRelay("hello", {
        role: "bridge",
        token: this.config.relayToken,
        deviceName: this.config.deviceName,
        sessionId: this.config.sessionId,
        capabilities: [
          "codex.status",
          "thread.list",
          "thread.read",
          "thread.turns.list",
          "thread.start",
          "turn.start",
          "turn.steer",
          "turn.interrupt",
          "serverRequest.respond",
          ...(this.config.allowRawRpc ? ["raw"] : [])
        ]
      });
      this.sendRelay("bridge.status", this.codexStatus);
      this.emitStatus();
    });

    ws.on("message", (raw) => {
      this.handleRelayMessage(raw.toString()).catch((error) => {
        const message = error instanceof Error ? error.message : "Unknown bridge error.";
        this.log("error", message);
        this.sendRelay("bridge.log", {
          level: "error",
          message
        });
      });
    });

    ws.on("close", () => {
      if (this.relay === ws) {
        this.relay = undefined;
      }
      this.acceptedSessionId = undefined;
      this.emitStatus();
      if (!this.stopped) {
        this.log("warn", "Relay connection closed. Reconnecting.");
        this.reconnectTimer = setTimeout(() => this.connectRelay(), 1500);
      }
    });

    ws.on("error", (error) => {
      this.log("error", `Relay websocket error: ${error.message}`);
    });
  }

  private async handleRelayMessage(raw: string) {
    const envelope = parseEnvelope(raw);
    if (envelope.type === "hello.accepted") {
      const payload = envelope.payload as { sessionId?: unknown };
      this.acceptedSessionId = typeof payload.sessionId === "string" ? payload.sessionId : undefined;
      this.log("info", "Bridge connected.", envelope.payload);
      this.emitStatus();
      return;
    }

    if (envelope.type !== "rpc.request") {
      return;
    }

    const request = rpcRequestSchema.parse(envelope.payload);
    try {
      if (request.target === "bridge") {
        this.sendRelay(
          "rpc.response",
          {
            ok: true,
            result: await this.handleBridgeRpc(request.method)
          },
          envelope.requestId
        );
        return;
      }

      const result = await this.codex.handleRpc(request.method, request.params);
      this.sendRelay("rpc.response", { ok: true, result }, envelope.requestId);
    } catch (error) {
      this.sendRelay(
        "rpc.response",
        {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown RPC error."
        },
        envelope.requestId
      );
    }
  }

  private async handleBridgeRpc(method: string) {
    switch (method) {
      case "status":
        return this.getStatus();
      default:
        throw new Error(`Unsupported bridge method: ${method}`);
    }
  }

  private sendRelay(type: string, payload: unknown, requestId?: string) {
    if (!this.relay || this.relay.readyState !== WebSocket.OPEN) {
      return;
    }
    this.relay.send(JSON.stringify(createEnvelope(type, payload, requestId)));
  }

  private log(level: BridgeRuntimeLog["level"], message: string, data?: unknown) {
    this.handlers.onLog?.({ level, message, data });
  }

  private emitStatus() {
    this.handlers.onStatus?.(this.getStatus());
  }
}
