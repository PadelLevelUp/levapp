/**
 * PAD-768 (messaging.conversation-detail rule 17): back from a thread goes up to Mensagens. The
 * fix is the shape of the root stack under a thread, so every way into a thread must go through
 * `openConversation`; the wiring guard below fails on a stray `router.push("/conversation/…")`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  MESSAGES_TAB,
  isConversationTarget,
  openConversation,
  pushRoute,
  upFromConversation,
} from "./open-conversation";

function fakeRouter() {
  const calls: [string, unknown][] = [];
  return {
    calls,
    router: {
      dismissTo: vi.fn((href: unknown) => calls.push(["dismissTo", href])),
      push: vi.fn((href: unknown) => calls.push(["push", href])),
    },
  };
}

describe("a thread opens on top of Mensagens", () => {
  it("pops the root stack to the Mensagens tab, then pushes the thread", () => {
    const { calls, router } = fakeRouter();
    openConversation(router, "/conversation/42?message=7");
    expect(calls).toEqual([
      ["dismissTo", MESSAGES_TAB],
      ["push", "/conversation/42?message=7"],
    ]);
  });

  it("a destination decided at run time: a thread through openConversation, anything else pushed", () => {
    const thread = fakeRouter();
    pushRoute(thread.router, { pathname: "/conversation/[id]", params: { id: "9" } });
    expect(thread.calls.map(([call]) => call)).toEqual(["dismissTo", "push"]);

    const other = fakeRouter();
    pushRoute(other.router, { pathname: "/class/[id]", params: { id: "3" } });
    pushRoute(other.router, "/(tabs)/messages");
    expect(other.calls).toEqual([
      ["push", { pathname: "/class/[id]", params: { id: "3" } }],
      ["push", "/(tabs)/messages"],
    ]);
  });

  it("the new-conversation picker is not a thread", () => {
    expect(isConversationTarget("/conversation/new")).toBe(false);
    expect(isConversationTarget("/conversation/12")).toBe(true);
    expect(isConversationTarget("/conversation/12?message=4")).toBe(true);
  });

  it("the header arrow goes up to Mensagens, never back in history", () => {
    const { calls, router } = fakeRouter();
    upFromConversation(router);
    expect(calls).toEqual([["dismissTo", MESSAGES_TAB]]);
  });
});

const root = join(__dirname, "..", "..", "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** A push or navigate whose target is a thread, written inline (a string or a `/conversation/[id]` pathname). */
const STRAY = /router\.(push|navigate)\(\s*(?:[`"']\/conversation\/(?!new\b)|\{\s*pathname:\s*["']\/conversation\/\[id\]["'])/;

describe("wiring: every way into a thread goes through openConversation", () => {
  const files = [...sources(join(root, "app")), ...sources(join(root, "src"))];

  it("scans the app (R-032: the check finds its subject)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(join("app", "(tabs)", "messages.tsx")))).toBe(true);
  });

  it("no screen pushes a thread directly", () => {
    const helper = join(root, "src", "features", "messages", "open-conversation.ts");
    const stray = files
      .filter((f) => f !== helper && STRAY.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f));
    expect(stray).toEqual([]);
  });

  it("the guard itself catches the shapes it exists for", () => {
    expect(STRAY.test("router.push(`/conversation/${id}`)")).toBe(true);
    expect(STRAY.test('router.push("/conversation/12")')).toBe(true);
    expect(STRAY.test('router.navigate({ pathname: "/conversation/[id]", params })')).toBe(true);
    expect(STRAY.test('router.push("/conversation/new")')).toBe(false);
  });

  it("the run-time routers (push taps, dashboard links) and the header arrow use the helper", () => {
    const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
    expect(read("src", "components", "PushTapRouter.tsx")).toMatch(/pushRoute\(router, target/);
    expect(read("src", "features", "dashboard", "blocks.tsx")).toMatch(/pushRoute\(router,/);
    const thread = read("app", "conversation", "[id].tsx");
    expect(thread).toMatch(/onPress=\{\(\) => upFromConversation\(router\)\}/);
    expect(thread).not.toMatch(/router\.back\(\)/);
  });
});
