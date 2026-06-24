import { AddressInfo } from "node:net";
import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { RelayHub } from "../src/server/relay.js";
import { Envelope, createEnvelope, parseEnvelope } from "../src/shared/protocol.js";

const relayToken = "relay-token-123456";
const pairingCode = "1234";

const openSockets = new Set<WebSocket>();
const servers: Array<{ httpServer: http.Server; wsServer: WebSocketServer }> = [];

afterEach(async () => {
  for (const socket of openSockets) {
    socket.close();
  }
  openSockets.clear();

  await Promise.all(
    servers.splice(0).map(
      ({ httpServer, wsServer }) =>
        new Promise<void>((resolve) => {
          wsServer.close(() => {
            httpServer.close(() => resolve());
          });
        })
    )
  );
});

describe("relay hub", () => {
  it("rejects unsupported protocol versions", async () => {
    const { url } = await startRelay();
    const controller = await openSocket(url);

    controller.send(
      JSON.stringify({
        v: 999,
        type: "hello",
        payload: {
          role: "controller",
          pairingCode
        },
        sentAt: Date.now()
      })
    );

    const error = await waitForEnvelope(controller, (envelope) => envelope.type === "error");
    expect(error.payload).toEqual({ message: "Unsupported protocol version: 999" });
  });

  it("does not let controllers switch to an offline session", async () => {
    const { url } = await startRelay();

    const bridge = await openSocket(url);
    bridge.send(
      JSON.stringify(
        createEnvelope("hello", {
          role: "bridge",
          token: relayToken,
          deviceName: "Desk",
          sessionId: "desk",
          capabilities: []
        })
      )
    );
    await waitForEnvelope(bridge, (envelope) => envelope.type === "hello.accepted");

    const controller = await openSocket(url);
    controller.send(
      JSON.stringify(
        createEnvelope("hello", {
          role: "controller",
          pairingCode,
          sessionId: "desk"
        })
      )
    );
    await waitForEnvelope(controller, (envelope) => envelope.type === "hello.accepted");

    bridge.close();
    await waitForEnvelope(controller, (envelope) => envelope.type === "session.updated");

    controller.send(JSON.stringify(createEnvelope("session.select", { sessionId: "desk" })));
    const error = await waitForEnvelope(controller, (envelope) => envelope.type === "error");
    expect(error.payload).toEqual({ message: "Session is not connected." });
  });
});

async function startRelay() {
  const httpServer = http.createServer();
  const wsServer = new WebSocketServer({ server: httpServer, path: "/ws" });
  const hub = new RelayHub({ relayToken, pairingCode });
  hub.attach(wsServer);

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  servers.push({ httpServer, wsServer });

  const address = httpServer.address() as AddressInfo;
  return { url: `ws://127.0.0.1:${address.port}/ws` };
}

function openSocket(url: string) {
  const socket = new WebSocket(url);
  openSockets.add(socket);
  return new Promise<WebSocket>((resolve, reject) => {
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function waitForEnvelope(socket: WebSocket, predicate: (envelope: Envelope) => boolean) {
  return new Promise<Envelope>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for envelope."));
    }, 3000);

    const onMessage = (raw: WebSocket.RawData) => {
      const envelope = parseEnvelope(raw.toString());
      if (!predicate(envelope)) {
        return;
      }
      cleanup();
      resolve(envelope);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };

    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}
