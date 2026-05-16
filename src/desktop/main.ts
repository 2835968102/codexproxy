import { app, BrowserWindow, ipcMain } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BridgeRuntime, type BridgeRuntimeLog, type BridgeRuntimeStatus } from "../bridge/runtime.js";
import { type BridgeConfig } from "../bridge/config.js";

type DesktopBridgeConfig = {
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

type DesktopState = {
  running: boolean;
  config: DesktopBridgeConfig;
  status?: BridgeRuntimeStatus;
  logs: BridgeRuntimeLog[];
};

const maxLogs = 300;
let mainWindow: BrowserWindow | undefined;
let runtime: BridgeRuntime | undefined;
let state: DesktopState = {
  running: false,
  config: loadDesktopConfig(),
  logs: []
};

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    registerIpc();
    await createWindow();
  });
}

app.on("window-all-closed", () => {
  runtime?.stop();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    title: "Codex Proxy Bridge",
    backgroundColor: "#f6f7f4",
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist", "src", "desktop", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.DESKTOP_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.DESKTOP_DEV_SERVER_URL);
  } else {
    await mainWindow.loadURL(pathToFileURL(path.join(app.getAppPath(), "dist", "desktop", "index.html")).toString());
  }
}

function registerIpc() {
  ipcMain.handle("desktop:getState", () => state);
  ipcMain.handle("desktop:saveConfig", (_event, config: DesktopBridgeConfig) => {
    state.config = normalizeDesktopConfig(config);
    saveDesktopConfig(state.config);
    publishState();
    return state;
  });
  ipcMain.handle("desktop:startBridge", () => {
    startBridge();
    return state;
  });
  ipcMain.handle("desktop:stopBridge", () => {
    stopBridge();
    return state;
  });
  ipcMain.handle("desktop:openConfigFolder", () => {
    return import("electron").then(({ shell }) => shell.openPath(getConfigDir()));
  });
}

function startBridge() {
  if (runtime) {
    return;
  }

  saveDesktopConfig(state.config);
  const bridgeConfig = toBridgeConfig(state.config);
  runtime = new BridgeRuntime(bridgeConfig, {
    onLog: pushLog,
    onStatus: (status) => {
      state.status = status;
      publishState();
    }
  });
  state.running = true;
  pushLog({ level: "info", message: "Starting Windows bridge." });
  runtime.start();
  publishState();
}

function stopBridge() {
  if (!runtime) {
    return;
  }
  runtime.stop();
  runtime = undefined;
  state.running = false;
  state.status = undefined;
  pushLog({ level: "info", message: "Windows bridge stopped." });
  publishState();
}

function pushLog(entry: BridgeRuntimeLog) {
  state.logs = [...state.logs, { ...entry }].slice(-maxLogs);
  publishState();
}

function publishState() {
  mainWindow?.webContents.send("desktop:state", state);
}

function toBridgeConfig(config: DesktopBridgeConfig): BridgeConfig {
  return {
    relayUrl: config.relayUrl.trim(),
    relayToken: config.relayToken.trim(),
    sessionId: config.sessionId.trim() || undefined,
    deviceName: config.deviceName.trim() || "Windows Codex Bridge",
    codexBin: config.codexBin.trim() || "codex",
    codexAppServerUrl: config.codexAppServerUrl.trim() || `ws://127.0.0.1:${config.codexAppServerPort}`,
    autoStartAppServer: config.autoStartAppServer,
    codexAppServerPort: config.codexAppServerPort,
    allowRawRpc: config.allowRawRpc
  };
}

function loadDesktopConfig(): DesktopBridgeConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return defaultDesktopConfig();
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Partial<DesktopBridgeConfig>;
    return normalizeDesktopConfig({ ...defaultDesktopConfig(), ...parsed });
  } catch {
    return defaultDesktopConfig();
  }
}

function saveDesktopConfig(config: DesktopBridgeConfig) {
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(getConfigPath(), `${JSON.stringify(normalizeDesktopConfig(config), null, 2)}\n`);
}

function normalizeDesktopConfig(config: DesktopBridgeConfig): DesktopBridgeConfig {
  const port = Number(config.codexAppServerPort);
  const normalizedPort = Number.isInteger(port) && port > 0 && port <= 65535 ? port : 53179;
  return {
    relayUrl: config.relayUrl?.trim() || "ws://localhost:8787/ws",
    relayToken: config.relayToken?.trim() || "",
    sessionId: config.sessionId?.trim() || "desktop-codex",
    deviceName: config.deviceName?.trim() || "Windows Codex Bridge",
    codexBin: config.codexBin?.trim() || "codex",
    autoStartAppServer: Boolean(config.autoStartAppServer),
    codexAppServerPort: normalizedPort,
    codexAppServerUrl: config.codexAppServerUrl?.trim() || `ws://127.0.0.1:${normalizedPort}`,
    allowRawRpc: Boolean(config.allowRawRpc)
  };
}

function defaultDesktopConfig(): DesktopBridgeConfig {
  return {
    relayUrl: "ws://localhost:8787/ws",
    relayToken: "",
    sessionId: "desktop-codex",
    deviceName: "Windows Codex Bridge",
    codexBin: "codex",
    autoStartAppServer: true,
    codexAppServerPort: 53179,
    codexAppServerUrl: "ws://127.0.0.1:53179",
    allowRawRpc: false
  };
}

function getConfigDir() {
  return path.join(app.getPath("userData"));
}

function getConfigPath() {
  return path.join(getConfigDir(), "bridge-config.json");
}
