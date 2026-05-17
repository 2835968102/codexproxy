export const litePageHtml = String.raw`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Codex Proxy Chat</title>
    <style>
      * { box-sizing: border-box; }
      html, body { min-height: 100%; }
      body {
        margin: 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f5f4ef;
        color: #202020;
      }
      button, input, textarea { font: inherit; }
      button {
        border: 1px solid #202020;
        background: #202020;
        color: #fff;
        border-radius: 8px;
        min-height: 40px;
        padding: 0 13px;
      }
      button.secondary {
        background: #fff;
        color: #202020;
      }
      button.ghost {
        border-color: #d9d6cd;
        background: #fff;
        color: #36332e;
      }
      button:disabled {
        opacity: 0.55;
      }
      input, textarea {
        width: 100%;
        border: 1px solid #d2d0c8;
        border-radius: 8px;
        background: #fff;
        color: #202020;
        padding: 10px 11px;
      }
      textarea {
        resize: none;
        min-height: 44px;
        max-height: 150px;
      }
      label {
        display: grid;
        gap: 6px;
        color: #5f5a52;
        font-size: 13px;
      }
      .shell {
        width: min(880px, 100%);
        min-height: 100vh;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
      }
      .topbar {
        position: sticky;
        top: 0;
        z-index: 4;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        background: rgba(245, 244, 239, 0.96);
        border-bottom: 1px solid #dedbd2;
      }
      h1, h2, h3, p { margin-top: 0; }
      h1 {
        margin-bottom: 2px;
        font-size: 20px;
        line-height: 1.2;
      }
      h2 {
        margin-bottom: 0;
        font-size: 17px;
      }
      h3 {
        margin-bottom: 0;
        font-size: 15px;
      }
      .subtitle {
        margin-bottom: 0;
        color: #6a645b;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 62vw;
      }
      .status {
        flex: 0 0 auto;
        border: 1px solid #cfcac1;
        border-radius: 999px;
        color: #6a645b;
        padding: 6px 10px;
        background: #fff;
        font-size: 14px;
      }
      .status.online {
        border-color: #2f7d54;
        color: #1f6944;
      }
      .panel {
        margin: 14px;
        padding: 14px;
        border: 1px solid #dedbd2;
        border-radius: 10px;
        background: #fff;
      }
      .login {
        display: grid;
        gap: 12px;
      }
      .notice {
        margin: 0;
        padding: 10px 12px;
        border: 1px solid #d9c9a5;
        border-radius: 8px;
        color: #6b4f18;
        background: #fff8e8;
        line-height: 1.45;
        word-break: break-word;
      }
      .hidden { display: none !important; }
      .chat-app {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .thread-panel {
        margin: 10px 14px 0;
        border: 1px solid #dedbd2;
        border-radius: 10px;
        background: #fff;
      }
      .thread-panel summary {
        cursor: pointer;
        padding: 11px 12px;
        color: #36332e;
        font-weight: 650;
      }
      .thread-body {
        display: grid;
        gap: 12px;
        padding: 0 12px 12px;
      }
      .thread-tools {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 8px;
        align-items: end;
      }
      .workspace-list {
        display: grid;
        gap: 10px;
      }
      .workspace-group {
        border: 1px solid #e4e1d8;
        border-radius: 9px;
        overflow: hidden;
        background: #fbfaf7;
      }
      .workspace-group > summary {
        list-style: none;
        cursor: pointer;
      }
      .workspace-group > summary::-webkit-details-marker {
        display: none;
      }
      .workspace-head {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        gap: 8px;
        align-items: center;
        padding: 10px;
        border-bottom: 1px solid #e8e5dc;
      }
      .workspace-group:not([open]) .workspace-head {
        border-bottom: 0;
      }
      .workspace-chevron {
        color: #756f66;
        font-size: 12px;
        transition: transform 0.16s ease;
      }
      .workspace-group[open] .workspace-chevron {
        transform: rotate(90deg);
      }
      .workspace-name {
        display: block;
        min-width: 0;
        font-weight: 700;
        color: #232323;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .workspace-path {
        display: block;
        min-width: 0;
        margin-top: 2px;
        color: #756f66;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .workspace-count {
        color: #756f66;
        font-size: 12px;
        white-space: nowrap;
      }
      .workspace-new {
        min-width: 52px;
        padding: 0 10px;
        white-space: nowrap;
      }
      .thread-list {
        display: grid;
      }
      .thread-item {
        width: 100%;
        display: grid;
        gap: 3px;
        text-align: left;
        border: 0;
        border-radius: 0;
        border-bottom: 1px solid #ebe8df;
        background: #fff;
        color: #202020;
        min-height: 0;
        padding: 10px;
      }
      .thread-item:last-child {
        border-bottom: 0;
      }
      .thread-item.selected {
        background: #eaf4ef;
        box-shadow: inset 3px 0 0 #2f7d54;
      }
      .thread-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 650;
      }
      .thread-meta {
        color: #7b756d;
        font-size: 12px;
      }
      .chat-head {
        display: grid;
        gap: 4px;
        margin: 10px 14px 0;
        padding: 10px 12px;
        border: 1px solid #dedbd2;
        border-radius: 10px;
        background: #fff;
      }
      .chat-title {
        font-weight: 750;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .chat-subtitle {
        color: #746f67;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .work-panel {
        display: none;
        gap: 10px;
        margin: 10px 14px 0;
        padding: 10px 12px;
        border: 1px solid #dedbd2;
        border-radius: 10px;
        background: #fff;
      }
      .work-status {
        display: grid;
        grid-template-columns: 12px 1fr;
        gap: 10px;
        align-items: start;
      }
      .work-dot {
        width: 10px;
        height: 10px;
        margin-top: 5px;
        border-radius: 999px;
        background: #9a948a;
      }
      .work-panel.thinking .work-dot,
      .work-panel.tool .work-dot,
      .work-panel.replying .work-dot {
        background: #2f7d54;
        animation: pulse 1.2s ease-in-out infinite;
      }
      .work-panel.waiting .work-dot {
        background: #b7791f;
      }
      .work-panel.complete .work-dot {
        background: #2f7d54;
      }
      .work-panel.error .work-dot {
        background: #b42318;
      }
      .work-label {
        font-weight: 750;
      }
      .work-detail {
        margin-top: 2px;
        color: #746f67;
        font-size: 12px;
        line-height: 1.45;
        word-break: break-word;
        white-space: pre-wrap;
      }
      .activity-list {
        display: none;
        gap: 8px;
        max-height: 220px;
        overflow-y: auto;
      }
      .activity-item {
        border: 1px solid #e7e3da;
        border-left-width: 4px;
        border-radius: 8px;
        padding: 9px 10px;
        background: #fff;
      }
      .activity-item.running {
        border-left-color: #2f7d54;
      }
      .activity-item.waiting {
        border-left-color: #b7791f;
      }
      .activity-item.done {
        border-left-color: #6a8f7a;
      }
      .activity-item.error {
        border-left-color: #b42318;
      }
      .activity-item.empty {
        color: #746f67;
        border-left-color: #d6d1c6;
        background: #fbfaf7;
      }
      .activity-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        color: #746f67;
        font-size: 11px;
        margin-bottom: 4px;
      }
      .activity-title {
        display: block;
        color: #202020;
        font-weight: 700;
      }
      .activity-detail {
        margin-top: 6px;
        color: #5f5a52;
        background: #f7f7f4;
        border-radius: 6px;
        padding: 7px;
        font-size: 12px;
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 120px;
        overflow: auto;
      }
      .chat-log {
        flex: 1;
        min-height: 320px;
        overflow-y: auto;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .empty-state {
        margin: auto;
        max-width: 340px;
        color: #746f67;
        text-align: center;
        line-height: 1.5;
      }
      .bubble-row {
        display: flex;
      }
      .bubble-row.user {
        justify-content: flex-end;
      }
      .bubble-row.assistant,
      .bubble-row.system {
        justify-content: flex-start;
      }
      .bubble {
        max-width: 86%;
        border-radius: 12px;
        padding: 10px 12px;
        line-height: 1.55;
        white-space: pre-wrap;
        word-break: break-word;
        box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
      }
      .bubble.user {
        color: #fff;
        background: #202020;
        border-bottom-right-radius: 4px;
      }
      .bubble.assistant {
        color: #202020;
        background: #fff;
        border: 1px solid #dedbd2;
        border-bottom-left-radius: 4px;
      }
      .bubble.system {
        color: #5f5a52;
        background: #ece8df;
        font-size: 13px;
        max-width: 100%;
      }
      .bubble-meta {
        color: #7b756d;
        font-size: 11px;
        margin-bottom: 4px;
      }
      .composer {
        position: sticky;
        bottom: 0;
        z-index: 3;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: end;
        padding: 10px 14px max(10px, env(safe-area-inset-bottom));
        background: rgba(245, 244, 239, 0.98);
        border-top: 1px solid #dedbd2;
      }
      .composer button {
        min-width: 74px;
      }
      .bottom-status {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: 10px 1fr;
        gap: 8px;
        align-items: start;
        border: 1px solid #dedbd2;
        border-left: 4px solid #9a948a;
        border-radius: 9px;
        background: #fff;
        color: #5f5a52;
        padding: 8px 10px;
        font-size: 13px;
        box-shadow: 0 5px 18px rgba(0, 0, 0, 0.08);
      }
      .bottom-status.hidden {
        display: none;
      }
      .bottom-status::before {
        content: "";
        width: 8px;
        height: 8px;
        margin-top: 7px;
        border-radius: 999px;
        background: #9a948a;
      }
      .bottom-status.thinking,
      .bottom-status.replying,
      .bottom-status.tool {
        border-left-color: #2f7d54;
      }
      .bottom-status.thinking::before,
      .bottom-status.replying::before,
      .bottom-status.tool::before {
        background: #2f7d54;
        animation: pulse 1.2s ease-in-out infinite;
      }
      .bottom-status.waiting {
        border-left-color: #b7791f;
      }
      .bottom-status.waiting::before {
        background: #b7791f;
      }
      .bottom-status.complete {
        border-left-color: #2f7d54;
      }
      .bottom-status.complete::before {
        background: #2f7d54;
      }
      .bottom-status.error {
        border-left-color: #b42318;
      }
      .bottom-status.error::before {
        background: #b42318;
      }
      .bottom-status-title {
        display: block;
        color: #36332e;
        font-weight: 750;
      }
      .bottom-status-detail {
        display: block;
        margin-top: 2px;
        color: #746f67;
        line-height: 1.35;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .bottom-btn {
        position: fixed;
        right: max(16px, calc((100vw - 880px) / 2 + 16px));
        bottom: calc(74px + env(safe-area-inset-bottom));
        z-index: 5;
        min-height: 38px;
        border-color: #2f7d54;
        background: #2f7d54;
        color: #fff;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      }
      .debug {
        margin: 0 14px 14px;
        border: 1px solid #dedbd2;
        border-radius: 10px;
        background: #fff;
      }
      .debug summary {
        cursor: pointer;
        padding: 10px 12px;
        color: #6a645b;
      }
      pre {
        margin: 0 12px 12px;
        max-height: 220px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        background: #f7f7f4;
        border-radius: 8px;
        padding: 10px;
        font-size: 12px;
      }
      @keyframes pulse {
        0% { opacity: 0.45; transform: scale(0.9); }
        50% { opacity: 1; transform: scale(1.08); }
        100% { opacity: 0.45; transform: scale(0.9); }
      }
      @media (max-width: 640px) {
        .shell { width: 100%; }
        .panel { margin: 12px; }
        .thread-panel { margin: 8px 12px 0; }
        .thread-tools { grid-template-columns: 1fr; }
        .workspace-head { grid-template-columns: auto minmax(0, 1fr) auto; }
        .workspace-count { display: none; }
        .chat-head { margin: 8px 12px 0; }
        .work-panel { margin: 8px 12px 0; }
        .chat-log { padding: 12px; }
        .bubble { max-width: 92%; }
        .bottom-btn {
          right: 14px;
          bottom: calc(78px + env(safe-area-inset-bottom));
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <div>
          <h1>Codex Proxy</h1>
          <p id="sessionText" class="subtitle">手机聊天控制台</p>
        </div>
        <span id="status" class="status">离线</span>
      </header>

      <section id="login" class="panel login">
        <h2>连接</h2>
        <label>配对码
          <input id="pairingCode" inputmode="numeric" autocomplete="one-time-code" />
        </label>
        <label>Session ID
          <input id="sessionId" placeholder="可留空" />
        </label>
        <button id="connectBtn" type="button">连接</button>
        <p id="connectMsg" class="notice hidden"></p>
      </section>

      <section id="chatApp" class="chat-app hidden">
        <details class="thread-panel" open>
          <summary>工作目录与对话</summary>
          <div class="thread-body">
            <div class="thread-tools">
              <label>新对话工作目录
                <input id="cwd" placeholder="可选，例如 D:\PROJECT\CODE\your-repo" />
              </label>
              <button id="newThreadBtn" type="button" class="secondary">新对话</button>
              <button id="refreshBtn" type="button" class="secondary">刷新</button>
            </div>
            <p id="actionMsg" class="notice hidden"></p>
            <div id="workspaceList" class="workspace-list">
              <div class="empty-state">连接后会按工作目录分组显示历史对话。</div>
            </div>
          </div>
        </details>

        <div class="chat-head">
          <div id="chatTitle" class="chat-title">未选择对话</div>
          <div id="chatSubtitle" class="chat-subtitle">选择历史对话会自动加载聊天记录。</div>
        </div>

        <div id="chatLog" class="chat-log">
          <div class="empty-state">连接后选择一个对话，或输入消息新建对话。</div>
        </div>
        <button id="bottomBtn" type="button" class="bottom-btn hidden">到底部 ↓</button>

        <form id="composer" class="composer">
          <div id="bottomStatus" class="bottom-status hidden">
            <div>
              <span id="bottomStatusTitle" class="bottom-status-title">Codex 正在思考</span>
              <span id="bottomStatusDetail" class="bottom-status-detail">请求已发出，正在等待 Codex 返回实时状态。</span>
            </div>
          </div>
          <textarea id="prompt" rows="1" placeholder="发给 Codex 的消息"></textarea>
          <button id="sendBtn" type="submit">发送</button>
        </form>

        <details class="debug">
          <summary>调试事件</summary>
          <pre id="log">等待连接...</pre>
        </details>
      </section>
    </main>

    <script>
      (function () {
        var ws = null;
        var seq = 1;
        var pending = {};
        var retriedStaleSession = false;
        var threads = [];
        var threadsById = {};
        var currentThreadId = "";
        var currentThreadCwd = "";
        var bubbleByItemId = {};
        var lastAssistantBubble = null;
        var activeAssistantItemId = "";
        var historyLoadSeq = 0;
        var threadListRefreshTimer = null;
        var workspaceOpenByKey = readWorkspaceOpenState();

        var pairingInput = document.getElementById("pairingCode");
        var sessionInput = document.getElementById("sessionId");
        var statusEl = document.getElementById("status");
        var sessionText = document.getElementById("sessionText");
        var loginEl = document.getElementById("login");
        var chatApp = document.getElementById("chatApp");
        var connectMsg = document.getElementById("connectMsg");
        var actionMsg = document.getElementById("actionMsg");
        var logEl = document.getElementById("log");
        var chatLog = document.getElementById("chatLog");
        var workspaceList = document.getElementById("workspaceList");
        var promptEl = document.getElementById("prompt");
        var cwdEl = document.getElementById("cwd");
        var chatTitle = document.getElementById("chatTitle");
        var chatSubtitle = document.getElementById("chatSubtitle");
        var bottomStatus = document.getElementById("bottomStatus");
        var bottomStatusTitle = document.getElementById("bottomStatusTitle");
        var bottomStatusDetail = document.getElementById("bottomStatusDetail");
        var sendBtn = document.getElementById("sendBtn");
        var bottomBtn = document.getElementById("bottomBtn");

        pairingInput.value = localStorage.getItem("pairingCode") || "";
        sessionInput.value = localStorage.getItem("sessionId") || "";
        currentThreadId = localStorage.getItem("threadId") || "";

        function show(el, text) {
          el.textContent = text;
          el.className = text ? "notice" : "notice hidden";
        }

        function log(kind, body) {
          var text = "[" + new Date().toLocaleTimeString() + "] " + kind + "\n";
          try {
            text += typeof body === "string" ? body : JSON.stringify(body, null, 2);
          } catch (_) {
            text += String(body);
          }
          logEl.textContent = text + "\n\n" + logEl.textContent;
        }

        function setWork(phase, label, detail) {
          updateBottomStatus(phase, label, detail);
        }

        function resetActivities() {}

        function upsertActivity() {}

        function appendActivityDetail() {}

        function envelope(type, payload, requestId) {
          return JSON.stringify({
            v: 1,
            type: type,
            payload: payload,
            requestId: requestId,
            sentAt: Date.now()
          });
        }

        function connect() {
          var pairingCode = trim(pairingInput.value);
          var sessionId = trim(sessionInput.value);
          connectWith(pairingCode, sessionId, false);
        }

        function connectWith(pairingCode, sessionId, retriedWithoutSession) {
          if (!pairingCode) {
            show(connectMsg, "请输入配对码。");
            return;
          }

          localStorage.setItem("pairingCode", pairingCode);
          retriedStaleSession = retriedWithoutSession;
          if (sessionId) {
            localStorage.setItem("sessionId", sessionId);
          } else {
            localStorage.removeItem("sessionId");
          }
          show(connectMsg, "正在连接...");
          log("system", "connecting");

          if (ws) ws.close();
          var protocol = location.protocol === "https:" ? "wss:" : "ws:";
          ws = new WebSocket(protocol + "//" + location.host + "/ws");

          ws.onopen = function () {
            ws.send(envelope("hello", {
              role: "controller",
              pairingCode: pairingCode,
              sessionId: sessionId || undefined
            }));
          };

          ws.onmessage = function (event) {
            var msg = JSON.parse(event.data);
            handleMessage(msg);
          };

          ws.onerror = function () {
            show(connectMsg, "WebSocket 连接错误。请确认地址、防火墙和 bridge 状态。");
            log("error", "websocket error");
          };

          ws.onclose = function () {
            statusEl.textContent = "离线";
            statusEl.className = "status";
            show(connectMsg, "连接已断开。");
            addSystemBubble("连接已断开。");
            log("system", "closed");
          };
        }

        function handleMessage(msg) {
          if (msg.type === "hello.accepted") {
            statusEl.textContent = "在线";
            statusEl.className = "status online";
            loginEl.className = "hidden";
            chatApp.className = "chat-app";
            var summary = msg.payload && msg.payload.summary;
            sessionText.textContent = summary ? (summary.deviceName + " · " + summary.sessionId) : "已连接";
            show(connectMsg, "");
            log("connected", msg.payload);
            refreshThreads(currentThreadId);
            return;
          }

          if (msg.type === "error") {
            var err = msg.payload && msg.payload.message ? msg.payload.message : "连接失败";
            if (err === "Requested session is not connected." && !retriedStaleSession) {
              sessionInput.value = "";
              localStorage.removeItem("sessionId");
              show(connectMsg, "旧 Session ID 已失效，正在自动改为留空重连...");
              log("system", "retry without stale session id");
              setTimeout(function () {
                connectWith(trim(pairingInput.value), "", true);
              }, 250);
              return;
            }
            show(connectMsg, err);
            addSystemBubble(err);
            log("error", err);
            return;
          }

          if (msg.type === "rpc.response" && pending[msg.requestId]) {
            pending[msg.requestId](msg.payload);
            delete pending[msg.requestId];
            return;
          }

          if (msg.type === "codex.event") {
            handleCodexEvent(msg.payload && msg.payload.message);
            log("codex", msg.payload);
            return;
          }

          if (msg.type === "session.updated") {
            log("session.updated", msg.payload);
            return;
          }

          log(msg.type, msg.payload);
        }

        function rpc(method, params, callback) {
          if (!ws || ws.readyState !== 1) {
            show(actionMsg, "尚未连接。");
            addSystemBubble("尚未连接。");
            return;
          }
          var id = "lite-" + seq++;
          pending[id] = callback;
          ws.send(envelope("rpc.request", {
            target: "codex",
            method: method,
            params: params || {}
          }, id));
        }

        function refreshThreads(preferredThreadId, options) {
          options = options || {};
          var loadHistory = options.loadHistory !== false;
          var showStatus = options.showStatus !== false;
          var wanted = preferredThreadId || currentThreadId;
          if (showStatus) show(actionMsg, "正在刷新对话...");
          rpc("thread.list", {
            limit: 80,
            archived: false,
            sortKey: "updated_at",
            sortDirection: "desc"
          }, function (res) {
            if (!res || !res.ok) {
              show(actionMsg, (res && res.error) || "刷新失败");
              return;
            }
            threads = extractList(res.result);
            threadsById = {};
            for (var i = 0; i < threads.length; i++) {
              if (threads[i] && threads[i].id) {
                threadsById[threads[i].id] = threads[i];
              }
            }
            renderWorkspaces();
            if (showStatus) show(actionMsg, "已按工作目录分组 " + threads.length + " 个对话。");

            if (wanted && threadsById[wanted]) {
              selectThread(wanted, loadHistory);
            } else if (!currentThreadId && threads[0] && threads[0].id) {
              selectThread(threads[0].id, loadHistory);
            } else if (loadHistory && currentThreadId && !threadsById[currentThreadId]) {
              startNewThread(false);
            }
          });
        }

        function scheduleThreadListRefresh(threadId) {
          if (threadListRefreshTimer) {
            clearTimeout(threadListRefreshTimer);
          }
          threadListRefreshTimer = setTimeout(function () {
            threadListRefreshTimer = null;
            refreshThreads(threadId || currentThreadId, {
              loadHistory: false,
              showStatus: false
            });
          }, 400);
        }

        function renderWorkspaces() {
          workspaceList.innerHTML = "";
          var groups = groupThreadsByCwd(threads);
          if (!groups.length) {
            var empty = document.createElement("div");
            empty.className = "empty-state";
            empty.textContent = "还没有历史对话。填入工作目录并发送第一条消息即可新建。";
            workspaceList.appendChild(empty);
            return;
          }

          for (var i = 0; i < groups.length; i++) {
            workspaceList.appendChild(renderWorkspaceGroup(groups[i]));
          }
        }

        function renderWorkspaceGroup(group) {
          var wrap = document.createElement("details");
          wrap.className = "workspace-group";
          var groupKey = workspaceKey(group.cwd);
          var hasSelectedThread = group.threads.some(function (thread) { return thread.id === currentThreadId; });
          wrap.open = hasSelectedThread || workspaceOpenByKey[groupKey] !== false;
          wrap.addEventListener("toggle", function () {
            workspaceOpenByKey[groupKey] = wrap.open;
            saveWorkspaceOpenState();
          });

          var summary = document.createElement("summary");
          var head = document.createElement("div");
          head.className = "workspace-head";

          var chevron = document.createElement("span");
          chevron.className = "workspace-chevron";
          chevron.textContent = "▶";

          var title = document.createElement("div");
          title.style.minWidth = "0";
          var name = document.createElement("span");
          name.className = "workspace-name";
          name.textContent = workspaceName(group.cwd);
          var path = document.createElement("span");
          path.className = "workspace-path";
          path.textContent = group.cwd || "未设置工作目录";
          title.appendChild(name);
          title.appendChild(path);

          var count = document.createElement("span");
          count.className = "workspace-count";
          count.textContent = group.threads.length + " 个对话";

          var newBtn = document.createElement("button");
          newBtn.type = "button";
          newBtn.className = "ghost workspace-new";
          newBtn.textContent = "new";
          newBtn.onclick = function (event) {
            event.preventDefault();
            event.stopPropagation();
            cwdEl.value = group.cwd || "";
            startNewThread(true);
          };

          head.appendChild(chevron);
          head.appendChild(title);
          head.appendChild(count);
          head.appendChild(newBtn);
          summary.appendChild(head);
          wrap.appendChild(summary);

          var list = document.createElement("div");
          list.className = "thread-list";
          for (var i = 0; i < group.threads.length; i++) {
            list.appendChild(renderThreadButton(group.threads[i]));
          }
          wrap.appendChild(list);
          return wrap;
        }

        function renderThreadButton(thread) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = thread.id === currentThreadId ? "thread-item selected" : "thread-item";
          btn.onclick = function () {
            selectThread(thread.id, true);
          };

          var title = document.createElement("span");
          title.className = "thread-title";
          title.textContent = threadTitle(thread);

          var meta = document.createElement("span");
          meta.className = "thread-meta";
          meta.textContent = formatThreadTime(thread);

          btn.appendChild(title);
          btn.appendChild(meta);
          return btn;
        }

        function selectThread(threadId, loadHistory) {
          var thread = threadsById[threadId];
          if (!thread) return;
          var changedThread = currentThreadId !== threadId;

          currentThreadId = threadId;
          currentThreadCwd = thread.cwd || "";
          localStorage.setItem("threadId", threadId);
          cwdEl.value = currentThreadCwd;
          if (loadHistory || changedThread) {
            resetBubbleTracking();
          }
          updateChatHeader(thread);
          renderWorkspaces();

          if (loadHistory) {
            loadThreadHistory(threadId);
          }
        }

        function startNewThread(focusPrompt) {
          currentThreadId = "";
          currentThreadCwd = trim(cwdEl.value);
          localStorage.removeItem("threadId");
          historyLoadSeq++;
          resetBubbleTracking();
          updateChatHeader(null);
          renderWorkspaces();
          renderEmpty("正在新建对话。第一条消息会使用当前工作目录。");
          if (focusPrompt) promptEl.focus();
        }

        function updateChatHeader(thread) {
          if (!thread) {
            chatTitle.textContent = "新对话";
            chatSubtitle.textContent = trim(cwdEl.value) || "未设置工作目录";
            return;
          }
          chatTitle.textContent = threadTitle(thread);
          chatSubtitle.textContent = thread.cwd || "未设置工作目录";
        }

        function loadThreadHistory(threadId) {
          var loadId = ++historyLoadSeq;
          renderEmpty("正在加载历史记录...");
          show(actionMsg, "正在加载对话历史...");
          rpc("thread.read", { threadId: threadId, includeTurns: true }, function (res) {
            if (!isCurrentHistoryLoad(threadId, loadId)) return;
            if (!res || !res.ok) {
              show(actionMsg, (res && res.error) || "历史加载失败");
              renderEmpty("历史加载失败。可以刷新后再试。");
              return;
            }

            var thread = normalizeThread(res.result) || threadsById[threadId] || { id: threadId };
            rememberThread(thread);
            var turns = normalizeTurns(thread.turns);
            if (hasRenderableItems(turns)) {
              renderHistory(thread, turns);
              show(actionMsg, "已加载历史记录。");
              return;
            }

            loadThreadTurnsFallback(threadId, thread, loadId);
          });
        }

        function loadThreadTurnsFallback(threadId, thread, loadId) {
          rpc("thread.turns.list", {
            threadId: threadId,
            limit: 100,
            sortDirection: "asc"
          }, function (res) {
            if (!isCurrentHistoryLoad(threadId, loadId)) return;
            if (!res || !res.ok) {
              renderHistory(thread, []);
              show(actionMsg, "已加载线程信息，但没有可显示的历史明细。");
              return;
            }
            var turns = normalizeTurns((res.result && res.result.data) || res.result);
            renderHistory(thread, turns);
            show(actionMsg, "已加载历史记录。");
          });
        }

        function isCurrentHistoryLoad(threadId, loadId) {
          return loadId === historyLoadSeq && threadId === currentThreadId;
        }

        function resetBubbleTracking() {
          bubbleByItemId = {};
          lastAssistantBubble = null;
          activeAssistantItemId = "";
        }

        function orderedItemsForTurn(turn) {
          var items = Array.isArray(turn && turn.items) ? turn.items : [];
          return items
            .map(function (item, index) {
              return {
                item: item,
                index: index,
                rank: item && item.type === "userMessage" ? 0 : 1
              };
            })
            .sort(function (a, b) {
              return a.rank - b.rank || a.index - b.index;
            })
            .map(function (entry) {
              return entry.item;
            });
        }

        function renderHistory(thread, turns) {
          resetBubbleTracking();
          chatLog.innerHTML = "";
          var orderedTurns = turns.slice().sort(compareTurns);
          var count = 0;
          for (var i = 0; i < orderedTurns.length; i++) {
            var items = orderedItemsForTurn(orderedTurns[i]);
            for (var j = 0; j < items.length; j++) {
              var rendered = renderHistoryItem(items[j], orderedTurns[i]);
              if (rendered) count++;
            }
          }

          if (!count) {
            renderEmpty("这个对话暂时没有可显示的历史消息。");
          }
          rememberThread(thread);
          updateChatHeader(thread);
          scrollChat();
        }

        function renderHistoryItem(item, turn) {
          if (!item || !item.type) return false;
          if (item.type === "userMessage") {
            var userText = userContentToText(item.content);
            if (!userText) return false;
            addBubble("user", userText, formatTurnTime(turn), item.id);
            return true;
          }
          if (item.type === "agentMessage") {
            if (!item.text) return false;
            addBubble("assistant", item.text, "Codex · " + formatTurnTime(turn), item.id);
            return true;
          }
          if (item.type === "plan" && item.text) {
            addBubble("system", "计划\n" + item.text, formatTurnTime(turn), item.id);
            return true;
          }
          if (item.type === "commandExecution") {
            var output = item.aggregatedOutput ? "\n\n" + shorten(item.aggregatedOutput, 3000) : "";
            addBubble("system", "命令\n" + item.command + output, formatTurnTime(turn), item.id);
            return true;
          }
          return false;
        }

        function sendPrompt(event) {
          if (event && event.preventDefault) event.preventDefault();
          var prompt = trim(promptEl.value);
          if (!prompt) {
            show(actionMsg, "请输入消息。");
            return;
          }

          sendBtn.disabled = true;
          historyLoadSeq++;
          activeAssistantItemId = "";
          lastAssistantBubble = null;
          resetActivities();
          addBubble("user", prompt);
          setWork("thinking", "Codex 正在思考", "请求已发出，正在等待 Codex 返回实时状态。");
          promptEl.value = "";
          autoSizePrompt();
          show(actionMsg, "正在发送...");

          if (currentThreadId) {
            rpc("turn.start", {
              threadId: currentThreadId,
              prompt: prompt,
              cwd: currentThreadCwd || undefined
            }, afterSend);
          } else {
            var cwd = trim(cwdEl.value);
            currentThreadCwd = cwd;
            updateChatHeader(null);
            rpc("thread.start", {
              prompt: prompt,
              cwd: cwd || undefined
            }, afterSend);
          }
        }

        function afterSend(res) {
          sendBtn.disabled = false;
          if (!res || !res.ok) {
            show(actionMsg, (res && res.error) || "发送失败");
            addSystemBubble((res && res.error) || "发送失败");
            return;
          }
          var threadId = currentThreadId || extractThreadId(res.result);
          if (threadId) {
            currentThreadId = threadId;
            localStorage.setItem("threadId", threadId);
          }
          setWork("thinking", "Codex 正在思考", "已发送，等待 Codex 返回实时状态。");
          show(actionMsg, "已发送，等待 Codex 回复。");
          scheduleThreadListRefresh(threadId);
        }

        function updateWorkActivity(message) {
          if (!message || typeof message.method !== "string") return;

          var params = message.params || {};
          var threadId = params.threadId || (params.thread && params.thread.id);
          if (threadId && currentThreadId && threadId !== currentThreadId) return;

          if (message.id !== undefined && isServerRequestMethod(message.method)) {
            handleServerRequestActivity(message);
            return;
          }

          if (message.method === "thread/started") {
            upsertActivity({
              id: "thread:" + ((params.thread && params.thread.id) || Date.now()),
              kind: "状态",
              title: "已创建对话",
              detail: params.thread && params.thread.cwd ? "工作目录：" + params.thread.cwd : "",
              state: "done"
            });
            return;
          }

          if (message.method === "turn/started") {
            var turnId = (params.turn && params.turn.id) || params.turnId || "active";
            setWork("thinking", "正在思考", "Codex 已开始处理这条消息。");
            upsertActivity({
              id: "turn:" + turnId,
              kind: "状态",
              title: "开始处理请求",
              detail: "正在分析上下文、规划下一步。",
              state: "running"
            });
            return;
          }

          if (message.method === "turn/plan/updated") {
            setWork("thinking", "计划已更新", currentPlanStep(params.plan) || "Codex 正在规划下一步。");
            upsertActivity({
              id: "plan:" + (params.turnId || "active"),
              kind: "计划",
              title: "计划已更新",
              detail: formatPlanUpdate(params),
              state: planHasRunningStep(params.plan) ? "running" : "done"
            });
            return;
          }

          if (message.method === "item/started") {
            var started = describeThreadItem(params.item, false);
            if (started) {
              setWork(started.phase, started.title, started.detail);
              upsertActivity(started);
            }
            return;
          }

          if (message.method === "item/completed") {
            var completed = describeThreadItem(params.item, true);
            if (completed) {
              setWork(completed.state === "error" ? "error" : completed.phase, completed.title, completed.detail);
              upsertActivity(completed);
            }
            return;
          }

          if (message.method === "item/agentMessage/delta") {
            var replyId = params.itemId || params.turnId || "active";
            setWork("replying", "正在回复", "Codex 正在输出回答。");
            upsertActivity({
              id: "reply:" + replyId,
              kind: "回复",
              title: "正在生成回复",
              detail: "回答内容正在流式返回。",
              state: "running"
            });
            return;
          }

          if (message.method === "item/plan/delta") {
            var planId = params.itemId || "plan:" + (params.turnId || "active");
            setWork("thinking", "正在更新计划", "Codex 正在整理执行步骤。");
            appendActivityDetail(planId, {
              kind: "计划",
              title: "正在更新计划",
              state: "running"
            }, String(params.delta || ""));
            return;
          }

          if (message.method === "item/commandExecution/outputDelta") {
            var commandId = params.itemId || "command:" + (params.turnId || "active");
            setWork("tool", "命令正在输出", "Codex 调用的命令正在返回结果。");
            appendActivityDetail(commandId, {
              kind: "工具",
              title: "命令正在输出",
              state: "running"
            }, String(params.delta || ""));
            return;
          }

          if (message.method === "item/fileChange/outputDelta") {
            var fileOutputId = params.itemId || "file:" + (params.turnId || "active");
            setWork("tool", "文件修改中", "Codex 正在应用文件变更。");
            appendActivityDetail(fileOutputId, {
              kind: "文件",
              title: "文件修改输出",
              state: "running"
            }, String(params.delta || ""));
            return;
          }

          if (message.method === "item/fileChange/patchUpdated") {
            var filePatchId = params.itemId || "file:" + (params.turnId || "active");
            setWork("tool", "文件改动已更新", "Codex 正在准备或应用补丁。");
            upsertActivity({
              id: filePatchId,
              kind: "文件",
              title: "文件改动已更新",
              detail: formatFileChanges(params.changes),
              state: "running"
            });
            return;
          }

          if (message.method === "item/mcpToolCall/progress") {
            var mcpId = params.itemId || "mcp:" + (params.turnId || "active");
            setWork("tool", "MCP 工具运行中", String(params.message || "工具正在返回进度。"));
            upsertActivity({
              id: mcpId,
              kind: "MCP",
              title: "MCP 工具运行中",
              detail: String(params.message || ""),
              state: "running"
            });
            return;
          }

          if (
            message.method === "item/reasoning/summaryPartAdded" ||
            message.method === "item/reasoning/summaryTextDelta" ||
            message.method === "item/reasoning/textDelta"
          ) {
            var reasoningId = params.itemId || "reasoning:" + (params.turnId || "active");
            setWork("thinking", "正在思考", "Codex 正在分析上下文。");
            upsertActivity({
              id: reasoningId,
              kind: "思考",
              title: "正在思考",
              detail: "收到推理进度更新。",
              state: "running"
            });
            return;
          }

          if (message.method === "hook/started") {
            setWork("tool", "Hook 运行中", formatHookRun(params.run));
            upsertActivity({
              id: "hook:" + ((params.run && params.run.id) || Date.now()),
              kind: "Hook",
              title: "Hook 运行中",
              detail: formatHookRun(params.run),
              state: "running"
            });
            return;
          }

          if (message.method === "hook/completed") {
            var hookFailed = params.run && params.run.status === "failed";
            setWork(hookFailed ? "error" : "tool", hookFailed ? "Hook 失败" : "Hook 已完成", formatHookRun(params.run));
            upsertActivity({
              id: "hook:" + ((params.run && params.run.id) || Date.now()),
              kind: "Hook",
              title: hookFailed ? "Hook 失败" : "Hook 已完成",
              detail: formatHookRun(params.run),
              state: hookFailed ? "error" : "done"
            });
            return;
          }

          if (message.method === "serverRequest/resolved") {
            setWork("thinking", "审批已处理", "Codex 继续执行当前任务。");
            upsertActivity({
              id: "request:" + (params.requestId || Date.now()),
              kind: "审批",
              title: "审批已处理",
              state: "done"
            });
            return;
          }

          if (message.method === "turn/completed") {
            var doneTurnId = (params.turn && params.turn.id) || params.turnId || "active";
            var failed = params.turn && params.turn.status === "failed";
            var interrupted = params.turn && params.turn.status === "interrupted";
            var title = interrupted ? "已打断" : failed ? "处理失败" : "处理完成";
            var detail = params.turn && params.turn.error && params.turn.error.message
              ? params.turn.error.message
              : interrupted
                ? "这次回复已被打断。"
                : "Codex 已完成这次回复。";
            setWork(failed ? "error" : "complete", title, detail);
            upsertActivity({
              id: "turn:" + doneTurnId,
              kind: "状态",
              title: title,
              detail: detail,
              state: failed ? "error" : "done"
            });
            return;
          }

          if (message.method === "error") {
            setWork("error", "Codex 返回错误", String(params.message || "未知错误"));
            upsertActivity({
              id: "error:" + Date.now(),
              kind: "错误",
              title: "Codex 返回错误",
              detail: String(params.message || "未知错误"),
              state: "error"
            });
            return;
          }

          if (message.method === "warning" || message.method === "guardianWarning" || message.method === "configWarning") {
            upsertActivity({
              id: message.method + ":" + Date.now(),
              kind: "警告",
              title: "Codex 警告",
              detail: String(params.message || params.warning || "收到警告。"),
              state: "error"
            });
          }
        }

        function handleServerRequestActivity(message) {
          var params = message.params || {};
          if (params.threadId && currentThreadId && params.threadId !== currentThreadId) return;
          var request = describeServerRequest(message.method, params);
          setWork("waiting", request.title, request.detail);
          upsertActivity({
            id: "request:" + message.id,
            kind: "审批",
            title: request.title,
            detail: request.detail,
            state: "waiting"
          });
        }

        function handleCodexEvent(message) {
          if (!message || !message.method) return;

          var params = message.params || {};
          if (params.threadId && currentThreadId && params.threadId !== currentThreadId) {
            return;
          }

          updateWorkActivity(message);

          if (message.method === "thread/started" && params.thread && params.thread.id && !currentThreadId) {
            currentThreadId = params.thread.id;
            localStorage.setItem("threadId", currentThreadId);
            updateChatHeader(params.thread);
            return;
          }

          if (message.method === "item/agentMessage/delta") {
            appendAssistantDelta(params.itemId || params.turnId || "active", params.delta || "");
            return;
          }

          if (message.method === "item/completed") {
            var item = params.item;
            if (item && item.type === "agentMessage" && item.text) {
              setAssistantText(
                item.id || params.itemId || "completed-" + Date.now(),
                item.text,
                params.itemId || params.turnId || activeAssistantItemId
              );
            }
            return;
          }

          if (message.method === "turn/started") {
            if (params.threadId && !currentThreadId) {
              currentThreadId = params.threadId;
              localStorage.setItem("threadId", currentThreadId);
            }
            lastAssistantBubble = null;
            activeAssistantItemId = "";
            show(actionMsg, "Codex 正在回复...");
            return;
          }

          if (message.method === "turn/completed") {
            show(actionMsg, "Codex 已完成回复。");
            if (currentThreadId) scheduleThreadListRefresh(currentThreadId);
          }
        }

        function addBubble(role, text, meta, itemId) {
          clearEmptyState();
          var row = document.createElement("div");
          row.className = "bubble-row " + role;
          var bubble = document.createElement("div");
          bubble.className = "bubble " + role;
          var body;

          if (meta) {
            var metaEl = document.createElement("div");
            metaEl.className = "bubble-meta";
            metaEl.textContent = meta;
            bubble.appendChild(metaEl);
          } else if (role === "assistant") {
            var assistantMeta = document.createElement("div");
            assistantMeta.className = "bubble-meta";
            assistantMeta.textContent = "Codex · " + new Date().toLocaleTimeString();
            bubble.appendChild(assistantMeta);
          }

          body = document.createElement("div");
          body.setAttribute("data-body", "1");
          body.textContent = text || "";
          bubble.appendChild(body);
          row.appendChild(bubble);
          chatLog.appendChild(row);

          if (itemId) {
            bubbleByItemId[itemId] = body;
            if (role === "assistant") lastAssistantBubble = body;
          }
          scrollChat();
          updateBottomButton();
          return body;
        }

        function addSystemBubble(text) {
          addBubble("system", text);
        }

        function updateBottomStatus(phase, label, detail) {
          if (phase === "idle") {
            bottomStatus.className = "bottom-status hidden";
            return;
          }

          bottomStatus.className = "bottom-status " + (phase || "thinking");
          bottomStatusTitle.textContent = label || "Codex 正在思考";
          bottomStatusDetail.textContent = detail || "";
        }

        function ensureAssistantNode(itemId) {
          itemId = itemId || "active";
          if (bubbleByItemId[itemId]) {
            return bubbleByItemId[itemId];
          }
          var node = addBubble("assistant", "", null, itemId);
          lastAssistantBubble = node;
          activeAssistantItemId = itemId;
          return node;
        }

        function appendAssistantDelta(itemId, delta) {
          if (!delta) return;
          var node = ensureAssistantNode(itemId);
          node.textContent += delta;
          scrollChat();
        }

        function setAssistantText(itemId, text, fallbackItemId) {
          if (!bubbleByItemId[itemId] && fallbackItemId && bubbleByItemId[fallbackItemId]) {
            bubbleByItemId[itemId] = bubbleByItemId[fallbackItemId];
          }
          var node = ensureAssistantNode(itemId);
          node.textContent = text || "";
          activeAssistantItemId = itemId;
          scrollChat();
        }

        function isServerRequestMethod(method) {
          return method === "item/commandExecution/requestApproval" ||
            method === "item/fileChange/requestApproval" ||
            method === "item/permissions/requestApproval" ||
            method === "item/tool/requestUserInput" ||
            method === "item/tool/call" ||
            method === "mcpServer/elicitation/request" ||
            method === "applyPatchApproval" ||
            method === "execCommandApproval" ||
            method === "account/chatgptAuthTokens/refresh";
        }

        function describeServerRequest(method, params) {
          if (method === "item/commandExecution/requestApproval" || method === "execCommandApproval") {
            return {
              title: "等待命令审批",
              detail: [params.command, params.cwd ? "目录：" + params.cwd : "", params.reason].filter(Boolean).join("\n")
            };
          }
          if (method === "item/fileChange/requestApproval" || method === "applyPatchApproval") {
            return {
              title: "等待文件修改审批",
              detail: [params.reason, params.grantRoot ? "授权目录：" + params.grantRoot : ""].filter(Boolean).join("\n")
            };
          }
          if (method === "item/tool/call") {
            return {
              title: "工具调用中",
              detail: formatToolName(params.namespace, params.tool) + "\n" + formatJson(params.arguments)
            };
          }
          if (method === "mcpServer/elicitation/request") {
            return {
              title: "等待 MCP 输入",
              detail: [params.serverName, params.message, params.url].filter(Boolean).join("\n")
            };
          }
          if (method === "item/tool/requestUserInput") {
            return {
              title: "等待用户输入",
              detail: Array.isArray(params.questions)
                ? params.questions.map(function (question) {
                    return question.question || question.header || question.id;
                  }).join("\n")
                : ""
            };
          }
          if (method === "item/permissions/requestApproval") {
            return {
              title: "等待权限审批",
              detail: [params.reason, params.cwd ? "目录：" + params.cwd : "", formatJson(params.permissions)]
                .filter(Boolean)
                .join("\n")
            };
          }
          return {
            title: "等待 Codex 请求",
            detail: method
          };
        }

        function describeThreadItem(item, completed) {
          if (!item || !item.type) return null;
          var itemId = typeof item.id === "string" ? item.id : item.type + ":" + Date.now();

          if (item.type === "agentMessage") {
            return {
              id: "reply:" + itemId,
              phase: "replying",
              kind: "回复",
              title: completed ? "回复已完成" : "正在生成回复",
              detail: completed ? "最终回答已返回。" : "回答内容正在流式返回。",
              state: completed ? "done" : "running"
            };
          }
          if (item.type === "plan") {
            return {
              id: itemId,
              phase: "thinking",
              kind: "计划",
              title: completed ? "计划已记录" : "正在制定计划",
              detail: item.text || "",
              state: completed ? "done" : "running"
            };
          }
          if (item.type === "reasoning") {
            return {
              id: itemId,
              phase: "thinking",
              kind: "思考",
              title: completed ? "思考阶段完成" : "正在思考",
              detail: "Codex 正在分析上下文。",
              state: completed ? "done" : "running"
            };
          }
          if (item.type === "commandExecution") {
            return {
              id: itemId,
              phase: "tool",
              kind: "工具",
              title: commandTitle(item.status, completed),
              detail: formatCommandItem(item),
              state: stateFromStatus(item.status, completed)
            };
          }
          if (item.type === "fileChange") {
            var fileState = stateFromStatus(item.status, completed);
            return {
              id: itemId,
              phase: "tool",
              kind: "文件",
              title: fileState === "done" ? "文件修改完成" : fileState === "error" ? "文件修改失败" : "文件修改中",
              detail: formatFileChanges(item.changes),
              state: fileState
            };
          }
          if (item.type === "mcpToolCall") {
            return {
              id: itemId,
              phase: "tool",
              kind: "MCP",
              title: toolTitle("MCP 工具", item.status, completed),
              detail: [
                (item.server || "MCP") + " / " + (item.tool || "tool"),
                item.arguments ? formatJson(item.arguments) : "",
                item.error && item.error.message ? "错误：" + item.error.message : ""
              ].filter(Boolean).join("\n"),
              state: stateFromStatus(item.status, completed)
            };
          }
          if (item.type === "dynamicToolCall") {
            return {
              id: itemId,
              phase: "tool",
              kind: "工具",
              title: toolTitle("工具调用", item.status, completed),
              detail: [
                formatToolName(item.namespace, item.tool),
                item.arguments ? formatJson(item.arguments) : "",
                item.success === false ? "结果：失败" : ""
              ].filter(Boolean).join("\n"),
              state: stateFromStatus(item.status, completed)
            };
          }
          if (item.type === "collabAgentToolCall") {
            return {
              id: itemId,
              phase: "tool",
              kind: "子任务",
              title: toolTitle("子任务工具", item.status, completed),
              detail: [String(item.tool || ""), item.prompt ? shorten(item.prompt, 800) : ""].filter(Boolean).join("\n"),
              state: stateFromStatus(item.status, completed)
            };
          }
          if (item.type === "webSearch") {
            return {
              id: itemId,
              phase: "tool",
              kind: "搜索",
              title: completed ? "搜索已完成" : "正在搜索",
              detail: item.query || "",
              state: completed ? "done" : "running"
            };
          }
          if (item.type === "imageGeneration") {
            var imageState = stateFromStatus(item.status, completed);
            return {
              id: itemId,
              phase: "tool",
              kind: "图片",
              title: imageState === "done" ? "图片已生成" : "图片生成中",
              detail: [item.revisedPrompt, item.savedPath].filter(Boolean).join("\n"),
              state: imageState
            };
          }
          if (item.type === "imageView") {
            return {
              id: itemId,
              phase: "tool",
              kind: "图片",
              title: "查看图片",
              detail: item.path || "",
              state: completed ? "done" : "running"
            };
          }
          return {
            id: itemId,
            phase: "tool",
            kind: "项目",
            title: completed ? item.type + " 已完成" : item.type + " 进行中",
            state: completed ? "done" : "running"
          };
        }

        function formatPlanUpdate(params) {
          var explanation = params.explanation ? String(params.explanation) : "";
          var steps = Array.isArray(params.plan)
            ? params.plan.map(function (step) {
                return (statusLabel(step && step.status) + " " + String((step && step.step) || "")).replace(/^\s+|\s+$/g, "");
              }).filter(Boolean).join("\n")
            : "";
          return [explanation, steps].filter(Boolean).join("\n");
        }

        function planHasRunningStep(plan) {
          if (!Array.isArray(plan)) return false;
          for (var i = 0; i < plan.length; i++) {
            if (plan[i] && plan[i].status === "inProgress") return true;
          }
          return false;
        }

        function currentPlanStep(plan) {
          if (!Array.isArray(plan)) return "";
          for (var i = 0; i < plan.length; i++) {
            if (plan[i] && plan[i].status === "inProgress" && plan[i].step) {
              return String(plan[i].step);
            }
          }
          return "";
        }

        function formatCommandItem(item) {
          return [
            item.command ? "$ " + item.command : "",
            item.cwd ? "目录：" + item.cwd : "",
            item.exitCode !== null && item.exitCode !== undefined ? "退出码：" + item.exitCode : "",
            item.aggregatedOutput ? shorten(String(item.aggregatedOutput), 1800) : ""
          ].filter(Boolean).join("\n");
        }

        function formatFileChanges(changes) {
          if (!Array.isArray(changes) || !changes.length) return "";
          return changes.map(function (change) {
            return String((change.kind || "change") + " " + (change.path || "")).replace(/^\s+|\s+$/g, "");
          }).filter(Boolean).join("\n");
        }

        function formatHookRun(run) {
          if (!run) return "";
          return [run.eventName, run.handlerType, run.statusMessage, run.sourcePath].filter(Boolean).join("\n");
        }

        function stateFromStatus(status, completed) {
          var value = String(status || "").toLowerCase();
          if (value === "failed" || value === "declined" || value === "errored" || value === "blocked" || value === "error") {
            return "error";
          }
          if (value === "pending" || value === "pendinginit" || value === "waiting") {
            return "waiting";
          }
          if (completed || value === "completed" || value === "success" || value === "succeeded") {
            return "done";
          }
          return "running";
        }

        function commandTitle(status, completed) {
          var state = stateFromStatus(status, completed);
          if (state === "done") return "命令已完成";
          if (state === "error") return "命令失败";
          if (state === "waiting") return "命令等待中";
          return "命令运行中";
        }

        function toolTitle(name, status, completed) {
          var state = stateFromStatus(status, completed);
          if (state === "done") return name + "已完成";
          if (state === "error") return name + "失败";
          if (state === "waiting") return name + "等待中";
          return name + "运行中";
        }

        function statusLabel(status) {
          if (status === "completed") return "✓";
          if (status === "inProgress") return "→";
          if (status === "pending") return "·";
          return "-";
        }

        function formatToolName(namespace, tool) {
          return [namespace, tool].filter(Boolean).join(".") || "tool";
        }

        function formatJson(value) {
          if (value === undefined || value === null || value === "") return "";
          try {
            return shorten(JSON.stringify(value, null, 2), 1200);
          } catch (_) {
            return shorten(String(value), 1200);
          }
        }

        function renderEmpty(text) {
          chatLog.innerHTML = "";
          var empty = document.createElement("div");
          empty.className = "empty-state";
          empty.textContent = text;
          chatLog.appendChild(empty);
          updateBottomButton();
        }

        function clearEmptyState() {
          var empty = chatLog.querySelector(".empty-state");
          if (empty) empty.parentNode.removeChild(empty);
        }

        function scrollChat() {
          chatLog.scrollTo({
            top: chatLog.scrollHeight,
            behavior: "auto"
          });
          requestAnimationFrame(function () {
            chatLog.scrollTop = chatLog.scrollHeight;
            updateBottomButton();
          });
          setTimeout(function () {
            chatLog.scrollTop = chatLog.scrollHeight;
            updateBottomButton();
          }, 50);
        }

        function updateBottomButton() {
          var distance = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight;
          bottomBtn.className = distance > 160 ? "bottom-btn" : "bottom-btn hidden";
        }

        function autoSizePrompt() {
          promptEl.style.height = "auto";
          promptEl.style.height = Math.min(promptEl.scrollHeight, 150) + "px";
        }

        function extractList(result) {
          var list = result && (result.data || result.threads || result.items);
          if (!Array.isArray(list) && Array.isArray(result)) list = result;
          return Array.isArray(list) ? list : [];
        }

        function normalizeThread(result) {
          if (!result) return null;
          if (result.thread) return result.thread;
          return result.id ? result : null;
        }

        function normalizeTurns(value) {
          if (Array.isArray(value)) return value;
          if (value && Array.isArray(value.turns)) return value.turns;
          if (value && Array.isArray(value.data)) return value.data;
          return [];
        }

        function hasRenderableItems(turns) {
          for (var i = 0; i < turns.length; i++) {
            if (turns[i] && Array.isArray(turns[i].items) && turns[i].items.length) {
              return true;
            }
          }
          return false;
        }

        function rememberThread(thread) {
          if (!thread || !thread.id) return;
          threadsById[thread.id] = Object.assign({}, threadsById[thread.id] || {}, thread);
          if (thread.id === currentThreadId) {
            currentThreadCwd = thread.cwd || currentThreadCwd;
            cwdEl.value = currentThreadCwd;
          }
        }

        function groupThreadsByCwd(list) {
          var map = {};
          var order = [];
          for (var i = 0; i < list.length; i++) {
            var thread = list[i];
            var cwd = thread && thread.cwd ? thread.cwd : "";
            if (!map[cwd]) {
              map[cwd] = { cwd: cwd, threads: [] };
              order.push(cwd);
            }
            map[cwd].threads.push(thread);
          }
          return order.map(function (cwd) { return map[cwd]; });
        }

        function workspaceName(cwd) {
          if (!cwd) return "未设置工作目录";
          var clean = cwd.replace(/[\\\/]+$/, "");
          var parts = clean.split(/[\\\/]/);
          return parts[parts.length - 1] || clean;
        }

        function workspaceKey(cwd) {
          return cwd || "__none__";
        }

        function readWorkspaceOpenState() {
          try {
            return JSON.parse(localStorage.getItem("workspaceOpenByKey") || "{}") || {};
          } catch (_) {
            return {};
          }
        }

        function saveWorkspaceOpenState() {
          localStorage.setItem("workspaceOpenByKey", JSON.stringify(workspaceOpenByKey));
        }

        function threadTitle(thread) {
          return (thread && (thread.name || thread.preview || thread.id)) || "未命名对话";
        }

        function formatThreadTime(thread) {
          var timestamp = thread && (thread.updatedAt || thread.createdAt);
          return timestamp ? formatTimestamp(timestamp) : "无时间信息";
        }

        function formatTurnTime(turn) {
          var timestamp = turn && (turn.completedAt || turn.startedAt);
          return timestamp ? formatTimestamp(timestamp) : new Date().toLocaleTimeString();
        }

        function formatTimestamp(value) {
          var ms = value < 1000000000000 ? value * 1000 : value;
          return new Date(ms).toLocaleString();
        }

        function compareTurns(a, b) {
          var av = (a && (a.startedAt || a.completedAt)) || 0;
          var bv = (b && (b.startedAt || b.completedAt)) || 0;
          return av - bv;
        }

        function userContentToText(content) {
          if (!Array.isArray(content)) return "";
          var parts = [];
          for (var i = 0; i < content.length; i++) {
            var item = content[i];
            if (!item) continue;
            if (item.type === "text") parts.push(item.text || "");
            if (item.type === "image") parts.push("[图片] " + (item.url || ""));
            if (item.type === "localImage") parts.push("[本地图片] " + (item.path || ""));
            if (item.type === "mention") parts.push("@" + (item.name || item.path || "mention"));
            if (item.type === "skill") parts.push("[技能] " + (item.name || item.path || ""));
          }
          return parts.filter(Boolean).join("\n");
        }

        function extractThreadId(result) {
          if (result && result.thread && result.thread.id) return result.thread.id;
          if (result && result.id) return result.id;
          return "";
        }

        function shorten(text, max) {
          if (!text || text.length <= max) return text || "";
          return text.slice(0, max) + "\n...已截断 " + (text.length - max) + " 字符";
        }

        function trim(value) {
          return String(value || "").replace(/^\s+|\s+$/g, "");
        }

        document.getElementById("connectBtn").onclick = connect;
        document.getElementById("refreshBtn").onclick = function () { refreshThreads(currentThreadId); };
        document.getElementById("newThreadBtn").onclick = function () { startNewThread(true); };
        document.getElementById("composer").onsubmit = sendPrompt;
        bottomBtn.onclick = scrollChat;
        chatLog.addEventListener("scroll", updateBottomButton);
        cwdEl.addEventListener("input", function () {
          if (!currentThreadId) updateChatHeader(null);
        });
        promptEl.addEventListener("input", autoSizePrompt);
        promptEl.addEventListener("keydown", function (event) {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendPrompt(event);
          }
        });
      })();
    </script>
  </body>
</html>`;
