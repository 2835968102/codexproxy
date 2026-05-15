import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadBridgeConfig } from "../src/bridge/config.js";
import { loadServerConfig } from "../src/server/config.js";

describe("config loading", () => {
  it("loads bridge settings from codexproxy.local.json", () => {
    const cwd = tempDir();
    writeFileSync(
      path.join(cwd, "codexproxy.local.json"),
      JSON.stringify({
        bridge: {
          relayUrl: "ws://example.test/ws",
          relayToken: "local-file-relay-token",
          deviceName: "Desk",
          codexBin: "codex-custom",
          codexAppServerPort: 51234,
          autoStartAppServer: false
        }
      })
    );

    try {
      expect(loadBridgeConfig({}, cwd)).toMatchObject({
        relayUrl: "ws://example.test/ws",
        relayToken: "local-file-relay-token",
        deviceName: "Desk",
        codexBin: "codex-custom",
        codexAppServerUrl: "ws://127.0.0.1:51234",
        autoStartAppServer: false,
        codexAppServerPort: 51234
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("lets environment variables override local config", () => {
    const cwd = tempDir();
    writeFileSync(
      path.join(cwd, "codexproxy.local.json"),
      JSON.stringify({
        server: {
          port: 8787,
          relayToken: "local-file-relay-token",
          pairingCode: "123456"
        }
      })
    );

    try {
      expect(
        loadServerConfig(
          {
            PORT: "9999",
            RELAY_TOKEN: "environment-relay-token",
            PAIRING_CODE: "654321"
          },
          cwd
        )
      ).toMatchObject({
        port: 9999,
        relayToken: "environment-relay-token",
        pairingCode: "654321",
        publicBaseUrl: "http://localhost:9999"
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

function tempDir() {
  return mkdtempSync(path.join(tmpdir(), "codexproxy-config-"));
}
