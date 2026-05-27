export function extractJson(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Empty model response.");
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(candidate.slice(first, last + 1));
    }
    throw new Error("Model response was not valid JSON.");
  }
}

export function ensureArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}
