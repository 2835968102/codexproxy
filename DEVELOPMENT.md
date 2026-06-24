# Development Guide

## Architecture

Codex Proxy has two runtime parts during development:

- Frontend: React/Vite web UI on `http://localhost:5173`
- Backend relay: Express/WebSocket server on `http://localhost:8787`

In production, the backend also serves the built frontend from `dist/public`, so one port is enough:

- Production app: `http://localhost:8787`
- WebSocket relay: `ws://localhost:8787/ws`
- Sessions API: `http://localhost:8787/api/sessions`

## Development Workflow

Start the backend relay:

```powershell
npm run dev:server
```

Start the frontend dev server in another terminal:

```powershell
npx vite --config vite.config.ts
```

Open:

```text
http://localhost:5173/
```

During development, Vite proxies frontend requests to the backend relay:

```text
http://localhost:5173/ws  ->  ws://localhost:8787/ws
http://localhost:5173/api ->  http://localhost:8787/api
```

This means the page hot-reloads from `src/web`, while backend relay traffic still goes through `8787`.

## Bridge Workflow

Start the bridge in another terminal:

```powershell
npm run dev:bridge
```

For local development, make sure `codexproxy.local.json` has matching `server.relayToken` and `bridge.relayToken`.

Example:

```json
{
  "server": {
    "port": 8787,
    "publicBaseUrl": "http://localhost:8787",
    "relayToken": "cp_9f2d7a6c4b8e1d90a73f5c2e6b91a048",
    "pairingCode": "123456"
  },
  "bridge": {
    "relayUrl": "ws://localhost:8787/ws",
    "relayToken": "cp_9f2d7a6c4b8e1d90a73f5c2e6b91a048",
    "deviceName": "Desktop Codex",
    "codexBin": "C:\\Users\\28359\\AppData\\Local\\OpenAI\\Codex\\bin\\codex.exe",
    "autoStartAppServer": true,
    "codexAppServerPort": 53179,
    "allowRawRpc": false
  }
}
```

If the bridge repeatedly connects and disconnects, first check that the relay tokens match.

## Production-Like Workflow

Build the app:

```powershell
npm run build
```

Start the built server:

```powershell
npm run start:server
```

Open:

```text
http://localhost:8787/
```

`/`, `/lite`, and `/lite.html` are served by the same built React page.

## Validation

Run type checks:

```powershell
npm run typecheck
```

Run tests:

```powershell
npm test
```

Run a production build:

```powershell
npm run build
```

Check backend health:

```text
http://localhost:8787/healthz
```

Check connected bridge sessions:

```text
http://localhost:8787/api/sessions
```
