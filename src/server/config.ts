export type ServerConfig = {
  port: number;
  relayToken: string;
  pairingCode: string;
  publicBaseUrl: string;
};

export function loadServerConfig(env = process.env): ServerConfig {
  const port = Number(env.PORT ?? "8787");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port.");
  }

  const relayToken = env.RELAY_TOKEN;
  if (!relayToken || relayToken.length < 16) {
    throw new Error("RELAY_TOKEN must be set to a long random value of at least 16 characters.");
  }

  const pairingCode = env.PAIRING_CODE;
  if (!pairingCode || pairingCode.length < 4) {
    throw new Error("PAIRING_CODE must be set to at least 4 characters.");
  }

  return {
    port,
    relayToken,
    pairingCode,
    publicBaseUrl: env.PUBLIC_BASE_URL ?? `http://localhost:${port}`
  };
}
