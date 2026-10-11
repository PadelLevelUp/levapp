/**
 * PAD-616 (messaging.sse-realtime rule 19): the open web thread folds its re-read newest page in on
 * `resync` — through the shared `mergeNewestPage`, reading the loaded thread from a ref (a state
 * updater may run later), and marking the thread read when someone else's message was missed.
 * Source-pinned like the sibling tests; `mergeNewestPage` itself is unit-tested in
 * `packages/hooks/src/conversationPaging.test.ts`, the screen in `e2e/messaging/pad616-sse-resync`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "MessagesPage.tsx"), "utf8");

describe("web MessagesPage answers resync (PAD-616)", () => {
  const block = src.slice(src.indexOf("if (data.type === RESYNC_EVENT) {"), src.indexOf('if (data.type === "message_created") {'));

  it("re-reads the open thread's newest page and merges it", () => {
    expect(block).toContain("getConversation(openId, { limit: CONVERSATION_FIRST_PAGE_SIZE })");
    expect(block).toContain("mergeNewestPage(loaded, newest)");
    expect(block).toContain("loadedConversationRef.current");
  });

  it("marks the thread read when another person's message was missed", () => {
    expect(block).toContain("await markConversationRead(openId)");
  });
});
