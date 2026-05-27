import { getConfig } from "./config.js";

export class LlmError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "LlmError";
    this.details = details;
  }
}

export function createBailianClient(config = getConfig()) {
  async function chat({ model, messages, temperature = 0.35, responseFormat, signal }) {
    if (!config.apiKey) {
      throw new LlmError("Missing ALIYUN_API_KEY. Add it to .env.local or the shell environment.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    const payload = {
      model: model || config.primaryModel,
      messages,
      temperature
    };

    if (responseFormat) {
      payload.response_format = responseFormat;
    }

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: signal || controller.signal
      });

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        throw new LlmError("Bailian API request failed.", {
          status: response.status,
          body: redactSecrets(data)
        });
      }

      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new LlmError("Bailian API response did not include message content.", {
          body: data
        });
      }

      return {
        content,
        model: data.model || payload.model,
        usage: data.usage || null
      };
    } catch (error) {
      if (error.name === "AbortError") {
        throw new LlmError("Bailian API request timed out.", {
          timeoutMs: config.requestTimeoutMs
        });
      }
      if (error instanceof LlmError) throw error;
      throw new LlmError(error.message || "Bailian API request failed.", { cause: error.name });
    } finally {
      clearTimeout(timeout);
    }
  }

  return { chat };
}

function redactSecrets(value) {
  const text = JSON.stringify(value);
  return JSON.parse(text.replace(/sk-[A-Za-z0-9_-]+/g, "sk-***"));
}
