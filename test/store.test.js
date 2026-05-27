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
