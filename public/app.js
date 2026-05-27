const state = {
  mode: "expert",
  authMode: "login",
  busy: false,
  user: null,
  currentConversation: null,
  conversations: [],
  modelOptions: [],
  defaultModelIds: [],
  visibleMessages: [],
  attachments: [],
  sidebarCollapsed: false,
  abortController: null
};

const SIDEBAR_STORAGE_KEY = "chatbuddy.sidebarCollapsed";
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 800 * 1024;
const MAX_ATTACHMENT_CHARS = 12000;

const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authSubmit = document.querySelector("#auth-submit");
const authToggle = document.querySelector("#auth-toggle");
const authError = document.querySelector("#auth-error");
const authPassword = document.querySelector("#auth-password");
const form = document.querySelector("#ask-form");
const questionInput = document.querySelector("#question");
const messages = document.querySelector("#messages");
const submit = document.querySelector("#submit");
const abortButton = document.querySelector("#abort");
const modeButtons = [...document.querySelectorAll(".mode-button")];
const expertSettings = document.querySelector("#expert-settings");
const expertEnabled = document.querySelector("#expert-enabled");
const expertCountField = document.querySelector("#expert-count-field");
const debateSettings = document.querySelector("#debate-settings");
const debateEnabled = document.querySelector("#debate-enabled");
const debateAdvanced = document.querySelector("#debate-advanced");
const modelCount = document.querySelector("#model-count");
const modelSelectors = document.querySelector("#model-selectors");
const conversationTitle = document.querySelector("#conversation-title");
const modeKicker = document.querySelector("#mode-kicker");
const historyList = document.querySelector("#history-list");
const newChat = document.querySelector("#new-chat");
const logout = document.querySelector("#logout");
const currentUser = document.querySelector("#current-user");
const webSearchEnabled = document.querySelector("#web-search-enabled");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const attachmentInput = document.querySelector("#attachments");
const attachTrigger = document.querySelector("#attach-trigger");
const attachmentList = document.querySelector("#attachment-list");

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.querySelector("#auth-username").value.trim();
  const password = authPassword.value;
  const endpoint = state.authMode === "login" ? "/api/login" : "/api/register";
  authError.classList.add("hidden");

  try {
    const data = await request(endpoint, {
      method: "POST",
      body: { username, password }
    });
    state.user = data.user;
    await enterApp();
  } catch (error) {
    authError.textContent = error.message;
    authError.classList.remove("hidden");
  }
});

authToggle.addEventListener("click", () => {
  state.authMode = state.authMode === "login" ? "register" : "login";
  authSubmit.textContent = state.authMode === "login" ? "登录" : "注册";
  authToggle.textContent = state.authMode === "login" ? "创建新账号" : "已有账号，去登录";
  authPassword.autocomplete = state.authMode === "login" ? "current-password" : "new-password";
  authError.classList.add("hidden");
});

modeButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    await switchMode(button.dataset.mode);
  });
});

newChat.addEventListener("click", () => {
  state.currentConversation = null;
  conversationTitle.textContent = "开始新对话";
  conversationTitle.title = "开始新对话";
  clearAttachments();
  renderMessages();
  renderHistory();
  document.querySelector("#question").focus();
});

sidebarToggle.addEventListener("click", () => {
  setSidebarCollapsed(!state.sidebarCollapsed);
});

attachTrigger.addEventListener("click", () => {
  attachmentInput.click();
});

attachmentInput.addEventListener("change", async () => {
  await addAttachments([...attachmentInput.files]);
  attachmentInput.value = "";
});

attachmentList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-attachment]");
  if (!button) return;
  state.attachments = state.attachments.filter((item) => item.id !== button.dataset.removeAttachment);
  renderAttachmentList();
});

logout.addEventListener("click", async () => {
  await request("/api/logout", { method: "POST" });
  state.user = null;
  state.currentConversation = null;
  state.conversations = [];
  appView.classList.add("hidden");
  authView.classList.remove("hidden");
});

expertEnabled.addEventListener("change", () => {
  expertCountField.classList.toggle("hidden", !expertEnabled.checked);
});

debateEnabled.addEventListener("change", () => {
  debateAdvanced.classList.toggle("disabled-panel", !debateEnabled.checked);
});

modelCount.addEventListener("change", () => {
  renderModelSelectors(Number(modelCount.value));
});

questionInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  form.requestSubmit();
});

abortButton.addEventListener("click", () => {
  state.abortController?.abort();
});

messages.addEventListener("click", async (event) => {
  const button = event.target.closest(".copy-button");
  if (!button) return;
  const message = state.visibleMessages[Number(button.dataset.copyIndex)];
  if (!message) return;
  await copyText(message.content || "");
  const oldText = button.textContent;
  button.textContent = "已复制";
  setTimeout(() => {
    button.textContent = oldText;
  }, 900);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;

  const question = questionInput.value.trim() || (state.attachments.length ? "请分析我上传的附件。" : "");
  if (!question) return;
  const attachments = state.attachments.map(toAttachmentPayload);

  questionInput.value = "";
  clearAttachments();
  setBusy(true);
  appendPendingUserMessage(question, attachments);
  state.abortController = new AbortController();

  try {
    const endpoint = state.mode === "expert" ? "/api/expert" : "/api/debate";
    const payload =
      state.mode === "expert"
        ? {
            question,
            conversationId: state.currentConversation?.id,
            attachments,
            webSearchEnabled: webSearchEnabled.checked,
            expertEnabled: expertEnabled.checked,
            expertCount: Number(document.querySelector("#expert-count").value)
          }
        : {
            question,
            conversationId: state.currentConversation?.id,
            attachments,
            webSearchEnabled: webSearchEnabled.checked,
            debateEnabled: debateEnabled.checked,
            rounds: Number(document.querySelector("#round-count").value),
            participantModels: getSelectedModelIds()
          };

    const data = await request(endpoint, {
      method: "POST",
      body: payload,
      signal: state.abortController.signal
    });
    state.currentConversation = data.conversation;
    await loadHistory();
    renderConversation(data.conversation);
  } catch (error) {
    const message = error.name === "AbortError" ? "已中断本次生成。" : error.message;
    renderInlineError(message);
  } finally {
    state.abortController = null;
    setBusy(false);
  }
});

async function boot() {
  setSidebarCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
  renderAttachmentList();
  try {
    const [{ user }, models] = await Promise.all([request("/api/me"), request("/api/models")]);
    state.modelOptions = models.options;
    state.defaultModelIds = models.defaults;
    modelCount.value = String(clamp(models.defaults.length || 3, 2, 5));
    renderModelSelectors();
    if (user) {
      state.user = user;
      await enterApp();
    }
  } catch {
    renderModelSelectors();
  }
}

async function enterApp() {
  authView.classList.add("hidden");
  appView.classList.remove("hidden");
  currentUser.textContent = state.user.username;
  await switchMode(state.mode);
}

async function switchMode(mode) {
  state.mode = mode;
  modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  const isExpert = mode === "expert";
  expertSettings.classList.toggle("hidden", !isExpert);
  debateSettings.classList.toggle("hidden", isExpert);
  modeKicker.textContent = isExpert ? "专家模式" : "模型抗辩";
  await loadLatestConversation(mode);
  await loadHistory();
}

async function loadLatestConversation(mode) {
  const data = await request(`/api/conversations/latest?mode=${encodeURIComponent(mode)}`);
  state.currentConversation = data.conversation;
  renderConversation(data.conversation);
}

async function loadHistory() {
  const data = await request(`/api/conversations?mode=${encodeURIComponent(state.mode)}`);
  state.conversations = data.conversations;
  renderHistory();
}

async function loadConversation(id) {
  const data = await request(`/api/conversations/${encodeURIComponent(id)}`);
  state.currentConversation = data.conversation;
  renderConversation(data.conversation);
  renderHistory();
}

function renderConversation(conversation) {
  const title = conversation?.title || "开始新对话";
  conversationTitle.textContent = title;
  conversationTitle.title = title;
  renderMessages(conversation?.messages || []);
}

function renderMessages(items = []) {
  state.visibleMessages = items;
  if (!items.length) {
    messages.innerHTML = `
      <div class="empty-state">
        <h3>${state.mode === "expert" ? "专家模式" : "模型抗辩"}</h3>
        <p>${
          state.mode === "expert"
            ? "可启用多专家协作，也可关闭后直接回答。"
            : "默认 3 个模型参与，支持 2 到 5 个模型，也可关闭后直接回答。"
        }</p>
      </div>`;
    return;
  }

  messages.innerHTML = items
    .map((message, index) => {
      const isUser = message.role === "user";
      const trace = !isUser && message.trace ? renderTrace(message.trace) : "";
      const attachments = isUser ? renderMessageAttachments(message.attachments || []) : "";
      return `
        <article class="message ${isUser ? "from-user" : "from-assistant"}">
          <button class="copy-button" data-copy-index="${index}" type="button">复制</button>
          <div class="bubble">
            ${isUser ? `<p>${escapeHtml(message.content)}</p>` : renderMarkdown(message.content)}
            ${attachments}
            ${trace}
          </div>
        </article>`;
    })
    .join("");
  messages.scrollTop = messages.scrollHeight;
}

function renderHistory() {
  if (!state.conversations.length) {
    historyList.innerHTML = `<div class="history-empty">暂无历史</div>`;
    return;
  }

  historyList.innerHTML = state.conversations
    .map(
      (conversation) => {
        const sidebarTitle = conversation.summaryTitle || conversation.title;
        return `
      <button class="history-item ${
        conversation.id === state.currentConversation?.id ? "active" : ""
      }" data-id="${escapeHtml(conversation.id)}" title="${escapeHtml(conversation.title)}" type="button">
        <span>${escapeHtml(sidebarTitle)}</span>
        <small>${formatDate(conversation.updatedAt)}</small>
      </button>`;
      }
    )
    .join("");

  historyList.querySelectorAll(".history-item").forEach((button) => {
    button.addEventListener("click", () => loadConversation(button.dataset.id));
  });
}

function renderModelSelectors(count = Number(modelCount.value || 3)) {
  const options = getModelOptions();
  const current = [...document.querySelectorAll(".debate-model")].map((select) => select.value);
  const defaults = state.defaultModelIds.length ? state.defaultModelIds : options.map((item) => item.id);
  const selectedIds = buildSelectedIds(count, current, defaults, options);

  modelSelectors.innerHTML = selectedIds
    .map(
      (selectedId, index) => `
      <label class="field compact model-row">
        <span>席位 ${index + 1}</span>
        <select class="debate-model">
          ${options
            .map(
              (option) => `
              <option value="${escapeHtml(option.id)}" ${option.id === selectedId ? "selected" : ""}>
                ${escapeHtml(option.family)} / ${escapeHtml(option.label)}
              </option>`
            )
            .join("")}
        </select>
      </label>`
    )
    .join("");
}

function getModelOptions() {
  return state.modelOptions.length
    ? state.modelOptions
    : [
        { id: "qwen-flash", family: "Qwen", label: "Qwen Flash", model: "qwen-flash" },
        {
          id: "Moonshot-Kimi-K2-Instruct",
          family: "Kimi",
          label: "Kimi K2 Instruct",
          model: "Moonshot-Kimi-K2-Instruct"
        },
        { id: "deepseek-v3", family: "DeepSeek", label: "DeepSeek V3", model: "deepseek-v3" },
        { id: "MiniMax-M2.5", family: "MiniMax", label: "MiniMax M2.5", model: "MiniMax-M2.5" },
        { id: "glm-4.6", family: "GLM", label: "GLM 4.6", model: "glm-4.6" }
      ];
}

function buildSelectedIds(count, current, defaults, options) {
  const optionIds = options.map((option) => option.id);
  const selected = [];
  for (const id of [...current, ...defaults, ...optionIds]) {
    if (!optionIds.includes(id) || selected.includes(id)) continue;
    selected.push(id);
    if (selected.length === count) break;
  }
  return selected;
}

function getSelectedModelIds() {
  if (!debateEnabled.checked) {
    return [];
  }

  const ids = [...document.querySelectorAll(".debate-model")].map((select) => select.value);
  const unique = [...new Set(ids)];
  const expectedCount = Number(modelCount.value || 3);
  if (unique.length !== expectedCount) {
    throw new Error(`请为 ${expectedCount} 个席位选择不同模型。`);
  }
  return unique;
}

function renderTrace(trace) {
  if (!trace) return "";
  if (trace.strategy === "direct") return renderSearchTrace(trace);
  const searchTrace = renderSearchTrace(trace);
  if (trace.mode === "expert") {
    return `
      <details class="trace">
        <summary>查看专家过程</summary>
        ${searchTrace}
        <div class="trace-grid">
          ${trace.experts
            .map(
              (expert) => `
              <section>
                <strong>${escapeHtml(expert.role_name)}</strong>
                <p>${escapeHtml(expert.domain)}</p>
                <p>${escapeHtml(expert.responsibility)}</p>
              </section>`
            )
            .join("")}
        </div>
        ${trace.answers
          .map(
            (answer) => `
            <details class="nested-trace">
              <summary>${escapeHtml(answer.role_name)}</summary>
              ${renderMarkdown(answer.content)}
            </details>`
          )
          .join("")}
      </details>`;
  }

  return `
    <details class="trace">
      <summary>查看抗辩过程</summary>
      ${searchTrace}
      <div class="trace-grid">
        ${trace.participants
          .map(
            (participant) => `
            <section>
              <strong>${escapeHtml(participant.family)}</strong>
              <p>${escapeHtml(participant.model)}</p>
            </section>`
          )
          .join("")}
      </div>
      ${trace.initialAnswers
        .map(
          (answer) => `
          <details class="nested-trace">
            <summary>${escapeHtml(answer.participant)} 初始回答</summary>
            ${renderMarkdown(answer.content)}
          </details>`
        )
        .join("")}
      ${trace.debateRounds
        .map(
          (round) => `
          <details class="nested-trace">
            <summary>第 ${round.round} 轮</summary>
            ${round.items
              .map(
                (item) => `
                <section class="round-item">
                  <strong>${escapeHtml(item.participant)}</strong>
                  ${renderMarkdown(item.content)}
                </section>`
              )
              .join("")}
          </details>`
        )
        .join("")}
    </details>`;
}

function renderSearchTrace(trace) {
  if (!trace.webSearchResults?.length && !trace.webSearchError) return "";
  const results = trace.webSearchResults || [];
  return `
    <details class="nested-trace" open>
      <summary>联网搜索</summary>
      ${
        results.length
          ? `<ol class="search-results">${results
              .map(
                (item) => `
                <li>
                  <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(
                    item.title
                  )}</a>
                  <p>${escapeHtml(item.snippet || "无摘要")}</p>
                </li>`
              )
              .join("")}</ol>`
          : `<p class="search-error">${escapeHtml(trace.webSearchError || "没有搜索结果。")}</p>`
      }
    </details>`;
}

function setSidebarCollapsed(collapsed) {
  state.sidebarCollapsed = collapsed;
  appView.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggle.textContent = collapsed ? "展开" : "收起";
  sidebarToggle.title = collapsed ? "展开侧边栏" : "收起侧边栏";
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
}

async function addAttachments(files) {
  if (!files.length) return;
  const available = MAX_ATTACHMENTS - state.attachments.length;
  const selected = files.slice(0, Math.max(available, 0));

  if (!selected.length) {
    renderInlineError(`最多支持 ${MAX_ATTACHMENTS} 个附件。`);
    return;
  }

  const attachments = await Promise.all(selected.map(readAttachment));
  state.attachments = [...state.attachments, ...attachments];
  renderAttachmentList();

  if (files.length > selected.length) {
    renderInlineError(`已添加前 ${MAX_ATTACHMENTS} 个附件，其余附件未加入。`);
  }
}

async function readAttachment(file) {
  const id = `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const base = {
    id,
    name: file.name || "未命名附件",
    type: file.type || "application/octet-stream",
    size: file.size,
    kind: isReadableAttachment(file) ? "text" : "binary",
    content: "",
    truncated: false
  };

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ...base,
      kind: "oversize",
      content: `附件超过 ${formatFileSize(MAX_ATTACHMENT_BYTES)}，未读取正文。`
    };
  }

  if (base.kind !== "text") {
    return {
      ...base,
      content: "当前版本仅将非文本附件作为文件元数据传递。"
    };
  }

  const text = await file.text();
  return {
    ...base,
    content: text.slice(0, MAX_ATTACHMENT_CHARS),
    truncated: text.length > MAX_ATTACHMENT_CHARS
  };
}

function renderAttachmentList() {
  if (!state.attachments.length) {
    attachmentList.classList.add("hidden");
    attachmentList.innerHTML = "";
    return;
  }

  attachmentList.classList.remove("hidden");
  attachmentList.innerHTML = state.attachments
    .map(
      (item) => `
      <div class="attachment-chip" title="${escapeHtml(item.name)}">
        <span>${escapeHtml(item.name)}</span>
        <small>${escapeHtml(formatAttachmentMeta(item))}</small>
        <button data-remove-attachment="${escapeHtml(item.id)}" type="button" aria-label="移除附件">移除</button>
      </div>`
    )
    .join("");
}

function clearAttachments() {
  state.attachments = [];
  renderAttachmentList();
}

function toAttachmentPayload(item) {
  return {
    name: item.name,
    type: item.type,
    size: item.size,
    kind: item.kind,
    content: item.content,
    truncated: item.truncated
  };
}

function renderMessageAttachments(attachments) {
  if (!attachments.length) return "";
  return `
    <div class="message-attachments">
      ${attachments
        .map(
          (item) => `
          <div class="message-attachment" title="${escapeHtml(item.name)}">
            <span>${escapeHtml(item.name)}</span>
            <small>${escapeHtml(formatAttachmentMeta(item))}</small>
          </div>`
        )
        .join("")}
    </div>`;
}

function isReadableAttachment(file) {
  if ((file.type || "").startsWith("text/")) return true;
  return /\.(txt|md|markdown|csv|tsv|json|jsonl|yaml|yml|xml|html|css|js|jsx|ts|tsx|py|r|sql|sh|log)$/i.test(
    file.name || ""
  );
}

function formatAttachmentMeta(item) {
  const kindLabel =
    item.kind === "text" ? "可读文本" : item.kind === "oversize" ? "过大未读取" : "文件元数据";
  return `${kindLabel} · ${formatFileSize(item.size)}${item.truncated ? " · 已截取" : ""}`;
}

function appendPendingUserMessage(content, attachments = []) {
  const existing = state.currentConversation?.messages || [];
  renderMessages([...existing, { role: "user", content, attachments }]);
}

function renderInlineError(message) {
  const existing = state.currentConversation?.messages || [];
  renderMessages([
    ...existing,
    {
      role: "assistant",
      content: `## 运行失败\n\n${message}`
    }
  ]);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

function setBusy(value) {
  state.busy = value;
  submit.disabled = value;
  attachTrigger.disabled = value;
  abortButton.classList.toggle("hidden", !value);
  submit.textContent = value ? "生成中" : "发送";
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const html = [];
  let index = 0;
  let paragraph = [];
  let list = null;
  let code = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${paragraph.map(formatInline).join("<br>")}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    html.push(
      `<${list.type}>${list.items.map((item) => `<li>${formatInline(item)}</li>`).join("")}</${
        list.type
      }>`
    );
    list = null;
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (code) {
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = null;
      } else {
        flushParagraph();
        flushList();
        code = [];
      }
      index += 1;
      continue;
    }

    if (code) {
      code.push(line);
      index += 1;
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      flushParagraph();
      flushList();
      const table = collectTable(lines, index);
      html.push(renderTable(table.header, table.rows));
      index = table.nextIndex;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length + 1, 5);
      html.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      html.push("<hr>");
      index += 1;
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (bullet || ordered) {
      flushParagraph();
      const type = bullet ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(bullet ? bullet[1] : ordered[1]);
      index += 1;
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  flushList();
  if (code) {
    html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  }
  return `<div class="markdown">${html.join("")}</div>`;
}

function isTableStart(lines, index) {
  const current = lines[index]?.trim() || "";
  const next = lines[index + 1]?.trim() || "";
  return current.includes("|") && isTableSeparator(next);
}

function isTableSeparator(line) {
  if (!line.includes("|")) return false;
  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function collectTable(lines, startIndex) {
  const header = splitTableRow(lines[startIndex]);
  const rows = [];
  let index = startIndex + 2;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed || !trimmed.includes("|")) break;
    rows.push(splitTableRow(trimmed));
    index += 1;
  }
  return { header, rows, nextIndex: index };
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(header, rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${header.map((cell) => `<th>${formatInline(cell)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) =>
                `<tr>${header
                  .map((_, index) => `<td>${formatInline(row[index] || "")}</td>`)
                  .join("")}</tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function formatInline(value) {
  return escapeHtml(value)
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

boot();
