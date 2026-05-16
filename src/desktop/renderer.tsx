import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Circle,
  FolderCog,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Square,
  TerminalSquare
} from "lucide-react";
import type { DesktopBridgeConfig, DesktopState } from "./global.js";
import "./styles.css";

const emptyState: DesktopState = {
  running: false,
  config: {
    relayUrl: "ws://localhost:8787/ws",
    relayToken: "",
    sessionId: "desktop-codex",
    deviceName: "Windows Codex Bridge",
    codexBin: "codex",
    autoStartAppServer: true,
    codexAppServerPort: 53179,
    codexAppServerUrl: "ws://127.0.0.1:53179",
    allowRawRpc: false
  },
  update: {
    currentVersion: "0.1.0",
    status: "idle",
    message: "尚未检查更新。"
  },
  logs: []
};

function App() {
  const [state, setState] = useState<DesktopState>(emptyState);
  const [draft, setDraft] = useState<DesktopBridgeConfig>(emptyState.config);
  const [message, setMessage] = useState("");

  useEffect(() => {
    window.codexProxyDesktop.getState().then((next) => {
      setState(next);
      setDraft(next.config);
    });
    return window.codexProxyDesktop.onState((next) => {
      setState(next);
      setDraft((current) => (next.running ? current : next.config));
    });
  }, []);

  const relayOnline = state.running && state.status?.relayConnected;
  const codexOnline = state.running && state.status?.codex.connected;
  const sessionId = state.status?.acceptedSessionId || state.config.sessionId || "未连接";

  const logs = useMemo(() => state.logs.slice().reverse(), [state.logs]);

  async function saveConfig() {
    const next = await window.codexProxyDesktop.saveConfig(draft);
    setState(next);
    setDraft(next.config);
    setMessage("配置已保存");
    window.setTimeout(() => setMessage(""), 1800);
  }

  async function startBridge() {
    await window.codexProxyDesktop.saveConfig(draft);
    const next = await window.codexProxyDesktop.startBridge();
    setState(next);
  }

  async function stopBridge() {
    const next = await window.codexProxyDesktop.stopBridge();
    setState(next);
  }

  async function checkForUpdates() {
    const next = await window.codexProxyDesktop.checkForUpdates();
    setState(next);
  }

  async function installUpdate() {
    await window.codexProxyDesktop.installUpdate();
  }

  function update<K extends keyof DesktopBridgeConfig>(key: K, value: DesktopBridgeConfig[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="shell">
      <section className="toolbar">
        <div>
          <h1>Codex Proxy Bridge</h1>
          <p>Windows 桌面桥接程序</p>
        </div>
        <div className="actions">
          <button className="iconButton secondary" title="打开配置目录" onClick={() => window.codexProxyDesktop.openConfigFolder()}>
            <FolderCog size={18} />
          </button>
          <button className="secondary" onClick={saveConfig} disabled={state.running}>
            <Save size={18} />
            保存
          </button>
          {state.running ? (
            <button className="danger" onClick={stopBridge}>
              <Square size={18} />
              停止
            </button>
          ) : (
            <button className="primary" onClick={startBridge} disabled={!draft.relayToken.trim()}>
              <Play size={18} />
              启动
            </button>
          )}
        </div>
      </section>

      <section className="statusGrid">
        <StatusTile label="Bridge" value={state.running ? "运行中" : "未启动"} online={state.running} icon={<Activity size={20} />} />
        <StatusTile label="Relay" value={relayOnline ? "已连接" : "未连接"} online={Boolean(relayOnline)} icon={<Server size={20} />} />
        <StatusTile label="Codex" value={codexOnline ? "已连接" : "未连接"} online={Boolean(codexOnline)} icon={<TerminalSquare size={20} />} />
        <StatusTile label="Session" value={sessionId} online={Boolean(state.status?.acceptedSessionId)} icon={<Circle size={20} />} />
        <StatusTile
          label="Update"
          value={formatUpdateTile(state.update)}
          online={state.update.status === "downloaded"}
          icon={<Circle size={20} />}
        />
      </section>

      <section className="content">
        <form className="panel" onSubmit={(event) => event.preventDefault()}>
          <div className="panelTitle">
            <h2>配置</h2>
            <span>{message}</span>
          </div>

          <label>
            Relay URL
            <input
              value={draft.relayUrl}
              disabled={state.running}
              onChange={(event) => update("relayUrl", event.target.value)}
              placeholder="ws://server-ip:8787/ws"
            />
          </label>

          <label>
            Relay Token
            <input
              value={draft.relayToken}
              disabled={state.running}
              onChange={(event) => update("relayToken", event.target.value)}
              placeholder="和 Linux relay 的 RELAY_TOKEN 一致"
              type="password"
            />
          </label>

          <div className="twoCols">
            <label>
              Session ID
              <input
                value={draft.sessionId}
                disabled={state.running}
                onChange={(event) => update("sessionId", event.target.value)}
                placeholder="desktop-codex"
              />
            </label>
            <label>
              设备名
              <input
                value={draft.deviceName}
                disabled={state.running}
                onChange={(event) => update("deviceName", event.target.value)}
                placeholder="Windows Codex Bridge"
              />
            </label>
          </div>

          <label>
            Codex 路径
            <input
              value={draft.codexBin}
              disabled={state.running}
              onChange={(event) => update("codexBin", event.target.value)}
              placeholder="codex 或 C:\\Users\\...\\codex.exe"
            />
          </label>

          <div className="twoCols">
            <label>
              App Server URL
              <input
                value={draft.codexAppServerUrl}
                disabled={state.running}
                onChange={(event) => update("codexAppServerUrl", event.target.value)}
                placeholder="ws://127.0.0.1:53179"
              />
            </label>
            <label>
              App Server 端口
              <input
                value={draft.codexAppServerPort}
                disabled={state.running}
                onChange={(event) => update("codexAppServerPort", Number(event.target.value))}
                min={1}
                max={65535}
                type="number"
              />
            </label>
          </div>

          <label className="checkRow">
            <input
              type="checkbox"
              checked={draft.autoStartAppServer}
              disabled={state.running}
              onChange={(event) => update("autoStartAppServer", event.target.checked)}
            />
            自动启动本机 codex app-server
          </label>

          <label className="checkRow">
            <input
              type="checkbox"
              checked={draft.allowRawRpc}
              disabled={state.running}
              onChange={(event) => update("allowRawRpc", event.target.checked)}
            />
            允许 raw RPC
          </label>
        </form>

        <div className="sideStack">
          <section className="panel updatePanel">
            <div className="panelTitle">
              <h2>更新</h2>
              <span>v{state.update.currentVersion}</span>
            </div>
            <div className="updateStatus">
              <strong>{formatUpdateTitle(state.update)}</strong>
              <p>{state.update.message || "尚未检查更新。"}</p>
              {state.update.status === "downloading" && (
                <div className="progressTrack" aria-label="更新下载进度">
                  <div style={{ width: `${Math.round(state.update.percent || 0)}%` }} />
                </div>
              )}
            </div>
            <div className="updateActions">
              <button
                className="secondary"
                onClick={checkForUpdates}
                disabled={["checking", "downloading"].includes(state.update.status)}
              >
                <RefreshCw size={18} />
                检查更新
              </button>
              <button className="primary" onClick={installUpdate} disabled={state.update.status !== "downloaded"}>
                <RotateCcw size={18} />
                重启安装
              </button>
            </div>
          </section>

          <section className="panel logsPanel">
            <div className="panelTitle">
              <h2>日志</h2>
              <span>{logs.length} 条</span>
            </div>
            <div className="logs">
              {logs.length === 0 ? (
                <div className="emptyLog">暂无日志</div>
              ) : (
                logs.map((log, index) => (
                  <div className={`logLine ${log.level}`} key={`${index}-${log.message}`}>
                    <span>{log.level}</span>
                    <p>{formatLog(log)}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function StatusTile({
  label,
  value,
  online,
  icon
}: {
  label: string;
  value: string;
  online: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="statusTile">
      <div className={online ? "tileIcon online" : "tileIcon"}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function formatLog(log: DesktopState["logs"][number]) {
  if (!log.data) {
    return log.message;
  }
  return `${log.message} ${JSON.stringify(log.data)}`;
}

function formatUpdateTile(update: DesktopState["update"]) {
  if (update.status === "downloaded") {
    return `v${update.latestVersion}`;
  }
  if (update.status === "downloading") {
    return `${Math.round(update.percent || 0)}%`;
  }
  if (update.status === "checking") {
    return "检查中";
  }
  if (update.status === "not-available") {
    return "已是最新";
  }
  if (update.status === "disabled") {
    return "开发模式";
  }
  if (update.status === "error") {
    return "检查失败";
  }
  return "待检查";
}

function formatUpdateTitle(update: DesktopState["update"]) {
  switch (update.status) {
    case "checking":
      return "正在检查";
    case "available":
      return "发现新版本";
    case "downloading":
      return "正在下载";
    case "downloaded":
      return "可以安装";
    case "not-available":
      return "无需更新";
    case "disabled":
      return "更新未启用";
    case "error":
      return "更新失败";
    default:
      return "自动更新";
  }
}

createRoot(document.getElementById("root")!).render(<App />);
