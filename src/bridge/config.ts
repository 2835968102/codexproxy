import { existsSync } from "node:fs";
import path from "node:path";
import { getBoolean, getNumber, getString, loadConfigSources } from "../shared/config-sources.js";

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

export function loadBridgeConfig(env = process.env, cwd = process.cwd()): BridgeConfig {
  const sources = loadConfigSources(env, cwd);
  const relayUrl = getString(sources, "bridge", "RELAY_URL", "relayUrl", "ws://localhost:8787/ws");
  const relayToken = getString(sources, "bridge", "RELAY_TOKEN", "relayToken");
  if (!relayToken || relayToken.length < 16) {
    throw new Error("RELAY_TOKEN must match the server token and be at least 16 characters.");
  }

  const codexAppServerPort = getNumber(
    sources,
    "bridge",
    "CODEX_APP_SERVER_PORT",
    "codexAppServerPort",
    53179
  );
  if (!Number.isInteger(codexAppServerPort) || codexAppServerPort < 1 || codexAppServerPort > 65535) {
    throw new Error("CODEX_APP_SERVER_PORT must be a valid TCP port.");
  }

  return {
    relayUrl: relayUrl ?? "ws://localhost:8787/ws",
    relayToken,
    sessionId: getString(sources, "bridge", "CODEX_PROXY_SESSION_ID", "sessionId"),
    deviceName: getString(sources, "bridge", "CODEX_PROXY_DEVICE_NAME", "deviceName", "Codex Desktop") ?? "Codex Desktop",
    codexBin: getString(sources, "bridge", "CODEX_BIN", "codexBin")?.trim() || findDefaultCodexBin(env),
    codexAppServerUrl:
      getString(sources, "bridge", "CODEX_APP_SERVER_URL", "codexAppServerUrl") ??
      `ws://127.0.0.1:${codexAppServerPort}`,
    autoStartAppServer: getBoolean(
      sources,
      "bridge",
      "CODEX_AUTO_START_APP_SERVER",
      "autoStartAppServer",
      true
    ),
    codexAppServerPort,
    allowRawRpc: getBoolean(sources, "bridge", "ALLOW_RAW_RPC", "allowRawRpc", false)
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
