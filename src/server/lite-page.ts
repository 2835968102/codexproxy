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
      .workspace-head {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: center;
        padding: 10px;
        border-bottom: 1px solid #e8e5dc;
      }
      .workspace-name {
        display: block;
        font-weight: 700;
        color: #232323;
      }
      .workspace-path {
        display: block;
        margin-top: 2px;
        color: #756f66;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
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
      @media (max-width: 640px) {
        .shell { width: 100%; }
        .panel { margin: 12px; }
        .thread-panel { margin: 8px 12px 0; }
        .thread-tools { grid-template-columns: 1fr; }
        .workspace-head { grid-template-columns: 1fr; }
        .chat-head { margin: 8px 12px 0; }
        .chat-log { padding: 12px; }
        .bubble { max-width: 92%; }
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
        var threads = [];
        var threadsById = {};
        var currentThreadId = "";
        var currentThreadCwd = "";
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
        var workspaceList = document.getElementById("workspaceList");
        var promptEl = document.getElementById("prompt");
        var cwdEl = document.getElementById("cwd");
        var chatTitle = document.getElementById("chatTitle");
        var chatSubtitle = document.getElementById("chatSubtitle");
        var sendBtn = document.getElementById("sendBtn");

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

        function refreshThreads(preferredThreadId) {
          var wanted = preferredThreadId || currentThreadId;
          show(actionMsg, "正在刷新对话...");
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
            show(actionMsg, "已按工作目录分组 " + threads.length + " 个对话。");

            if (wanted && threadsById[wanted]) {
              selectThread(wanted, true);
            } else if (!currentThreadId && threads[0] && threads[0].id) {
              selectThread(threads[0].id, true);
            } else if (currentThreadId && !threadsById[currentThreadId]) {
              startNewThread(false);
            }
          });
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
          var wrap = document.createElement("section");
          wrap.className = "workspace-group";

          var head = document.createElement("div");
          head.className = "workspace-head";

          var title = document.createElement("div");
          var name = document.createElement("span");
          name.className = "workspace-name";
          name.textContent = workspaceName(group.cwd);
          var path = document.createElement("span");
          path.className = "workspace-path";
          path.textContent = group.cwd || "未设置工作目录";
          title.appendChild(name);
          title.appendChild(path);

          var newBtn = document.createElement("button");
          newBtn.type = "button";
          newBtn.className = "ghost";
          newBtn.textContent = "在此新建";
          newBtn.onclick = function () {
            cwdEl.value = group.cwd || "";
            startNewThread(true);
          };

          head.appendChild(title);
          head.appendChild(newBtn);
          wrap.appendChild(head);

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

          currentThreadId = threadId;
          currentThreadCwd = thread.cwd || "";
          localStorage.setItem("threadId", threadId);
          cwdEl.value = currentThreadCwd;
          bubbleByItemId = {};
          lastAssistantBubble = null;
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
          bubbleByItemId = {};
          lastAssistantBubble = null;
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
          renderEmpty("正在加载历史记录...");
          show(actionMsg, "正在加载对话历史...");
          rpc("thread.read", { threadId: threadId, includeTurns: true }, function (res) {
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

            loadThreadTurnsFallback(threadId, thread);
          });
        }

        function loadThreadTurnsFallback(threadId, thread) {
          rpc("thread.turns.list", {
            threadId: threadId,
            limit: 100,
            sortDirection: "asc"
          }, function (res) {
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

        function renderHistory(thread, turns) {
          bubbleByItemId = {};
          lastAssistantBubble = null;
          chatLog.innerHTML = "";
          var orderedTurns = turns.slice().sort(compareTurns);
          var count = 0;
          for (var i = 0; i < orderedTurns.length; i++) {
            var items = Array.isArray(orderedTurns[i].items) ? orderedTurns[i].items : [];
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
          addBubble("user", prompt);
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
          show(actionMsg, "已发送，等待 Codex 回复。");
          refreshThreads(threadId);
        }

        function handleCodexEvent(message) {
          if (!message || !message.method) return;

          var params = message.params || {};
          if (params.threadId && currentThreadId && params.threadId !== currentThreadId) {
            return;
          }

          if (message.method === "item/agentMessage/delta") {
            appendAssistantDelta(params.itemId || params.turnId || "active", params.delta || "");
            return;
          }

          if (message.method === "item/completed") {
            var item = params.item;
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
            if (currentThreadId) refreshThreads(currentThreadId);
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
          return body;
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

        function renderEmpty(text) {
          chatLog.innerHTML = "";
          var empty = document.createElement("div");
          empty.className = "empty-state";
          empty.textContent = text;
          chatLog.appendChild(empty);
        }

        function clearEmptyState() {
          var empty = chatLog.querySelector(".empty-state");
          if (empty) empty.parentNode.removeChild(empty);
        }

        function scrollChat() {
          chatLog.scrollTop = chatLog.scrollHeight;
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
