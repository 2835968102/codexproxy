---
name: remote-bridge
description: Use when setting up or operating the Codex Proxy local bridge that connects Codex app-server to the relay server.
---

# Codex Proxy Remote Bridge

This plugin is intentionally small. The runtime bridge lives in this repository and is started with:

```powershell
$env:RELAY_URL = "wss://your-server.example/ws"
$env:RELAY_TOKEN = "same-long-token-as-server"
$env:CODEX_PROXY_DEVICE_NAME = "Desktop Codex"
npm run dev:bridge
```

The bridge starts `codex app-server` on loopback by default, connects to the relay server over WebSocket, and exposes a conservative RPC whitelist:

- `thread.list`
- `thread.read`
- `thread.start`
- `turn.start`
- `turn.steer`
- `turn.interrupt`
- `serverRequest.respond`
- `status`

Raw Codex app-server RPC is disabled unless `ALLOW_RAW_RPC=true`.
