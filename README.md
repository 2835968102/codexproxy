# Codex Proxy

Codex Proxy is a three-part prototype:

1. A server-side relay deployed on your VPS.
2. A local bridge that connects your desktop Codex app-server to the relay.
3. A mobile web console served by the relay, so your phone can view threads and send messages.

The relay is protocol-light. It authenticates the desktop bridge with `RELAY_TOKEN`, authenticates the phone with `PAIRING_CODE`, and forwards whitelisted Codex control requests through the bridge.

## Architecture

```mermaid
flowchart LR
  Phone["Phone browser"] <--> Relay["Relay server /ws + mobile UI"]
  Bridge["Local bridge"] <--> Relay
  Bridge <--> AppServer["codex app-server on 127.0.0.1"]
  AppServer <--> Codex["Local Codex session state"]
```

## Quick Start

Install dependencies:

```powershell
npm install
```

Create local config values:

```powershell
Copy-Item codexproxy.local.example.json codexproxy.local.json
```

Set strong values in `codexproxy.local.json`:

```json
{
  "server": {
    "relayToken": "use-a-long-random-secret",
    "pairingCode": "use-a-phone-pairing-code"
  },
  "bridge": {
    "relayUrl": "ws://localhost:8787/ws",
    "relayToken": "use-a-long-random-secret"
  }
}
```

Start the relay server:

```powershell
npm run dev:server
```

Start the local bridge in another terminal:

```powershell
npm run dev:bridge
```

On Windows, if the bridge cannot find Codex, set `bridge.codexBin` in `codexproxy.local.json` to the real executable path:

```json
{
  "bridge": {
    "codexBin": "C:\\Users\\<you>\\AppData\\Local\\OpenAI\\Codex\\bin\\codex.exe"
  }
}
```

Open the phone console:

```text
http://localhost:8787
```

If your phone browser shows a blank page, use the lightweight fallback page:

```text
http://localhost:8787/lite
```

On a real VPS, expose the server over HTTPS and use `wss://your-domain/ws` for `bridge.relayUrl`.

Config priority is: real environment variables, then `codexproxy.local.json`, then `.env`, then defaults. `codexproxy.local.json` is ignored by git because it can contain private tokens.

## Capabilities

The mobile console currently supports:

- List recent Codex threads.
- Start a new thread with a prompt and optional working directory.
- Send a new turn to an existing thread.
- Interrupt the active turn when the bridge has seen its turn id.
- Forward Codex app-server events and approval requests to the phone.
- Reply to basic approval requests from the phone.

The bridge exposes a conservative Codex RPC whitelist. Raw Codex app-server RPC is blocked by default; set `ALLOW_RAW_RPC=true` only on a trusted network after reading the generated protocol under `generated/codex-app-server`.

## Security Notes

This project can control a local Codex instance, so treat it like remote administration:

- Use HTTPS/WSS in production.
- Keep `RELAY_TOKEN` long and private.
- Keep `PAIRING_CODE` private and rotate it if a phone is lost.
- Do not expose `codex app-server` directly to the internet.
- Prefer loopback app-server binding and let the bridge make the outbound relay connection.
- Leave `ALLOW_RAW_RPC=false` unless you are developing the control protocol.

## Codex Plugin Shell

The repository includes a repo-local plugin shell at `plugins/codex-proxy`. It documents how to run the bridge from Codex and can be registered later through a local marketplace if you want it visible in the Codex plugin UI.

The actual data plane is the bridge process because current Codex plugin manifests do not themselves provide a privileged API to stream every Codex internal event. The bridge uses the experimental `codex app-server` WebSocket protocol generated into `generated/codex-app-server`.

## Production Deployment Sketch

Build the server and mobile UI:

```powershell
npm run build
```

Run the server:

```powershell
$env:PORT="8787"
$env:PUBLIC_BASE_URL="https://your-domain.example"
$env:RELAY_TOKEN="use-a-long-random-secret"
$env:PAIRING_CODE="use-a-phone-pairing-code"
npm run start:server
```

Put Nginx, Caddy, or your platform proxy in front of it with WebSocket upgrade support for `/ws`.

## Docker Compose Deployment

Docker is intended for the Linux relay server only. Keep the bridge on the computer that runs Codex.

Create a server directory:

```bash
mkdir -p ~/codexproxy
cd ~/codexproxy
```

Download the compose template:

```bash
curl -fsSLo compose.yml https://raw.githubusercontent.com/2835968102/codexproxy/main/deploy/compose.yml
curl -fsSLo .env https://raw.githubusercontent.com/2835968102/codexproxy/main/deploy/env.example
```

Edit `.env`:

```env
PORT=8787
PUBLIC_BASE_URL=http://server-ip:8787
RELAY_TOKEN=replace-with-a-long-random-secret
PAIRING_CODE=replace-with-a-phone-code
```

Start the relay:

```bash
docker compose pull
docker compose up -d
```

If you already created the old `docker run` container, remove it once before switching to compose:

```bash
docker rm -f codexproxy
docker compose up -d
```

Update later:

```bash
cd ~/codexproxy
docker compose pull
docker compose up -d
```

Check status:

```bash
docker compose ps
docker compose logs -f
```

Stop or restart:

```bash
docker compose stop
docker compose restart
```

If you want to build locally instead of pulling from GHCR:

```bash
docker build -t codexproxy:local .
CODEXPROXY_IMAGE=codexproxy:local docker compose up -d
```

Phone URL:

```text
http://server-ip:8787/lite
```

If you use Caddy or Nginx for HTTPS, proxy `/` and `/ws` to `127.0.0.1:8787`, then set the Windows bridge in `codexproxy.local.json`:

```json
{
  "bridge": {
    "relayUrl": "wss://your-domain.example/ws",
    "relayToken": "replace-with-the-same-long-random-secret"
  }
}
```

## Publishing Docker Images

Images are published to GitHub Container Registry by `.github/workflows/docker-image.yml`.

After pushing to `main`, GitHub Actions builds and publishes:

```text
ghcr.io/2835968102/codexproxy:latest
```

Tagging a release such as `v0.1.0` also publishes a matching image tag:

```bash
git tag v0.1.0
git push origin v0.1.0
docker pull ghcr.io/2835968102/codexproxy:v0.1.0
```
