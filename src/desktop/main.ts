import { app, BrowserWindow, ipcMain } from "electron";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AppUpdater, ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from "electron-updater";
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
  update: DesktopUpdateState;
  status?: BridgeRuntimeStatus;
  logs: BridgeRuntimeLog[];
};

type DesktopUpdateState = {
  currentVersion: string;
  status: "idle" | "disabled" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  latestVersion?: string;
  percent?: number;
  message?: string;
  checkedAt?: string;
};

const require = createRequire(import.meta.url);
const { autoUpdater } = require("electron-updater") as { autoUpdater: AppUpdater };
const maxLogs = 300;
let mainWindow: BrowserWindow | undefined;
let runtime: BridgeRuntime | undefined;
let updateCheckPromise: Promise<DesktopUpdateState> | undefined;
let state: DesktopState = {
  running: false,
  config: loadDesktopConfig(),
  update: defaultUpdateState(),
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
    registerAutoUpdater();
    await createWindow();
    scheduleInitialUpdateCheck();
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
  ipcMain.handle("desktop:checkForUpdates", () => {
    return checkForUpdates(true);
  });
  ipcMain.handle("desktop:installUpdate", () => {
    installDownloadedUpdate();
    return state;
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

function registerAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => {
    updateAutoUpdateState({
      status: "checking",
      message: "正在检查更新...",
      percent: undefined
    });
  });
  autoUpdater.on("update-available", (info: UpdateInfo) => {
    pushLog({ level: "info", message: `Update ${info.version} is available. Downloading.` });
    updateAutoUpdateState({
      status: "available",
      latestVersion: info.version,
      message: `发现新版本 ${info.version}，正在下载。`,
      percent: undefined
    });
  });
  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    updateAutoUpdateState({
      status: "downloading",
      percent: Math.max(0, Math.min(100, progress.percent)),
      message: `正在下载更新 ${Math.round(progress.percent)}%。`
    });
  });
  autoUpdater.on("update-downloaded", (info: UpdateDownloadedEvent) => {
    pushLog({ level: "info", message: `Update ${info.version} downloaded.` });
    updateAutoUpdateState({
      status: "downloaded",
      latestVersion: info.version,
      percent: 100,
      message: `新版本 ${info.version} 已下载，重启后安装。`,
      checkedAt: new Date().toISOString()
    });
  });
  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    updateAutoUpdateState({
      status: "not-available",
      latestVersion: info.version,
      percent: undefined,
      message: "当前已经是最新版本。",
      checkedAt: new Date().toISOString()
    });
  });
  autoUpdater.on("error", (error: Error) => {
    if (isNoPublishedVersionsError(error)) {
      updateAutoUpdateState(noPublishedVersionsUpdateState());
      return;
    }

    pushLog({ level: "warn", message: `Update check failed: ${error.message}` });
    updateAutoUpdateState({
      status: "error",
      percent: undefined,
      message: `更新检查失败：${error.message}`,
      checkedAt: new Date().toISOString()
    });
  });
}

function scheduleInitialUpdateCheck() {
  if (!app.isPackaged) {
    updateAutoUpdateState({
      status: "disabled",
      message: "开发模式下不会自动检查更新。"
    });
    return;
  }

  setTimeout(() => {
    void checkForUpdates(false);
  }, 2500);
}

function checkForUpdates(manual: boolean) {
  if (!app.isPackaged) {
    updateAutoUpdateState({
      status: "disabled",
      message: manual ? "开发模式下不能检查线上更新，请安装打包后的版本测试。" : "开发模式下不会自动检查更新。",
      checkedAt: new Date().toISOString()
    });
    return Promise.resolve(state);
  }

  if (state.update.status === "downloaded") {
    return Promise.resolve(state);
  }

  if (updateCheckPromise) {
    return updateCheckPromise.then(() => state);
  }

  updateAutoUpdateState({
    status: "checking",
    percent: undefined,
    message: manual ? "正在手动检查更新..." : "正在自动检查更新..."
  });

  updateCheckPromise = autoUpdater
    .checkForUpdates()
    .then((result) => {
      if (!result) {
        updateAutoUpdateState({
          status: "disabled",
          message: "当前安装包没有可用的更新配置。",
          checkedAt: new Date().toISOString()
        });
      }
      return state.update;
    })
    .catch((error: unknown) => {
      if (isNoPublishedVersionsError(error)) {
        updateAutoUpdateState(noPublishedVersionsUpdateState());
        return state.update;
      }

      const message = error instanceof Error ? error.message : "未知更新错误";
      updateAutoUpdateState({
        status: "error",
        message: `更新检查失败：${message}`,
        checkedAt: new Date().toISOString()
      });
      return state.update;
    })
    .finally(() => {
      updateCheckPromise = undefined;
    });

  return updateCheckPromise.then(() => state);
}

function isNoPublishedVersionsError(error: unknown) {
  return error instanceof Error && error.message.includes("No published versions on GitHub");
}

function noPublishedVersionsUpdateState(): Partial<DesktopUpdateState> {
  return {
    status: "not-available",
    latestVersion: app.getVersion(),
    percent: undefined,
    message: "GitHub Release 里还没有发布版本；首次发布后才能自动更新。",
    checkedAt: new Date().toISOString()
  };
}

function installDownloadedUpdate() {
  if (state.update.status !== "downloaded") {
    return;
  }

  pushLog({ level: "info", message: "Installing downloaded update." });
  stopBridge();
  autoUpdater.quitAndInstall(true, true);
}

function updateAutoUpdateState(update: Partial<DesktopUpdateState>) {
  state.update = {
    ...state.update,
    ...update,
    currentVersion: app.getVersion()
  };
  publishState();
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

function defaultUpdateState(): DesktopUpdateState {
  return {
    currentVersion: app.getVersion(),
    status: "idle",
    message: "尚未检查更新。"
  };
}

function getConfigDir() {
  return path.join(app.getPath("userData"));
}

function getConfigPath() {
  return path.join(getConfigDir(), "bridge-config.json");
}
