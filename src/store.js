import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");
const defaultStorePath = join(rootDir, "data", "store.json");

export function createStore(storePath = process.env.STORE_PATH || defaultStorePath) {
  ensureStore(storePath);

  function load() {
    const raw = readFileSync(storePath, "utf8");
    return JSON.parse(raw);
  }

  function save(data) {
    const tmpPath = `${storePath}.tmp`;
    writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    renameSync(tmpPath, storePath);
  }

  function createUser(username, password) {
    const cleanUsername = normalizeUsername(username);
    assertPassword(password);
    const data = load();
    const exists = data.users.some((user) => user.username.toLowerCase() === cleanUsername.toLowerCase());
    if (exists) {
      throw new Error("用户名已存在。");
    }

    const salt = randomBytes(16).toString("hex");
    const user = {
      id: makeId("u"),
      username: cleanUsername,
      passwordHash: hashPassword(password, salt),
      salt,
      createdAt: now()
    };
    data.users.push(user);
    save(data);
    return publicUser(user);
  }

  function verifyUser(username, password) {
    const cleanUsername = normalizeUsername(username);
    const data = load();
    const user = data.users.find((item) => item.username.toLowerCase() === cleanUsername.toLowerCase());
    if (!user || !password) {
      throw new Error("用户名或密码错误。");
    }

    const actual = Buffer.from(hashPassword(password, user.salt), "hex");
    const expected = Buffer.from(user.passwordHash, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new Error("用户名或密码错误。");
    }
    return publicUser(user);
  }

  function createSession(userId) {
    const data = load();
    const token = randomBytes(32).toString("hex");
    data.sessions.push({
      tokenHash: hashToken(token),
      userId,
      createdAt: now(),
      lastSeenAt: now()
    });
    save(data);
    return token;
  }

  function getUserBySession(token) {
    if (!token) return null;
    const data = load();
    const tokenHash = hashToken(token);
    const session = data.sessions.find((item) => item.tokenHash === tokenHash);
    if (!session) return null;
    const user = data.users.find((item) => item.id === session.userId);
    if (!user) return null;
    session.lastSeenAt = now();
    save(data);
    return publicUser(user);
  }

  function deleteSession(token) {
    if (!token) return;
    const data = load();
    const tokenHash = hashToken(token);
    data.sessions = data.sessions.filter((session) => session.tokenHash !== tokenHash);
    save(data);
  }

  function listConversations(userId, mode) {
    const data = load();
    return data.conversations
      .filter((conversation) => conversation.userId === userId)
      .filter((conversation) => !mode || conversation.mode === mode)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(publicConversationSummary);
  }

  function getConversation(userId, conversationId) {
    const data = load();
    const conversation = data.conversations.find(
      (item) => item.id === conversationId && item.userId === userId
    );
    return conversation ? publicConversation(conversation) : null;
  }

  function getLatestConversation(userId, mode) {
    const [latest] = listConversations(userId, mode);
    return latest ? getConversation(userId, latest.id) : null;
  }

  function appendTurn({
    userId,
    conversationId,
    mode,
    question,
    assistantContent,
    trace,
    settings,
    attachments = []
  }) {
    const data = load();
    let conversation = conversationId
      ? data.conversations.find((item) => item.id === conversationId && item.userId === userId)
      : null;

    if (!conversation) {
      conversation = {
        id: makeId("c"),
        userId,
        mode,
        title: makeTitle(question),
        summaryTitle: makeSummaryTitle(question),
        createdAt: now(),
        updatedAt: now(),
        settings: settings || {},
        messages: []
      };
      data.conversations.push(conversation);
    }

    if (conversation.mode !== mode) {
      throw new Error("当前对话模式与请求模式不一致。");
    }

    conversation.messages.push({
      id: makeId("m"),
      role: "user",
      content: String(question || "").trim(),
      attachments: normalizeAttachments(attachments),
      createdAt: now()
    });
    conversation.messages.push({
      id: makeId("m"),
      role: "assistant",
      content: assistantContent,
      trace,
      createdAt: now()
    });
    conversation.settings = settings || conversation.settings || {};
    conversation.updatedAt = now();
    save(data);
    return publicConversation(conversation);
  }

  return {
    createUser,
    verifyUser,
    createSession,
    getUserBySession,
    deleteSession,
    listConversations,
    getConversation,
    getLatestConversation,
    appendTurn
  };
}

function ensureStore(storePath) {
  mkdirSync(dirname(storePath), { recursive: true });
  if (!existsSync(storePath)) {
    writeFileSync(
      storePath,
      JSON.stringify({ users: [], sessions: [], conversations: [] }, null, 2) + "\n",
      "utf8"
    );
  }
}

function normalizeUsername(username) {
  const value = String(username || "").trim();
  if (!/^[\w\u4e00-\u9fa5.-]{2,32}$/u.test(value)) {
    throw new Error("用户名需为 2-32 位，可包含中文、字母、数字、点、横线或下划线。");
  }
  return value;
}

function assertPassword(password) {
  if (String(password || "").length < 6) {
    throw new Error("密码至少需要 6 位。");
  }
}

function hashPassword(password, salt) {
  return scryptSync(String(password), salt, 64).toString("hex");
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}

function makeTitle(question) {
  return String(question || "").replace(/\s+/g, " ").trim() || "未命名对话";
}

function makeSummaryTitle(question) {
  let normalized = makeTitle(question)
    .replace(/[`*_#>\[\](){}]/g, "")
    .replace(/[，。！？；：、,.!?;:\-/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized === "未命名对话") return "未命名对话";

  normalized = normalized
    .replace(/^(请|麻烦|帮忙)?(帮我|协助我|给我|为我)?/, "")
    .replace(/^(我想|我要|我需要|想要)(做一个|做个|创建一个|创建|实现一个|实现|开发一个|开发)?/, "")
    .replace(/^(如何|怎么|怎样|能否|可以)?/, "")
    .trim();

  const action = normalized.match(/^(评估|分析|总结|整理|比较|生成|撰写|写|制定|设计|解释|判断|优化)(一下|下)?\s*(.+)$/);
  if (action) {
    const topic = action[3]
      .replace(/^(这个|这份|该|一个|一份|非常长的|详细的|相关的)+/, "")
      .replace(/\s*(包括|以及|并且|然后|同时).+$/, "")
      .trim();
    if (topic.length >= 2) {
      normalized = `${topic}${action[1]}`;
    }
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  const compact =
    words.length > 1 && /^[\x00-\x7F\s]+$/.test(normalized)
      ? words.slice(0, 6).join(" ")
      : normalized.replace(/\s+/g, "");
  if (compact.length <= 14) return compact;
  return `${compact.slice(0, 14)}...`;
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.slice(0, 5).map((item) => ({
    name: String(item?.name || "未命名附件").slice(0, 180),
    type: String(item?.type || "application/octet-stream").slice(0, 120),
    size: Number.isFinite(Number(item?.size)) ? Number(item.size) : 0,
    kind: ["text", "binary", "oversize"].includes(item?.kind) ? item.kind : "binary",
    content: String(item?.content || "").slice(0, 12000),
    truncated: item?.truncated === true
  }));
}

function now() {
  return new Date().toISOString();
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt
  };
}

function publicConversationSummary(conversation) {
  return {
    id: conversation.id,
    mode: conversation.mode,
    title: conversation.title,
    summaryTitle: conversation.summaryTitle || makeSummaryTitle(conversation.title),
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length
  };
}

function publicConversation(conversation) {
  return {
    ...publicConversationSummary(conversation),
    createdAt: conversation.createdAt,
    settings: conversation.settings || {},
    messages: conversation.messages
  };
}
