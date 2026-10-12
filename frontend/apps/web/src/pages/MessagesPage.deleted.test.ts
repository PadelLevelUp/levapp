/**
 * messaging.messages rule 3 / conversations rule 12a (PAD-639, B-547), as static checks on the
 * page the unit harness does not mount: the user's own delete and a `message_deleted` event both
 * drop the content from the cache through the shared `eraseDeletedMessage`, and both refetch the
 * list so a deleted last message stops previewing its text.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(__dirname, "MessagesPage.tsx"), "utf8");

function between(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(to, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("web delete leaves no content behind (PAD-639)", () => {
  it("the message_deleted handler erases the cached message and refetches the list", () => {
    const handler = between(page, 'data.type === "message_deleted"', "if (data.type ===");
    expect(handler).toMatch(/eraseDeletedMessage\(m\)/);
    expect(handler).not.toMatch(/isDeleted:\s*true/);
    expect(handler).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\["conversations"\]/);
  });

  it("the user's own delete erases the cached message and refetches the list", () => {
    const handler = between(page, "const handleDeleteMessage", "};\n");
    expect(handler).toMatch(/eraseDeletedMessage\(m\)/);
    expect(handler).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\["conversations"\]/);
  });
});
