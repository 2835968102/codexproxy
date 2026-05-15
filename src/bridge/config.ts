import { existsSync } from "node:fs";
import path from "node:path";

export type BridgeConfig = {
  relayUrl: string;
  relayToken: string;
  sessionId?: string;
  deviceName: string;
  codexBin: string;
  codexAppServerUrl: string;
  autoStartAppServer: boolean;
  codexAppServerPort: number;
  allowRawRpc: boolean;
};

export function loadBridgeConfig(env = process.env): BridgeConfig {
  const relayUrl = env.RELAY_URL ?? "ws://localhost:8787/ws";
  const relayToken = env.RELAY_TOKEN;
  if (!relayToken || relayToken.length < 16) {
    throw new Error("RELAY_TOKEN must match the server token and be at least 16 characters.");
  }

  const codexAppServerPort = Number(env.CODEX_APP_SERVER_PORT ?? "53179");
  if (!Number.isInteger(codexAppServerPort) || codexAppServerPort < 1 || codexAppServerPort > 65535) {
    throw new Error("CODEX_APP_SERVER_PORT must be a valid TCP port.");
  }

  return {
    relayUrl,
    relayToken,
    sessionId: env.CODEX_PROXY_SESSION_ID,
    deviceName: env.CODEX_PROXY_DEVICE_NAME ?? "Codex Desktop",
    codexBin: env.CODEX_BIN?.trim() || findDefaultCodexBin(env),
    codexAppServerUrl: env.CODEX_APP_SERVER_URL ?? `ws://127.0.0.1:${codexAppServerPort}`,
    autoStartAppServer: env.CODEX_AUTO_START_APP_SERVER !== "false",
    codexAppServerPort,
    allowRawRpc: env.ALLOW_RAW_RPC === "true"
  };
}

function findDefaultCodexBin(env: NodeJS.ProcessEnv): string {
  if (process.platform !== "win32") {
    return "codex";
  }

  const candidates = [
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "OpenAI", "Codex", "bin", "codex.exe") : undefined,
    env.APPDATA ? path.join(env.APPDATA, "npm", "codex.cmd") : undefined
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? "codex";
}
