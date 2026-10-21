/**
 * PAD-616 (messaging.sse-realtime rule 18): the iOS tabs layout — the app-level realtime handler —
 * answers the hub's `resync` with the shared branch, before any other event branch. Source-pinned,
 * the mobile house pattern; behaviour in `packages/hooks/src/liveResync.integration.test.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(HERE, "../../../app/(tabs)/_layout.tsx"), "utf8");

describe("iOS tabs layout answers resync (PAD-616)", () => {
  it("runs the shared answerResync first in its useAppEvents handler", () => {
    const handler = src.slice(src.indexOf("useAppEvents("));
    const resync = handler.indexOf("if (answerResync(evt, queryClient)) return;");
    expect(resync).toBeGreaterThan(-1);
    expect(resync).toBeLessThan(handler.indexOf('evt.type.startsWith("message_")'));
  });
});
