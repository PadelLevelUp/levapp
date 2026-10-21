/**
 * PAD-616 (messaging.sse-realtime rule 18): the web app-level realtime handler answers the hub's
 * `resync` with the shared branch, before any other event branch. No harness mounts AppLayout, so —
 * like the sibling source-reading tests — this pins the wiring; the behaviour is proven in
 * `packages/hooks/src/liveResync.integration.test.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "AppLayout.tsx"), "utf8");

describe("web AppLayout answers resync (PAD-616)", () => {
  it("runs the shared answerResync first in its subscribeAppEvents handler", () => {
    const handler = src.slice(src.indexOf("return subscribeAppEvents(token, (data) => {"));
    const resync = handler.indexOf("if (answerResync(data, queryClient)) return;");
    expect(resync).toBeGreaterThan(-1);
    expect(resync).toBeLessThan(handler.indexOf('data.type === "message_created"'));
  });
});
