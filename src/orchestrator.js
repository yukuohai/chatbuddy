import {
  debateRoundPrompt,
  directAnswerPrompt,
  expertAnswerPrompt,
  expertPlannerPrompt,
  expertSynthesisPrompt,
  independentAnswerPrompt,
  judgePrompt
} from "./prompts.js";
import { ensureArray, extractJson } from "./json.js";
import { DEFAULT_DEBATE_MODEL_IDS, resolveDebateModels } from "./models.js";

const DEFAULT_EXPERT_COUNT = 4;
const DEFAULT_DEBATE_ROUNDS = 3;

export function normalizeQuestion(question) {
  const normalized = String(question || "").trim();
  if (normalized.length < 2) {
    throw new Error("请输入一个更完整的问题。");
  }
  if (normalized.length > 12000) {
    throw new Error("问题过长，请先压缩到 12000 字以内。");
  }
  return normalized;
}

export async function runExpertMode({
  question,
  expertEnabled = true,
  expertCount = DEFAULT_EXPERT_COUNT,
  history = [],
  webSearchResults = [],
  webSearchError = "",
  signal,
  llm,
  models
}) {
  const normalized = normalizeQuestion(question);
  const modelQuestion = withSearchContext(
    withHistoryContext(normalized, history),
    webSearchResults,
    webSearchError
  );

  if (!expertEnabled) {
    return runDirectAnswer({
      mode: "expert",
      question: normalized,
      modelQuestion,
      llm,
      model: models.primary,
      webSearchResults,
      webSearchError,
      signal
    });
  }

  const count = clampNumber(expertCount, 2, 6, DEFAULT_EXPERT_COUNT);
  const planner = await llm.chat({
    model: models.fast,
    temperature: 0.2,
    responseFormat: { type: "json_object" },
    signal,
    messages: expertPlannerPrompt(modelQuestion, count)
  });

  const parsed = extractJson(planner.content);
  const experts = ensureArray(parsed.experts)
    .slice(0, count)
    .map((expert, index) => normalizeExpert(expert, index));

  if (experts.length < 2) {
    throw new Error("专家角色生成不足，请稍后重试。");
  }

  const answers = await Promise.all(
    experts.map(async (expert) => {
      const response = await llm.chat({
        model: models.primary,
        temperature: 0.35,
        signal,
        messages: expertAnswerPrompt(modelQuestion, expert)
      });
      return {
        role_name: expert.role_name,
        domain: expert.domain,
        content: response.content,
        model: response.model,
        usage: response.usage
      };
    })
  );

  const synthesis = await llm.chat({
    model: models.primary,
    temperature: 0.25,
    signal,
    messages: expertSynthesisPrompt(modelQuestion, experts, answers)
  });

  return {
    mode: "expert",
    question: normalized,
    experts,
    answers,
    final: synthesis.content,
    webSearchResults,
    webSearchError,
    usage: collectUsage([planner, ...answers, synthesis])
  };
}

export async function runDebateMode({
  question,
  debateEnabled = true,
  participantModels = DEFAULT_DEBATE_MODEL_IDS,
  rounds = DEFAULT_DEBATE_ROUNDS,
  history = [],
  webSearchResults = [],
  webSearchError = "",
  signal,
  llm,
  models
}) {
  const normalized = normalizeQuestion(question);
  const modelQuestion = withSearchContext(
    withHistoryContext(normalized, history),
    webSearchResults,
    webSearchError
  );

  if (!debateEnabled) {
    return runDirectAnswer({
      mode: "debate",
      question: normalized,
      modelQuestion,
      llm,
      model: models.primary,
      webSearchResults,
      webSearchError,
      signal
    });
  }

  const roundCount = clampNumber(rounds, 1, 3, DEFAULT_DEBATE_ROUNDS);
  const participants = makeParticipants(participantModels);

  const initialAnswers = await Promise.all(
    participants.map(async (participant) => {
      const response = await llm.chat({
        model: participant.model,
        temperature: 0.35,
        signal,
        messages: independentAnswerPrompt(modelQuestion, participant.name)
      });
      return {
        participant: participant.name,
        model: response.model,
        content: response.content,
        usage: response.usage
      };
    })
  );

  let latest = new Map(initialAnswers.map((item) => [item.participant, item.content]));
  const debateRounds = [];
  const usageEntries = [...initialAnswers];

  for (let round = 1; round <= roundCount; round += 1) {
    const roundItems = await Promise.all(
      participants.map(async (participant) => {
        const peers = participants
          .filter((candidate) => candidate.name !== participant.name)
          .map((candidate) => ({
            participant: candidate.name,
            content: latest.get(candidate.name)
          }));

        const response = await llm.chat({
          model: participant.model,
          temperature: 0.3,
          signal,
          messages: debateRoundPrompt(
            modelQuestion,
            participant,
            latest.get(participant.name),
            peers,
            round
          )
        });
        return {
          round,
          participant: participant.name,
          model: response.model,
          content: response.content,
          usage: response.usage
        };
      })
    );

    for (const item of roundItems) {
      latest.set(item.participant, item.content);
      usageEntries.push(item);
    }
    debateRounds.push({ round, items: roundItems });
  }

  const judge = await llm.chat({
    model: models.primary,
    temperature: 0.2,
    signal,
    messages: judgePrompt(modelQuestion, initialAnswers, debateRounds)
  });

  return {
    mode: "debate",
    question: normalized,
    participants,
    initialAnswers,
    debateRounds,
    final: judge.content,
    webSearchResults,
    webSearchError,
    usage: collectUsage([...usageEntries, judge])
  };
}

async function runDirectAnswer({
  mode,
  question,
  modelQuestion,
  llm,
  model,
  webSearchResults = [],
  webSearchError = "",
  signal
}) {
  const response = await llm.chat({
    model,
    temperature: 0.35,
    signal,
    messages: directAnswerPrompt(modelQuestion)
  });

  return {
    mode,
    strategy: "direct",
    question,
    final: response.content,
    model: response.model,
    webSearchResults,
    webSearchError,
    usage: collectUsage([response])
  };
}

function normalizeExpert(expert, index) {
  return {
    role_name: cleanText(expert.role_name, `专家 ${index + 1}`),
    domain: cleanText(expert.domain, "综合分析"),
    responsibility: cleanText(expert.responsibility, "分析用户问题的一个关键方面"),
    perspective: cleanText(expert.perspective, "证据、逻辑和风险并重"),
    output_requirements: ensureArray(expert.output_requirements, ["给出专业判断和风险提示"])
      .map((item) => cleanText(item, "给出专业判断"))
      .slice(0, 5)
  };
}

function cleanText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function makeParticipants(participantModels) {
  return resolveDebateModels(participantModels).map((option, index) => ({
    name: `${option.family} 席位 ${index + 1}`,
    family: option.family,
    label: option.label,
    model: option.model,
    note: option.note
  }));
}

function withHistoryContext(question, history) {
  const usableHistory = ensureArray(history)
    .filter((message) => message && ["user", "assistant"].includes(message.role))
    .slice(-8);

  if (usableHistory.length === 0) {
    return question;
  }

  const context = usableHistory
    .map((message) => {
      const speaker = message.role === "user" ? "用户" : "助手";
      return `${speaker}：\n${String(message.content || "").slice(0, 3000)}`;
    })
    .join("\n\n---\n\n");

  return `以下是同一对话的近期上下文，供你保持连续性，不要机械复述：\n\n${context}\n\n本轮用户问题：\n${question}\n\n请优先回答本轮问题，并在必要时引用上下文。`;
}

function withSearchContext(question, results, error) {
  const searchResults = ensureArray(results).slice(0, 6);
  if (!searchResults.length && !error) {
    return question;
  }

  const searchText = searchResults.length
    ? searchResults
        .map(
          (item, index) =>
            `[${index + 1}] ${item.title}\nURL: ${item.url}\n摘要: ${item.snippet || "无摘要"}`
        )
        .join("\n\n")
    : `联网搜索没有返回可用结果。${error ? `错误：${error}` : ""}`;

  return `${question}

以下是本轮联网搜索结果。请只把它作为补充证据使用，优先判断来源可靠性；涉及最新事实时请引用对应编号或链接，不能从搜索摘要推出的内容要明确标注不确定。

${searchText}`;
}

function collectUsage(entries) {
  return entries
    .map((entry) => entry.usage)
    .filter(Boolean)
    .reduce(
      (total, usage) => ({
        prompt_tokens: total.prompt_tokens + Number(usage.prompt_tokens || 0),
        completion_tokens: total.completion_tokens + Number(usage.completion_tokens || 0),
        total_tokens: total.total_tokens + Number(usage.total_tokens || 0)
      }),
      { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    );
}
