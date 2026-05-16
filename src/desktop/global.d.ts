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
  status?: BridgeRuntimeStatus;
  logs: BridgeRuntimeLog[];
};

declare global {
  interface Window {
    codexProxyDesktop: {
      getState: () => Promise<DesktopState>;
      saveConfig: (config: DesktopBridgeConfig) => Promise<DesktopState>;
      startBridge: () => Promise<DesktopState>;
      stopBridge: () => Promise<DesktopState>;
      openConfigFolder: () => Promise<string>;
      onState: (callback: (state: DesktopState) => void) => () => void;
    };
  }
}
