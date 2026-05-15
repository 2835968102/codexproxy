import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { loadServerConfig } from "./config.js";
import { litePageHtml } from "./lite-page.js";
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

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/sessions", (_req, res) => {
  res.json({ sessions: hub.listSessions() });
});

app.get(["/lite", "/lite.html"], (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(litePageHtml);
});

app.use(
  express.static(publicDir, {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store");
    }
  })
);
app.get(/.*/, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(publicDir, "index.html"));
});

server.listen(config.port, () => {
  console.log(`codexproxy server listening on ${config.publicBaseUrl}`);
  console.log(`websocket endpoint: ${config.publicBaseUrl.replace(/^http/, "ws")}/ws`);
});
