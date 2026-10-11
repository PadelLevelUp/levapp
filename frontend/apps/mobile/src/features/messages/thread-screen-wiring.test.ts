/**
 * PAD-592 — mobile.interaction-performance rules 2 and 6, as static checks on screens the mobile
 * harness cannot mount (react-query against the app's React copy; precedent: class-courts.test.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const app = join(__dirname, "..", "..", "..", "app");
const thread = readFileSync(join(app, "conversation", "[id].tsx"), "utf8");
const tabs = readFileSync(join(app, "(tabs)", "_layout.tsx"), "utf8");
const classScreen = readFileSync(join(app, "class", "[id].tsx"), "utf8");
const calendarScreen = readFileSync(join(app, "(tabs)", "calendar.tsx"), "utf8");

/** A slice whose two markers were both found (R-032: a check proves it found its subject). */
function between(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(to, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("one list invalidation per incoming message (rule 2)", () => {
  it("the thread screen's message_created handler leaves the list refetch to the tabs layout", () => {
    const handler = between(thread, 'evt.type === "message_created"', 'evt.type === "message_edited"');
    expect(handler).not.toMatch(/invalidateMessagesLists\(/);
    expect(handler).not.toMatch(/invalidateQueries\(/);
  });

  it("the tabs layout is where the list and the unread count are invalidated", () => {
    expect(tabs).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\["conversations"\]/);
  });
});

describe("the composer owns the draft (rule 1)", () => {
  it("the draft state lives in a Composer component, not next to the list", () => {
    const composer = between(thread, "function Composer(", "export default function ConversationScreen");
    expect(composer).toMatch(/\[draft, setDraft\] = React\.useState/);
    const screen = thread.slice(thread.indexOf("export default function ConversationScreen"));
    expect(screen).not.toMatch(/\[draft, setDraft\]/);
  });
});

describe("a calendar range keeps the previous one on screen (rule 5)", () => {
  it("passes keepPreviousData to useCalendarEvents", () => {
    const call = between(calendarScreen, "useCalendarEvents(", "});");
    expect(call).toMatch(/placeholderData:\s*keepPreviousData/);
  });
});

describe("the courts query waits for the class's club (rule 6)", () => {
  it("is enabled only once the instance names a club", () => {
    expect(classScreen).toMatch(/enabled:\s*isCoach\s*&&\s*!!instance\?\.clubId/);
  });
});
