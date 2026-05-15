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
        background: #f6f5f1;
        color: #202020;
      }
      button, input, textarea, select { font: inherit; }
      button {
        border: 1px solid #202020;
        background: #202020;
        color: #fff;
        border-radius: 8px;
        min-height: 42px;
        padding: 0 14px;
      }
      button.secondary {
        background: #fff;
        color: #202020;
      }
      input, textarea, select {
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
        max-height: 140px;
      }
      label {
        display: grid;
        gap: 6px;
        color: #5f5a52;
        font-size: 13px;
      }
      .shell {
        width: min(780px, 100%);
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
        background: rgba(246, 245, 241, 0.96);
        border-bottom: 1px solid #dedbd2;
      }
      h1 {
        margin: 0;
        font-size: 20px;
        line-height: 1.2;
      }
      .subtitle {
        margin: 3px 0 0;
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
      .login h2 {
        margin: 0;
        font-size: 22px;
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
      .settings {
        margin: 10px 14px 0;
        border: 1px solid #dedbd2;
        border-radius: 10px;
        background: #fff;
      }
      .settings summary {
        cursor: pointer;
        padding: 11px 12px;
        color: #36332e;
        font-weight: 650;
      }
      .settings-body {
        display: grid;
        gap: 10px;
        padding: 0 12px 12px;
      }
      .settings-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: end;
      }
      .settings-row button {
        min-width: 86px;
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
        max-width: 320px;
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
        color: #6a645b;
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
        background: rgba(246, 245, 241, 0.98);
        border-top: 1px solid #dedbd2;
      }
      .composer button {
        min-width: 74px;
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
      @media (max-width: 560px) {
        .shell { width: 100%; }
        .panel { margin: 12px; }
        .settings { margin: 8px 12px 0; }
        .chat-log { padding: 12px; }
        .bubble { max-width: 90%; }
        .settings-row { grid-template-columns: 1fr; }
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
        <details class="settings">
          <summary>会话设置</summary>
          <div class="settings-body">
            <div class="settings-row">
              <label>线程
                <select id="threadSelect">
                  <option value="">新线程</option>
                </select>
              </label>
              <button id="refreshBtn" type="button" class="secondary">刷新</button>
            </div>
            <label>新线程工作目录
              <input id="cwd" placeholder="可选，例如 D:\PROJECT\CODE\your-repo" />
            </label>
            <p id="actionMsg" class="notice hidden"></p>
          </div>
        </details>

        <div id="chatLog" class="chat-log">
          <div class="empty-state">连接后可以直接像聊天一样给 Codex 发消息。选择历史线程时会尽量保留原项目目录。</div>
        </div>

        <form id="composer" class="composer">
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
        var threadCwdById = {};
        var bubbleByItemId = {};
        var lastAssistantBubble = null;
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
        var threadSelect = document.getElementById("threadSelect");
        var promptEl = document.getElementById("prompt");
        var cwdEl = document.getElementById("cwd");

        pairingInput.value = localStorage.getItem("pairingCode") || "";
        sessionInput.value = localStorage.getItem("sessionId") || "";

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
          var pairingCode = pairingInput.value.replace(/^\s+|\s+$/g, "");
          var sessionId = sessionInput.value.replace(/^\s+|\s+$/g, "");
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
            addSystemBubble("已连接到 Codex。");
            log("connected", msg.payload);
            refreshThreads();
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
                connectWith(pairingInput.value.replace(/^\s+|\s+$/g, ""), "", true);
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

        function refreshThreads(preferredThreadId) {
          var previousThreadId = preferredThreadId || threadSelect.value;
          show(actionMsg, "正在刷新线程...");
          rpc("thread.list", { limit: 25, archived: false }, function (res) {
            if (!res.ok) {
              show(actionMsg, res.error || "刷新失败");
              return;
            }
            var result = res.result || {};
            var list = result.data || result.threads || result.items || [];
            threadCwdById = {};
            threadSelect.innerHTML = '<option value="">新线程</option>';
            for (var i = 0; i < list.length; i++) {
              var thread = list[i];
              var option = document.createElement("option");
              option.value = thread.id;
              option.setAttribute("data-cwd", thread.cwd || "");
              option.textContent = thread.name || thread.preview || thread.id;
              if (thread.id) {
                threadCwdById[thread.id] = thread.cwd || "";
              }
              threadSelect.appendChild(option);
            }
            if (previousThreadId && threadCwdById[previousThreadId]) {
              threadSelect.value = previousThreadId;
            }
            show(actionMsg, "线程已刷新，共 " + list.length + " 个。");
          });
        }

        function sendPrompt(event) {
          if (event && event.preventDefault) event.preventDefault();
          var prompt = promptEl.value.replace(/^\s+|\s+$/g, "");
          if (!prompt) {
            show(actionMsg, "请输入消息。");
            return;
          }

          var threadId = threadSelect.value;
          addBubble("user", prompt);
          promptEl.value = "";
          autoSizePrompt();
          show(actionMsg, "正在发送...");
          if (threadId) {
            var selected = threadSelect.options[threadSelect.selectedIndex];
            var threadCwd = selected ? selected.getAttribute("data-cwd") : threadCwdById[threadId];
            rpc("turn.start", { threadId: threadId, prompt: prompt, cwd: threadCwd || undefined }, afterSend);
          } else {
            rpc("thread.start", {
              prompt: prompt,
              cwd: cwdEl.value.replace(/^\s+|\s+$/g, "") || undefined
            }, afterSend);
          }
        }

        function afterSend(res) {
          if (!res.ok) {
            show(actionMsg, res.error || "发送失败");
            addSystemBubble(res.error || "发送失败");
            return;
          }
          var preferredThreadId = threadSelect.value;
          if (!preferredThreadId && res.result && res.result.thread && res.result.thread.id) {
            preferredThreadId = res.result.thread.id;
          }
          show(actionMsg, "已发送，等待 Codex 回复。");
          refreshThreads(preferredThreadId);
        }

        function handleCodexEvent(message) {
          if (!message || !message.method) return;

          if (message.method === "item/agentMessage/delta") {
            var params = message.params || {};
            appendAssistantDelta(params.itemId || params.turnId || "active", params.delta || "");
            return;
          }

          if (message.method === "item/completed") {
            var item = message.params && message.params.item;
            if (item && item.type === "agentMessage" && item.text) {
              setAssistantText(item.id || "completed-" + Date.now(), item.text);
            }
            return;
          }

          if (message.method === "turn/started") {
            lastAssistantBubble = null;
            show(actionMsg, "Codex 正在回复...");
            return;
          }

          if (message.method === "turn/completed") {
            show(actionMsg, "Codex 已完成回复。");
          }
        }

        function clearEmptyState() {
          var empty = chatLog.querySelector(".empty-state");
          if (empty) empty.parentNode.removeChild(empty);
        }

        function addBubble(role, text) {
          clearEmptyState();
          var row = document.createElement("div");
          row.className = "bubble-row " + role;
          var bubble = document.createElement("div");
          bubble.className = "bubble " + role;
          if (role === "assistant") {
            var meta = document.createElement("div");
            meta.className = "bubble-meta";
            meta.textContent = "Codex · " + new Date().toLocaleTimeString();
            bubble.appendChild(meta);
            var body = document.createElement("div");
            body.setAttribute("data-body", "1");
            body.textContent = text || "";
            bubble.appendChild(body);
          } else {
            bubble.textContent = text || "";
          }
          row.appendChild(bubble);
          chatLog.appendChild(row);
          scrollChat();
          return bubble.querySelector("[data-body]") || bubble;
        }

        function addSystemBubble(text) {
          addBubble("system", text);
        }

        function ensureAssistantNode(itemId) {
          if (bubbleByItemId[itemId]) {
            return bubbleByItemId[itemId];
          }
          var node = lastAssistantBubble || addBubble("assistant", "");
          bubbleByItemId[itemId] = node;
          lastAssistantBubble = node;
          return node;
        }

        function appendAssistantDelta(itemId, delta) {
          if (!delta) return;
          var node = ensureAssistantNode(itemId);
          node.textContent += delta;
          scrollChat();
        }

        function setAssistantText(itemId, text) {
          var node = ensureAssistantNode(itemId);
          node.textContent = text || "";
          scrollChat();
        }

        function scrollChat() {
          chatLog.scrollTop = chatLog.scrollHeight;
        }

        function autoSizePrompt() {
          promptEl.style.height = "auto";
          promptEl.style.height = Math.min(promptEl.scrollHeight, 140) + "px";
        }

        document.getElementById("connectBtn").onclick = connect;
        document.getElementById("refreshBtn").onclick = function () { refreshThreads(); };
        document.getElementById("composer").onsubmit = sendPrompt;
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
