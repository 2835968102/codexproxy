import type { BridgeRuntimeLog, BridgeRuntimeStatus } from "../bridge/runtime.js";

export type DesktopBridgeConfig = {
  relayUrl: string;
  relayToken: string;
  sessionId: string;
  deviceName: string;
  codexBin: string;
  autoStartAppServer: boolean;
  codexAppServerPort: number;
  codexAppServerUrl: string;
  allowRawRpc: boolean;
};

export type DesktopState = {
  running: boolean;
  config: DesktopBridgeConfig;
  update: DesktopUpdateState;
  status?: BridgeRuntimeStatus;
  logs: BridgeRuntimeLog[];
};

export type DesktopUpdateState = {
  currentVersion: string;
  status: "idle" | "disabled" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  latestVersion?: string;
  percent?: number;
  message?: string;
  checkedAt?: string;
};

declare global {
  interface Window {
    codexProxyDesktop: {
      getState: () => Promise<DesktopState>;
      saveConfig: (config: DesktopBridgeConfig) => Promise<DesktopState>;
      startBridge: () => Promise<DesktopState>;
      stopBridge: () => Promise<DesktopState>;
      openConfigFolder: () => Promise<string>;
      checkForUpdates: () => Promise<DesktopState>;
      installUpdate: () => Promise<DesktopState>;
      onState: (callback: (state: DesktopState) => void) => () => void;
    };
  }
}
