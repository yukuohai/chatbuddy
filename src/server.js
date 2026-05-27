import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { getConfig } from "./config.js";
import { createBailianClient, LlmError } from "./llm.js";
import { runDebateMode, runExpertMode } from "./orchestrator.js";
import { DEFAULT_DEBATE_MODEL_IDS, TEXT_MODEL_OPTIONS, resolveDebateModels } from "./models.js";
import { createStore } from "./store.js";
import { searchWeb } from "./search.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");
const publicDir = join(rootDir, "public");
const config = getConfig();
const llm = createBailianClient(config);
const store = createStore();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { ok: true });
    }

    if (request.method === "POST" && url.pathname === "/api/register") {
      const body = await readJson(request);
      const user = store.createUser(body.username, body.password);
      const token = store.createSession(user.id);
      setSessionCookie(response, token);
      return sendJson(response, 200, { user });
    }

    if (request.method === "POST" && url.pathname === "/api/login") {
      const body = await readJson(request);
      const user = store.verifyUser(body.username, body.password);
      const token = store.createSession(user.id);
      setSessionCookie(response, token);
      return sendJson(response, 200, { user });
    }

    if (request.method === "POST" && url.pathname === "/api/logout") {
      store.deleteSession(getSessionToken(request));
      clearSessionCookie(response);
      return sendJson(response, 200, { ok: true });
    }

    if (request.method === "GET" && url.pathname === "/api/me") {
      const user = getCurrentUser(request);
      return sendJson(response, 200, { user });
    }

    if (request.method === "GET" && url.pathname === "/api/models") {
      const configuredDefaults = resolveDebateModels(config.debateModelIds || DEFAULT_DEBATE_MODEL_IDS);
      return sendJson(response, 200, {
        options: TEXT_MODEL_OPTIONS,
        defaults: configuredDefaults.map((option) => option.id)
      });
    }

    if (request.method === "GET" && url.pathname === "/api/conversations") {
      const user = requireUser(request);
      return sendJson(response, 200, {
        conversations: store.listConversations(user.id, url.searchParams.get("mode"))
      });
    }

    if (request.method === "GET" && url.pathname === "/api/conversations/latest") {
      const user = requireUser(request);
      return sendJson(response, 200, {
        conversation: store.getLatestConversation(user.id, url.searchParams.get("mode"))
      });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/conversations/")) {
      const user = requireUser(request);
      const conversationId = decodeURIComponent(url.pathname.split("/").pop());
      const conversation = store.getConversation(user.id, conversationId);
      if (!conversation) {
        return sendJson(response, 404, { error: "对话不存在或无权访问。" });
      }
      return sendJson(response, 200, { conversation });
    }

    if (request.method === "POST" && url.pathname === "/api/expert") {
      const user = requireUser(request);
      const body = await readJson(request);
      const signal = createClientAbortSignal(request, response);
      const conversation = body.conversationId
        ? store.getConversation(user.id, body.conversationId)
        : null;
      const search = await maybeSearchWeb(body.question, body.webSearchEnabled, signal);
      const result = await runExpertMode({
        question: body.question,
        expertEnabled: body.expertEnabled !== false,
        expertCount: body.expertCount,
        history: conversation?.messages || [],
        webSearchResults: search.results,
        webSearchError: search.error,
        signal,
        llm,
        models: { primary: config.primaryModel, fast: config.fastModel }
      });
      const saved = store.appendTurn({
        userId: user.id,
        conversationId: body.conversationId,
        mode: "expert",
        question: body.question,
        assistantContent: result.final,
        trace: result,
        settings: {
          expertEnabled: body.expertEnabled !== false,
          expertCount: body.expertCount,
          webSearchEnabled: body.webSearchEnabled === true
        }
      });
      return sendJson(response, 200, { result, conversation: saved });
    }

    if (request.method === "POST" && url.pathname === "/api/debate") {
      const user = requireUser(request);
      const body = await readJson(request);
      const signal = createClientAbortSignal(request, response);
      const conversation = body.conversationId
        ? store.getConversation(user.id, body.conversationId)
        : null;
      const search = await maybeSearchWeb(body.question, body.webSearchEnabled, signal);
      const result = await runDebateMode({
        question: body.question,
        debateEnabled: body.debateEnabled !== false,
        participantModels: body.participantModels || config.debateModelIds,
        rounds: body.rounds,
        history: conversation?.messages || [],
        webSearchResults: search.results,
        webSearchError: search.error,
        signal,
        llm,
        models: { primary: config.primaryModel, fast: config.fastModel }
      });
      const saved = store.appendTurn({
        userId: user.id,
        conversationId: body.conversationId,
        mode: "debate",
        question: body.question,
        assistantContent: result.final,
        trace: result,
        settings: {
          debateEnabled: body.debateEnabled !== false,
          participantModels: result.participants?.map((participant) => participant.model) || [],
          rounds: body.rounds,
          webSearchEnabled: body.webSearchEnabled === true
        }
      });
      return sendJson(response, 200, { result, conversation: saved });
    }

    if (request.method === "GET" || request.method === "HEAD") {
      return serveStatic(url.pathname, response, request.method === "HEAD");
    }

    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    const status = error.status || (error instanceof LlmError ? 502 : 400);
    sendJson(response, status, {
      error: error.message || "Request failed.",
      details: error instanceof LlmError ? error.details : undefined
    });
  }
});

server.on("error", (error) => {
  console.error(`Server failed to start: ${error.message}`);
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  console.log(`ChatBuddy is running at http://${config.host}:${config.port}`);
});

function serveStatic(pathname, response, headOnly = false) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const fullPath = join(publicDir, safePath);

  if (!fullPath.startsWith(publicDir) || !existsSync(fullPath)) {
    return sendJson(response, 404, { error: "Not found." });
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(fullPath)] || "application/octet-stream"
  });
  if (headOnly) {
    response.end();
    return;
  }
  createReadStream(fullPath).pipe(response);
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 150000) {
      throw new Error("Request body too large.");
    }
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("Invalid JSON request body.");
  }
}

function getCurrentUser(request) {
  return store.getUserBySession(getSessionToken(request));
}

function requireUser(request) {
  const user = getCurrentUser(request);
  if (!user) {
    const error = new Error("请先登录。");
    error.status = 401;
    throw error;
  }
  return user;
}

function getSessionToken(request) {
  const cookie = request.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)aa_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function setSessionCookie(response, token) {
  response.setHeader(
    "Set-Cookie",
    `aa_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
  );
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", "aa_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function createClientAbortSignal(request, response) {
  const controller = new AbortController();
  request.on("aborted", () => {
    controller.abort();
  });
  response.on("close", () => {
    if (!response.writableEnded) {
      controller.abort();
    }
  });
  return controller.signal;
}

async function maybeSearchWeb(question, enabled, signal) {
  if (enabled !== true) {
    return { results: [], error: "" };
  }

  try {
    return {
      results: await searchWeb(question, { signal }),
      error: ""
    };
  } catch (error) {
    return {
      results: [],
      error: error.message || "联网搜索失败。"
    };
  }
}
