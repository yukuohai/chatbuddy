const DEFAULT_RESULT_LIMIT = 5;
const DEFAULT_TIMEOUT_MS = 12000;

export async function searchWeb(query, { signal, limit = DEFAULT_RESULT_LIMIT } = {}) {
  const normalized = String(query || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const linkedSignal = controller.signal;

  try {
    const results = await searchDuckDuckGoHtml(normalized, linkedSignal);
    return dedupeResults(results).slice(0, limit);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("联网搜索超时或已中断。");
    }
    throw new Error(`联网搜索失败：${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function searchDuckDuckGoHtml(query, signal) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ChatBuddy/0.1",
      Accept: "text/html,application/xhtml+xml"
    },
    signal
  });

  if (!response.ok) {
    throw new Error(`搜索服务返回 ${response.status}`);
  }

  const html = await response.text();
  return parseDuckDuckGoResults(html);
}

function parseDuckDuckGoResults(html) {
  const blocks = html.split(/<div class="result results_links[\s\S]*?">/g).slice(1);
  const results = [];

  for (const block of blocks) {
    const linkMatch = block.match(/<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;

    const snippetMatch = block.match(/<a class="result__snippet"[\s\S]*?>([\s\S]*?)<\/a>/);
    const href = decodeHtml(linkMatch[1]);
    const title = cleanHtml(linkMatch[2]);
    const snippet = snippetMatch ? cleanHtml(snippetMatch[1]) : "";
    const url = normalizeDuckDuckGoUrl(href);

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

function normalizeDuckDuckGoUrl(href) {
  try {
    const url = href.startsWith("//") ? `https:${href}` : href;
    const parsed = new URL(url);
    const target = parsed.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url;
  } catch {
    return href;
  }
}

function cleanHtml(value) {
  return decodeHtml(
    String(value || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function dedupeResults(results) {
  const seen = new Set();
  const deduped = [];
  for (const result of results) {
    const key = result.url.replace(/#.*$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}
