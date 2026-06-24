import express from "express";
import http from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { loadServerConfig } from "./config.js";
import { RelayHub } from "./relay.js";

const config = loadServerConfig();
const app = express();
const server = http.createServer(app);
const hub = new RelayHub({
  relayToken: config.relayToken,
  pairingCode: config.pairingCode
});

const wss = new WebSocketServer({ server, path: "/ws" });
hub.attach(wss);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(dirname, "../../public");
const fallbackPublicDir = path.resolve(process.cwd(), "dist/public");

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/sessions", (_req, res) => {
  res.json({ sessions: hub.listSessions() });
});

app.use(
  express.static(resolvePublicDir(), {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store");
    }
  })
);
app.get(/.*/, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(resolvePublicDir(), "index.html"));
});

server.listen(config.port, () => {
  console.log(`codexproxy server listening on ${config.publicBaseUrl}`);
  console.log(`websocket endpoint: ${config.publicBaseUrl.replace(/^http/, "ws")}/ws`);
});

function resolvePublicDir() {
  if (existsSync(path.join(publicDir, "index.html"))) {
    return publicDir;
  }
  return fallbackPublicDir;
}
