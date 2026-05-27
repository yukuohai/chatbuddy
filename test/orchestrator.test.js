import test from "node:test";
import assert from "node:assert/strict";
import { runDebateMode, runExpertMode } from "../src/orchestrator.js";

const models = { primary: "qwen-plus", fast: "qwen-flash" };

test("expert mode plans experts, collects answers, and synthesizes", async () => {
  const calls = [];
  const llm = {
    async chat(request) {
      calls.push(request);
      if (request.responseFormat) {
        return {
          model: request.model,
          content: JSON.stringify({
            experts: [
              {
                role_name: "生信分析专家",
                domain: "生物信息",
                responsibility: "评估分析流程",
                perspective: "可重复性",
                output_requirements: ["给出风险"]
              },
              {
                role_name: "统计专家",
                domain: "统计学",
                responsibility: "评估统计假设",
                perspective: "偏倚控制",
                output_requirements: ["给出假设"]
              }
            ]
          }),
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
        };
      }
      return {
        model: request.model,
        content: calls.length >= 4 ? "汇总答案" : "专家答案",
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
      };
    }
  };

  const result = await runExpertMode({
    question: "如何评估 RNA-seq 差异分析方案？",
    expertCount: 2,
    llm,
    models
  });

  assert.equal(result.mode, "expert");
  assert.equal(result.experts.length, 2);
  assert.equal(result.answers.length, 2);
  assert.equal(result.final, "汇总答案");
  assert.equal(calls.length, 4);
});

test("debate mode runs initial answers, rounds, and judge", async () => {
  const calls = [];
  const llm = {
    async chat(request) {
      calls.push(request);
      return {
        model: request.model,
        content: calls.length === 9 ? "裁判答案" : `回答 ${calls.length}`,
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      };
    }
  };

  const result = await runDebateMode({
    question: "这个课题设计是否稳健？",
    participantModels: ["qwen-flash", "deepseek-v3"],
    rounds: 3,
    llm,
    models
  });

  assert.equal(result.mode, "debate");
  assert.equal(result.participants.length, 2);
  assert.equal(result.initialAnswers.length, 2);
  assert.equal(result.debateRounds.length, 3);
  assert.equal(result.final, "裁判答案");
  assert.equal(calls.length, 9);
});

test("expert mode can bypass multi-expert orchestration", async () => {
  const calls = [];
  const llm = {
    async chat(request) {
      calls.push(request);
      return {
        model: request.model,
        content: "直出答案",
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      };
    }
  };

  const result = await runExpertMode({
    question: "请直接回答",
    expertEnabled: false,
    llm,
    models
  });

  assert.equal(result.mode, "expert");
  assert.equal(result.strategy, "direct");
  assert.equal(result.final, "直出答案");
  assert.equal(calls.length, 1);
});

test("expert mode passes uploaded attachment text into model context", async () => {
  const calls = [];
  const llm = {
    async chat(request) {
      calls.push(request);
      return {
        model: request.model,
        content: "附件答案",
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      };
    }
  };

  await runExpertMode({
    question: "请分析附件",
    attachments: [
      {
        name: "notes.md",
        type: "text/markdown",
        size: 12,
        content: "关键事实：A 优于 B",
        kind: "text"
      }
    ],
    expertEnabled: false,
    llm,
    models
  });

  const userPrompt = calls[0].messages.find((message) => message.role === "user").content;
  assert.match(userPrompt, /notes\.md/);
  assert.match(userPrompt, /关键事实：A 优于 B/);
});

test("debate mode can bypass debate orchestration", async () => {
  const calls = [];
  const llm = {
    async chat(request) {
      calls.push(request);
      return {
        model: request.model,
        content: "抗辩关闭后的直出答案",
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      };
    }
  };

  const result = await runDebateMode({
    question: "请直接回答",
    debateEnabled: false,
    llm,
    models
  });

  assert.equal(result.mode, "debate");
  assert.equal(result.strategy, "direct");
  assert.equal(result.final, "抗辩关闭后的直出答案");
  assert.equal(calls.length, 1);
});
