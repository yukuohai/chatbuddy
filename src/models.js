export const TEXT_MODEL_OPTIONS = [
  {
    id: "qwen-flash",
    family: "Qwen",
    label: "Qwen Flash",
    model: "qwen-flash",
    note: "千问速度优先文本模型"
  },
  {
    id: "Moonshot-Kimi-K2-Instruct",
    family: "Kimi",
    label: "Kimi K2 Instruct",
    model: "Moonshot-Kimi-K2-Instruct",
    note: "Kimi 非思考文本模型"
  },
  {
    id: "deepseek-v3",
    family: "DeepSeek",
    label: "DeepSeek V3",
    model: "deepseek-v3",
    note: "DeepSeek 非 R1 文本模型"
  },
  {
    id: "MiniMax-M2.5",
    family: "MiniMax",
    label: "MiniMax M2.5",
    model: "MiniMax-M2.5",
    note: "MiniMax 文本与长上下文模型"
  },
  {
    id: "glm-4.6",
    family: "GLM",
    label: "GLM 4.6",
    model: "glm-4.6",
    note: "GLM 轻量文本选择"
  }
];

export const DEFAULT_DEBATE_MODEL_IDS = TEXT_MODEL_OPTIONS.slice(0, 3).map((option) => option.id);

export function resolveDebateModels(selectedIds = DEFAULT_DEBATE_MODEL_IDS) {
  const byId = new Map(TEXT_MODEL_OPTIONS.map((option) => [option.id, option]));
  const uniqueIds = [];

  for (const id of selectedIds) {
    if (!byId.has(id)) continue;
    if (!uniqueIds.includes(id)) {
      uniqueIds.push(id);
    }
  }

  const usableIds = uniqueIds.length >= 2 ? uniqueIds : DEFAULT_DEBATE_MODEL_IDS;
  return usableIds.slice(0, 5).map((id) => byId.get(id));
}
