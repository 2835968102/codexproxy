import { getNumber, getString, loadConfigSources } from "../shared/config-sources.js";

export type ServerConfig = {
  port: number;
  relayToken: string;
  pairingCode: string;
  publicBaseUrl: string;
};

export function loadServerConfig(env = process.env, cwd = process.cwd()): ServerConfig {
  const sources = loadConfigSources(env, cwd);
  const port = getNumber(sources, "server", "PORT", "port", 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port.");
  }

  const relayToken = getString(sources, "server", "RELAY_TOKEN", "relayToken");
  if (!relayToken || relayToken.length < 16) {
    throw new Error("RELAY_TOKEN must be set to a long random value of at least 16 characters.");
  }

  const pairingCode = getString(sources, "server", "PAIRING_CODE", "pairingCode");
  if (!pairingCode || pairingCode.length < 4) {
    throw new Error("PAIRING_CODE must be set to at least 4 characters.");
  }

  return {
    port,
    relayToken,
    pairingCode,
    publicBaseUrl:
      getString(sources, "server", "PUBLIC_BASE_URL", "publicBaseUrl") ?? `http://localhost:${port}`
  };
}
