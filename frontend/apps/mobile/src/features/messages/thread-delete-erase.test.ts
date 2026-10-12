/**
 * messaging.messages rule 3 (PAD-639, B-547), iOS, as static checks on the thread screen the
 * mobile harness cannot mount: the user's own delete and a `message_deleted` event both drop the
 * content from the cache through the shared `eraseDeletedMessage`. The list refetch stays with
 * the tabs layout for events (PAD-592 rule 2) and with `invalidateMessagesLists` for the own delete.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const thread = readFileSync(join(__dirname, "..", "..", "..", "app", "conversation", "[id].tsx"), "utf8");

function between(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(to, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("iOS delete leaves no content behind (PAD-639)", () => {
  it("the message_deleted handler erases the cached message", () => {
    const handler = between(thread, 'evt.type === "message_deleted"', 'evt.type === "message_reaction"');
    expect(handler).toMatch(/eraseDeletedMessage\(m\)/);
    expect(handler).not.toMatch(/isDeleted:\s*true/);
  });

  it("the user's own delete erases the cached message and invalidates the lists", () => {
    const start = thread.indexOf("await messagesApi.deleteMessage(");
    expect(start).toBeGreaterThan(-1);
    const own = thread.slice(start, thread.indexOf("} catch", start));
    expect(own).toMatch(/eraseDeletedMessage\(m\)/);
    expect(own).toMatch(/invalidateMessagesLists\(queryClient\)/);
  });
});
