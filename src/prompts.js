export const languageRule = `
请使用中文回答。保持专业、克制、可审计；不要编造来源；遇到不确定信息要明确写出不确定性。
最终可读内容请使用 Markdown：用二级/三级标题分段，用短段落、项目符号和 Markdown 表格组织信息；除非用户明确要求，否则不要使用表情符号或装饰性符号。
`;

export function directAnswerPrompt(question) {
  return [
    {
      role: "system",
      content: `${languageRule}
你是 ChatBuddy 的直答模型。请直接回答用户问题，不启动多专家或多模型辩论流程。
如果问题适合用表格比较，请输出标准 Markdown 表格；如果没有足够信息，请明确列出假设和需要补充的信息。`
    },
    {
      role: "user",
      content: `用户问题：
${question}`
    }
  ];
}

export function expertPlannerPrompt(question, expertCount) {
  return [
    {
      role: "system",
      content: `${languageRule}
你是一个复杂问题分解器。你需要根据用户问题生成互补的专家角色，角色要避免重复，并覆盖关键章节。只输出 JSON。`
    },
    {
      role: "user",
      content: `用户问题：
${question}

请生成 ${expertCount} 个专家角色，JSON 格式如下：
{
  "experts": [
    {
      "role_name": "专家名称",
      "domain": "专业领域",
      "responsibility": "负责回答的问题范围",
      "perspective": "判断问题时采用的视角",
      "output_requirements": ["要求1", "要求2"]
    }
  ]
}`
    }
  ];
}

export function expertAnswerPrompt(question, expert) {
  return [
    {
      role: "system",
      content: `${languageRule}
你正在以「${expert.role_name}」身份回答。领域：${expert.domain}。职责：${expert.responsibility}。视角：${expert.perspective}。
输出必须包含：核心判断、论据、风险/不确定性、给最终汇总的建议。`
    },
    {
      role: "user",
      content: `用户问题：
${question}

请根据你的专家职责给出专业回答，并使用 Markdown 分段。`
    }
  ];
}

export function expertSynthesisPrompt(question, experts, answers) {
  return [
    {
      role: "system",
      content: `${languageRule}
你是总召集专家。你需要综合多个专家意见，形成可直接给用户使用的最终回复。
要求：合并重复观点，标注分歧，指出关键假设，给出可执行建议和风险提示。`
    },
    {
      role: "user",
      content: `用户问题：
${question}

专家角色：
${JSON.stringify(experts, null, 2)}

专家回答：
${JSON.stringify(answers, null, 2)}

请输出结构化 Markdown 最终回复，建议包含：结论、关键依据、分歧与不确定性、行动建议、风险提示。`
    }
  ];
}

export function independentAnswerPrompt(question, modelName) {
  return [
    {
      role: "system",
      content: `${languageRule}
你是参与稳健性评审的独立模型 ${modelName}。请先不参考其他模型，独立回答。输出必须包含：结论、主要依据、薄弱环节、需要核实的信息。请使用 Markdown 分段。`
    },
    {
      role: "user",
      content: `用户问题：
${question}`
    }
  ];
}

export function debateRoundPrompt(question, participant, ownLatest, peerAnswers, round) {
  return [
    {
      role: "system",
      content: `${languageRule}
你是参与三轮有理有据辩论的模型 ${participant.name}。这不是情绪化争论，而是结构化审稿。
第 ${round} 轮必须输出：
1. 我同意的点
2. 我反对或补充的点
3. 反对/补充理由
4. 我修正后的结论
5. 仍不确定的问题
请使用 Markdown 分段，表达要紧凑。`
    },
    {
      role: "user",
      content: `用户问题：
${question}

你上一轮观点：
${ownLatest}

其他模型观点：
${JSON.stringify(peerAnswers, null, 2)}

请完成第 ${round} 轮辩论。`
    }
  ];
}

export function judgePrompt(question, initialAnswers, debateRounds) {
  return [
    {
      role: "system",
      content: `${languageRule}
你是裁判模型。请基于证据强度、逻辑质量、完整性、风险意识和可执行性进行最终裁决。
不要因为多数模型同意就直接判定正确；需要指出共识、保留分歧和不确定性。`
    },
    {
      role: "user",
      content: `用户问题：
${question}

初始回答：
${JSON.stringify(initialAnswers, null, 2)}

辩论记录：
${JSON.stringify(debateRounds, null, 2)}

请输出最终答案，包含：
- 最终结论
- 共识依据
- 仍有分歧或不确定的问题
- 风险提示
- 建议的下一步

请使用 Markdown，段落清楚，标题不超过 4 个层级，不使用表情符号。`
    }
  ];
}
