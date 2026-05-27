import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStore } from "../src/store.js";

test("store isolates conversations by user", () => {
  const dir = mkdtempSync(join(tmpdir(), "chatbuddy-store-"));
  const store = createStore(join(dir, "store.json"));
  const alice = store.createUser("alice", "secret-1");
  const bob = store.createUser("bob", "secret-2");

  const saved = store.appendTurn({
    userId: alice.id,
    mode: "expert",
    question: "Alice question",
    assistantContent: "Alice answer",
    trace: { mode: "expert" },
    settings: {}
  });

  assert.equal(store.listConversations(alice.id, "expert").length, 1);
  assert.equal(store.listConversations(bob.id, "expert").length, 0);
  assert.equal(store.getConversation(bob.id, saved.id), null);
});

test("store keeps full title, short summary title, and attachment metadata", () => {
  const dir = mkdtempSync(join(tmpdir(), "chatbuddy-store-"));
  const store = createStore(join(dir, "store.json"));
  const user = store.createUser("charlie", "secret-3");
  const question = "请帮我评估这个非常长的实验设计方案，包括样本量、统计功效、批次效应和后续验证策略";

  const saved = store.appendTurn({
    userId: user.id,
    mode: "expert",
    question,
    attachments: [
      {
        name: "design.md",
        type: "text/markdown",
        size: 42,
        kind: "text",
        content: "样本量设计正文",
        truncated: false
      }
    ],
    assistantContent: "ok",
    trace: { mode: "expert" },
    settings: {}
  });

  assert.equal(saved.title, question);
  assert.equal(saved.summaryTitle, "实验设计方案评估");
  assert.equal(saved.messages[0].attachments[0].name, "design.md");

  const [summary] = store.listConversations(user.id, "expert");
  assert.equal(summary.title, question);
  assert.equal(summary.summaryTitle, saved.summaryTitle);
});
