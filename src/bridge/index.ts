import "dotenv/config";
import WebSocket from "ws";
import { loadBridgeConfig } from "./config.js";
import { CodexAppServerClient } from "./codex-client.js";
import {
  createEnvelope,
  envelopeSchema,
  rpcRequestSchema,
  type CodexTargetStatus
} from "../shared/protocol.js";

const config = loadBridgeConfig();
let relay: WebSocket | undefined;
let codexStatus: CodexTargetStatus = { connected: false };

const codex = new CodexAppServerClient(
  {
    url: config.codexAppServerUrl,
    autoStart: config.autoStartAppServer,
    codexBin: config.codexBin,
    port: config.codexAppServerPort,
    allowRawRpc: config.allowRawRpc
  },
  (message) => sendRelay("codex.event", { direction: "from-codex", message }),
  (status) => {
    codexStatus = status;
    sendRelay("bridge.status", status);
  }
);

void codex.start();
connectRelay();

process.on("SIGINT", () => {
  codex.stop();
  relay?.close();
  process.exit(0);
});

function connectRelay() {
  relay = new WebSocket(config.relayUrl);

  relay.on("open", () => {
    sendRelay("hello", {
      role: "bridge",
      token: config.relayToken,
      deviceName: config.deviceName,
      sessionId: config.sessionId,
      capabilities: [
        "codex.status",
        "thread.list",
        "thread.read",
        "thread.start",
        "turn.start",
        "turn.steer",
        "turn.interrupt",
        "serverRequest.respond",
        ...(config.allowRawRpc ? ["raw"] : [])
      ]
    });
    sendRelay("bridge.status", codexStatus);
  });

  relay.on("message", (raw) => {
    handleRelayMessage(raw.toString()).catch((error) => {
      sendRelay("bridge.log", {
        level: "error",
        message: error instanceof Error ? error.message : "Unknown bridge error."
      });
    });
  });

  relay.on("close", () => {
    setTimeout(connectRelay, 1500);
  });

  relay.on("error", (error) => {
    console.error("relay websocket error", error.message);
  });
}

async function handleRelayMessage(raw: string) {
  const envelope = envelopeSchema.parse(JSON.parse(raw));
  if (envelope.type === "hello.accepted") {
    console.log("bridge connected:", JSON.stringify(envelope.payload));
    return;
  }

  if (envelope.type !== "rpc.request") {
    return;
  }

  const request = rpcRequestSchema.parse(envelope.payload);
  try {
    if (request.target === "bridge") {
      sendRelay(
        "rpc.response",
        {
          ok: true,
          result: await handleBridgeRpc(request.method)
        },
        envelope.requestId
      );
      return;
    }

    const result = await codex.handleRpc(request.method, request.params);
    sendRelay("rpc.response", { ok: true, result }, envelope.requestId);
  } catch (error) {
    sendRelay(
      "rpc.response",
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown RPC error."
      },
      envelope.requestId
    );
  }
}

async function handleBridgeRpc(method: string) {
  switch (method) {
    case "status":
      return {
        relayConnected: relay?.readyState === WebSocket.OPEN,
        codex: codex.getStatus()
      };
    default:
      throw new Error(`Unsupported bridge method: ${method}`);
  }
}

function sendRelay(type: string, payload: unknown, requestId?: string) {
  if (!relay || relay.readyState !== WebSocket.OPEN) {
    return;
  }
  relay.send(JSON.stringify(createEnvelope(type, payload, requestId)));
}
