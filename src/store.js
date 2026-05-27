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

  function appendTurn({ userId, conversationId, mode, question, assistantContent, trace, settings }) {
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
  const title = String(question || "").replace(/\s+/g, " ").trim();
  return title.length > 34 ? `${title.slice(0, 34)}...` : title || "未命名对话";
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
