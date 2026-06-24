import { nanoid } from "nanoid";
import WebSocket, { WebSocketServer } from "ws";
import {
  CLIENT_PROTOCOL_VERSION,
  CodexTargetStatus,
  Envelope,
  HelloPayload,
  SessionSummary,
  createEnvelope,
  helloSchema,
  parseEnvelope,
  rpcRequestSchema
} from "../shared/protocol.js";

export type RelayConfig = {
  relayToken: string;
  pairingCode: string;
};

type Peer = {
  id: string;
  ws: WebSocket;
  role: "bridge" | "controller";
  sessionId: string;
};

type Session = {
  id: string;
  deviceName: string;
  connectedAt: number;
  lastSeenAt: number;
  bridge?: Peer;
  controllers: Map<string, Peer>;
  capabilities: string[];
  codex?: CodexTargetStatus;
};

export class RelayHub {
  private readonly sessions = new Map<string, Session>();
  private readonly peers = new Map<WebSocket, Peer>();

  constructor(private readonly config: RelayConfig) {}

  attach(server: WebSocketServer) {
    server.on("connection", (ws) => {
      ws.once("message", (raw) => {
        this.handleHello(ws, raw.toString()).catch((error) => {
          this.closeWithError(ws, error instanceof Error ? error.message : "Handshake failed.");
        });
      });
    });
  }

  listSessions(): SessionSummary[] {
    return [...this.sessions.values()].map((session) => this.summarizeSession(session));
  }

  private async handleHello(ws: WebSocket, raw: string) {
    const envelope = parseEnvelope(raw);
    if (envelope.v !== CLIENT_PROTOCOL_VERSION || envelope.type !== "hello") {
      throw new Error("Expected hello envelope.");
    }

    const hello = helloSchema.parse(envelope.payload);
    if (hello.role === "bridge") {
      this.registerBridge(ws, hello);
      return;
    }

    this.registerController(ws, hello);
  }

  private registerBridge(ws: WebSocket, hello: Extract<HelloPayload, { role: "bridge" }>) {
    if (hello.token !== this.config.relayToken) {
      throw new Error("Invalid relay token.");
    }

    const sessionId = hello.sessionId || nanoid(12);
    const existing = this.sessions.get(sessionId);
    if (existing?.bridge) {
      existing.bridge.ws.close(1012, "Bridge replaced by a new connection.");
    }

    const now = Date.now();
    const session: Session =
      existing ??
      {
        id: sessionId,
        deviceName: hello.deviceName,
        connectedAt: now,
        lastSeenAt: now,
        controllers: new Map(),
        capabilities: hello.capabilities
      };

    session.deviceName = hello.deviceName;
    session.capabilities = hello.capabilities;
    session.lastSeenAt = now;

    const peer = this.bindPeer(ws, "bridge", sessionId);
    session.bridge = peer;
    this.sessions.set(sessionId, session);

    this.send(ws, "hello.accepted", {
      role: "bridge",
      sessionId,
      summary: this.summarizeSession(session)
    });
    this.broadcastSessionUpdate(session);
  }

  private registerController(ws: WebSocket, hello: Extract<HelloPayload, { role: "controller" }>) {
    if (hello.pairingCode !== this.config.pairingCode && hello.token !== this.config.relayToken) {
      throw new Error("Invalid pairing code.");
    }

    const session = this.resolveControllerSession(hello.sessionId);
    const peer = this.bindPeer(ws, "controller", session.id);
    session.controllers.set(peer.id, peer);
    session.lastSeenAt = Date.now();

    this.send(ws, "hello.accepted", {
      role: "controller",
      sessionId: session.id,
      summary: this.summarizeSession(session),
      sessions: this.listSessions()
    });
    this.broadcastSessionUpdate(session);
  }

  private bindPeer(ws: WebSocket, role: Peer["role"], sessionId: string): Peer {
    const peer: Peer = {
      id: nanoid(10),
      ws,
      role,
      sessionId
    };
    this.peers.set(ws, peer);

    ws.on("message", (raw) => {
      this.handlePeerMessage(peer, raw.toString()).catch((error) => {
        this.send(peer.ws, "error", {
          message: error instanceof Error ? error.message : "Unknown relay error."
        });
      });
    });
    ws.on("close", () => this.removePeer(peer));
    ws.on("error", () => this.removePeer(peer));

    return peer;
  }

  private resolveControllerSession(requestedId?: string): Session {
    const available = [...this.sessions.values()].filter((session) => session.bridge);

    if (requestedId) {
      const session = this.sessions.get(requestedId);
      if (session?.bridge) {
        return session;
      }

      if (available.length === 1) {
        return available[0]!;
      }

      throw new Error("Requested session is not connected.");
    }

    if (available.length === 0) {
      throw new Error("No bridge sessions are connected.");
    }
    if (available.length > 1) {
      throw new Error("Multiple bridge sessions are connected. Choose a sessionId.");
    }

    return available[0]!;
  }

  private async handlePeerMessage(peer: Peer, raw: string) {
    const envelope = parseEnvelope(raw);
    const session = this.sessions.get(peer.sessionId);
    if (!session) {
      throw new Error("Session no longer exists.");
    }
    session.lastSeenAt = Date.now();

    if (peer.role === "controller") {
      this.handleControllerMessage(peer, session, envelope);
      return;
    }

    this.handleBridgeMessage(peer, session, envelope);
  }

  private handleControllerMessage(peer: Peer, session: Session, envelope: Envelope) {
    if (envelope.type === "rpc.request") {
      rpcRequestSchema.parse(envelope.payload);
      if (!session.bridge || session.bridge.ws.readyState !== WebSocket.OPEN) {
        this.send(peer.ws, "rpc.response", { ok: false, error: "Bridge is offline." }, envelope.requestId);
        return;
      }

      this.send(session.bridge.ws, envelope.type, envelope.payload, envelope.requestId);
      return;
    }

    if (envelope.type === "session.select") {
      const sessionId =
        typeof envelope.payload === "object" && envelope.payload !== null && "sessionId" in envelope.payload
          ? String((envelope.payload as { sessionId: unknown }).sessionId)
          : "";
      const next = this.sessions.get(sessionId);
      if (!next) {
        this.send(peer.ws, "error", { message: "Session not found." });
        return;
      }
      if (!next.bridge || next.bridge.ws.readyState !== WebSocket.OPEN) {
        this.send(peer.ws, "error", { message: "Session is not connected." });
        return;
      }

      session.controllers.delete(peer.id);
      peer.sessionId = next.id;
      next.controllers.set(peer.id, peer);
      this.send(peer.ws, "session.selected", {
        summary: this.summarizeSession(next),
        sessions: this.listSessions()
      });
      return;
    }

    this.send(peer.ws, "error", { message: `Unsupported controller message: ${envelope.type}` });
  }

  private handleBridgeMessage(_peer: Peer, session: Session, envelope: Envelope) {
    if (envelope.type === "bridge.status") {
      session.codex = envelope.payload as CodexTargetStatus;
      this.broadcastToControllers(session, "bridge.status", envelope.payload);
      this.broadcastSessionUpdate(session);
      return;
    }

    if (envelope.type === "rpc.response") {
      this.broadcastToControllers(session, "rpc.response", envelope.payload, envelope.requestId);
      return;
    }

    if (envelope.type === "codex.event") {
      this.broadcastToControllers(session, "codex.event", envelope.payload);
      return;
    }

    if (envelope.type === "bridge.log") {
      this.broadcastToControllers(session, "bridge.log", envelope.payload);
      return;
    }

    this.broadcastToControllers(session, "bridge.log", {
      level: "warn",
      message: `Unsupported bridge message: ${envelope.type}`
    });
  }

  private removePeer(peer: Peer) {
    const current = this.peers.get(peer.ws);
    if (!current || current.id !== peer.id) {
      return;
    }

    this.peers.delete(peer.ws);
    const session = this.sessions.get(peer.sessionId);
    if (!session) {
      return;
    }

    if (peer.role === "bridge" && session.bridge?.id === peer.id) {
      session.bridge = undefined;
      session.lastSeenAt = Date.now();
      this.broadcastSessionUpdate(session);
      if (session.controllers.size === 0) {
        this.sessions.delete(session.id);
      }
    }

    if (peer.role === "controller") {
      session.controllers.delete(peer.id);
      session.lastSeenAt = Date.now();
      this.broadcastSessionUpdate(session);
    }
  }

  private broadcastSessionUpdate(session: Session) {
    this.broadcastToControllers(session, "session.updated", {
      summary: this.summarizeSession(session),
      sessions: this.listSessions()
    });
  }

  private broadcastToControllers(session: Session, type: string, payload: unknown, requestId?: string) {
    for (const controller of session.controllers.values()) {
      this.send(controller.ws, type, payload, requestId);
    }
  }

  private send(ws: WebSocket, type: string, payload: unknown, requestId?: string) {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    ws.send(JSON.stringify(createEnvelope(type, payload, requestId)));
  }

  private closeWithError(ws: WebSocket, message: string) {
    if (ws.readyState === WebSocket.OPEN) {
      this.send(ws, "error", { message });
      ws.close(1008, message);
    }
  }

  private summarizeSession(session: Session): SessionSummary {
    return {
      sessionId: session.id,
      deviceName: session.deviceName,
      connectedAt: session.connectedAt,
      lastSeenAt: session.lastSeenAt,
      bridgeOnline: Boolean(session.bridge && session.bridge.ws.readyState === WebSocket.OPEN),
      controllers: session.controllers.size,
      capabilities: session.capabilities,
      codex: session.codex
    };
  }
}
