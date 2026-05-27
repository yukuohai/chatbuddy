import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILES = [".env", ".env.local"];

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const index = trimmed.indexOf("=");
  if (index === -1) return null;
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

export function loadLocalEnv(cwd = process.cwd()) {
  for (const file of ENV_FILES) {
    const fullPath = resolve(cwd, file);
    if (!existsSync(fullPath)) continue;
    const lines = readFileSync(fullPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

export function getConfig() {
  loadLocalEnv();
  const baseUrl =
    process.env.ALIYUN_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1";

  return {
    port: Number(process.env.PORT || 4173),
    host: process.env.HOST || "127.0.0.1",
    apiKey: process.env.ALIYUN_API_KEY || "",
    baseUrl: baseUrl.replace(/\/$/, ""),
    primaryModel: process.env.ALIYUN_MODEL_PRIMARY || "qwen-plus",
    fastModel: process.env.ALIYUN_MODEL_FAST || "qwen-flash",
    debateModelIds: String(
      process.env.DEBATE_MODEL_IDS ||
        "qwen-flash,Moonshot-Kimi-K2-Instruct,deepseek-v3"
    )
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    requestTimeoutMs: Number(process.env.LLM_TIMEOUT_MS || 120000)
  };
}
