/**
 * PAD-616 (messaging.sse-realtime rule 19): the open iOS thread folds its re-read newest page into
 * its query-cache entry on `resync` — through the shared `mergeNewestPage`, never by invalidating
 * the entry (that would refetch one page and drop the older ones) — and marks it read and flags
 * "new below" when someone else's message was missed. Source-pinned, the mobile house pattern.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(HERE, "../../../app/conversation/[id].tsx"), "utf8");

describe("iOS thread answers resync (PAD-616)", () => {
  const block = src.slice(src.indexOf("if (evt.type === RESYNC_EVENT) {"), src.indexOf('if (evt.type === "message_created") {'));

  it("re-reads the newest page and merges it into the cached thread", () => {
    expect(block).toContain(".getConversation(conversationId, { limit: CONVERSATION_FIRST_PAGE_SIZE })");
    expect(block).toContain("updateConversationCache(queryClient, conversationId");
    expect(block).toContain("mergeNewestPage(c, newest)");
    expect(block).not.toContain("invalidateQueries");
  });

  it("reads and flags a missed message from someone else", () => {
    expect(block).toContain("messagesApi.markConversationRead(conversationId)");
    expect(block).toContain("setHasNewBelow(true)");
  });
});
