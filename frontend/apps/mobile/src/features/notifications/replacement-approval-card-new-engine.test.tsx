/**
 * PAD-920 (notifications.semi-auto-approval N5) on iOS: the card for a new-engine request, on the
 * shared engine-approval-display helpers web's card uses. One block per spot type (side, level and
 * its open spots) with rule 7a's preview, a remove toggle per student, "Sim" with the removed ids
 * and "Ignorar" on the class's card, "Sim" alone in the conversation, no "at the window" button,
 * and a message no longer pending reads its `state`. `t` here reads the real pt locale files, so the
 * words checked are the ones the coach reads, and a key missing from them fails the test.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactTestInstance } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EngineApprovalMeta, EngineApprovalState } from "@levelup/types";
import { renderNative } from "@/test/render-native";

const LOCALES = resolve(__dirname, "../../../../../src/locales/pt");
const PT: Record<string, unknown> = Object.assign(
  {},
  ...["notificationsUi", "tutorials", "players", "calendar", "common"].map((ns) =>
    JSON.parse(readFileSync(resolve(LOCALES, `${ns}.json`), "utf8"))
  )
);

const lookup = (key: string): unknown =>
  key.split(".").reduce<unknown>((n, p) => (n && typeof n === "object" ? (n as Record<string, unknown>)[p] : undefined), PT);

const fill = (raw: string, params?: Record<string, unknown>) =>
  raw.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ""));

// The keys `t` was asked for that pt does not have; the test fails on any.
const missing: string[] = [];

// i18next's plural lookup for pt: `_zero` when the count is 0 and the key has one, then the plural rule.
function ptT(key: string, params?: Record<string, unknown>): string {
  let raw = lookup(key);
  const count = params?.count;
  if (typeof raw !== "string" && typeof count === "number") {
    raw = (count === 0 ? lookup(`${key}_zero`) : undefined) ?? lookup(`${key}_${new Intl.PluralRules("pt").select(count)}`);
  }
  if (typeof raw !== "string") {
    missing.push(key);
    return key;
  }
  return fill(raw, params);
}

/** A pt string straight from the file, for the expectations. */
const pt = (key: string, params?: Record<string, unknown>) => {
  const raw = lookup(key);
  if (typeof raw !== "string") throw new Error(`pt has no ${key}`);
  return fill(raw, params);
};

const respondToEngineApproval = vi.fn();
const respondToApproval = vi.fn();

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: ptT, i18n: { language: "pt" } }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/date-locale", () => ({ useDateLocale: () => undefined }));
vi.mock("@levelup/api", () => ({
  notificationEngineApi: {
    respondToEngineApproval: (...a: unknown[]) => respondToEngineApproval(...a),
    respondToApproval: (...a: unknown[]) => respondToApproval(...a),
  },
}));
vi.mock("@levelup/api/src/resources/players", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getCoachPlayers: async () => [],
}));

import { ReplacementApprovalCard } from "./replacement-approval-card";

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  respondToEngineApproval.mockReset();
  respondToApproval.mockReset();
  missing.length = 0;
});

const leftQueue = Array.from({ length: 7 }, (_, i) => ({
  playerId: String(i + 1),
  name: `Aluno ${i + 1}`,
  tier: 1,
  rank: i + 1,
}));

const classState = (requestId: number): EngineApprovalState => ({
  engine: "new",
  state: "pending",
  semiAutomatic: true,
  approved: [],
  removed: [],
  request: {
    requestId,
    lessonInstanceId: 40,
    spotTypes: [
      { side: "left", levelId: 3, levelLabel: "Nível 3", count: 1, queue: leftQueue },
      {
        side: null,
        levelId: null,
        levelLabel: null,
        count: 2,
        queue: [],
        emptyQueueReasons: [
          { stage: "failed_eligibility", count: 4 },
          { stage: "said_no", count: 2 },
          { stage: "busy_same_time", count: 0 },
        ],
      },
    ],
  },
});

const message = (requestId: number, over: Partial<EngineApprovalMeta> = {}): EngineApprovalMeta => ({
  engine: "new",
  requestId,
  lessonInstanceId: 40,
  responded: false,
  state: "pending",
  spotTypes: classState(requestId).request!.spotTypes.map(({ side, levelId, levelLabel, count, queue }) => ({
    side,
    levelId,
    levelLabel,
    count,
    queue,
  })),
  ...over,
});

const wrap = (el: React.ReactElement) => <QueryClientProvider client={client}>{el}</QueryClientProvider>;
const text = (node: ReactTestInstance): string =>
  node.children.map((c) => (typeof c === "string" ? c : text(c))).join("");
const hosts = (n: { root: { root: ReactTestInstance } }, pred: (id: string) => boolean) =>
  n.root.root.findAll((x) => typeof x.type === "string" && typeof x.props.testID === "string" && pred(x.props.testID));

describe("the iOS card for a new-engine request (semi-auto-approval N5)", () => {
  it("[NOTIFICATIONS-SEMI-AUTO-APPROVAL-42] approves with removals, dismisses and reads a stale answer", async () => {
    // The class's card: two blocks, the left one truncated, the either one saying why it is empty.
    const onResult = vi.fn();
    const card = await renderNative(wrap(<ReplacementApprovalCard bundle={classState(11)} allowDismiss onResult={onResult} />));
    expect(hosts(card, (id) => id.startsWith("approval-type-") && id !== "approval-type-header").map((x) => x.props.testID)).toEqual([
      "approval-type-left",
      "approval-type-either",
    ]);
    // N5: each header is side and level, then the type's open spots from `count`.
    const headers = hosts(card, (id) => id === "approval-type-header").map(text);
    expect(headers).toEqual([
      `${pt("players.sideLeft")} · Nível 3 · ${pt("tutorials.engine.openSpots_one", { count: 1 })}`,
      `${pt("tutorials.engine.sideEither")} · ${pt("tutorials.engine.openSpots_other", { count: 2 })}`,
    ]);
    for (const id of ["1", "2", "3", "4", "5"]) {
      expect(card.queryByTestId(`approval-name-${id}`)).not.toBeNull();
      expect(card.queryByTestId(`approval-remove-${id}`)).not.toBeNull();
    }
    expect(card.queryByTestId("approval-remove-6")).toBeNull();
    expect(text(card.byTestId("approval-show-more"))).toBe(pt("notificationsUi.replacementApproval.showMore", { count: 2 }));
    expect(text(card.byTestId("approval-showing-of"))).toBe(
      pt("notificationsUi.replacementApproval.showingOf", { shown: 5, total: 7 })
    );
    // N6's words for each stage with its count; a zero count is dropped.
    expect(text(card.byTestId("approval-empty-reason-failed_eligibility"))).toBe(
      pt("notificationsUi.replacementApproval.engine.reasonCount", { reason: pt("tutorials.engine.stage.failed_eligibility"), count: 4 })
    );
    expect(card.queryByTestId("approval-empty-reason-said_no")).not.toBeNull();
    expect(card.queryByTestId("approval-empty-reason-busy_same_time")).toBeNull();
    expect(card.queryByTestId("approve-invitations-at-window")).toBeNull();
    expect(text(card.byTestId("approval-yes"))).toBe(pt("notificationsUi.replacementApproval.engine.yes"));
    expect(card.queryByTestId("approval-dismiss")).not.toBeNull();
    expect(card.byTestId("approval-remove-2").props.accessibilityLabel).toBe(
      pt("notificationsUi.replacementApproval.engine.remove", { name: "Aluno 2" })
    );

    // "Ver mais (2)" reveals the rest, each with its own toggle.
    await card.press("approval-show-more");
    expect(card.queryByTestId("approval-remove-7")).not.toBeNull();

    // Remove two students (one toggled back and forth), then "Sim (2 retirados)".
    await card.press("approval-remove-2");
    await card.press("approval-remove-7");
    await card.press("approval-remove-4");
    await card.press("approval-remove-4");
    expect(card.byTestId("approval-name-2").props.className).toContain("line-through");
    expect(card.byTestId("approval-name-4").props.className).not.toContain("line-through");
    expect(card.byTestId("approval-remove-2").props.accessibilityLabel).toBe(
      pt("notificationsUi.replacementApproval.engine.restore", { name: "Aluno 2" })
    );
    expect(card.byTestId("approval-remove-4").props.accessibilityLabel).toBe(
      pt("notificationsUi.replacementApproval.engine.remove", { name: "Aluno 4" })
    );
    expect(text(card.byTestId("approval-yes"))).toBe(pt("notificationsUi.replacementApproval.engine.yesRemoved_other", { count: 2 }));

    respondToEngineApproval.mockResolvedValueOnce({ engine: "new", requestId: 11, result: "approved", state: "none" });
    await card.press("approval-yes");
    await card.flush();
    expect(respondToEngineApproval).toHaveBeenCalledWith({ bundleId: 11, action: "yes_now", removed: ["2", "7"] });
    expect(respondToApproval).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith("yes_now");
    expect(text(card.byTestId("approval-outcome"))).toBe(pt("notificationsUi.replacementApproval.approved"));
    expect(card.queryByTestId("approval-yes")).toBeNull();

    // Another class card: "Ignorar" sends dismiss and reads "Ignorado".
    const other = await renderNative(wrap(<ReplacementApprovalCard bundle={classState(12)} allowDismiss />));
    respondToEngineApproval.mockResolvedValueOnce({ engine: "new", requestId: 12, result: "dismissed", state: "dismissed" });
    await other.press("approval-dismiss");
    await other.flush();
    expect(respondToEngineApproval).toHaveBeenLastCalledWith({ bundleId: 12, action: "dismiss" });
    expect(text(other.byTestId("approval-outcome"))).toBe(pt("notificationsUi.replacementApproval.engine.dismissed"));
    expect(other.queryByTestId("approval-dismiss")).toBeNull();

    // A third card's answer comes back stale: the replaced line and no buttons; no result is reported.
    const staleResult = vi.fn();
    const third = await renderNative(wrap(<ReplacementApprovalCard bundle={classState(13)} allowDismiss onResult={staleResult} />));
    respondToEngineApproval.mockResolvedValueOnce({ engine: "new", requestId: 13, result: "stale" });
    await third.press("approval-yes");
    await third.flush();
    expect(text(third.byTestId("approval-replaced"))).toBe(pt("notificationsUi.replacementApproval.engine.replaced"));
    expect(third.queryByTestId("approval-yes")).toBeNull();
    expect(third.queryByTestId("approval-dismiss")).toBeNull();
    expect(third.queryByTestId("approval-remove-1")).toBeNull();
    expect(staleResult).not.toHaveBeenCalled();

    // The conversation's card, from the message's metadata (N4): "Sim" only, no window button.
    const convo = await renderNative(wrap(<ReplacementApprovalCard bundle={message(14)} queueAsOf={null} />));
    expect(text(convo.byTestId("approval-yes"))).toBe(pt("notificationsUi.replacementApproval.engine.yes"));
    expect(convo.queryByTestId("approval-dismiss")).toBeNull();
    expect(convo.queryByTestId("approve-invitations-at-window")).toBeNull();
    expect(hosts(convo, (id) => id === "approval-type-header").map(text)[0]).toContain(
      pt("tutorials.engine.openSpots_one", { count: 1 })
    );
    // An older message without `state` and not responded is still pending.
    const older = await renderNative(wrap(<ReplacementApprovalCard bundle={message(15, { state: undefined })} />));
    expect(older.queryByTestId("approval-yes")).not.toBeNull();

    // A message no longer pending reads its `state` (N4), with no buttons and no toggles.
    const noButtons = (n: Awaited<ReturnType<typeof renderNative>>) => {
      expect(n.queryByTestId("approval-yes")).toBeNull();
      expect(n.queryByTestId("approval-dismiss")).toBeNull();
      expect(n.queryByTestId("approval-remove-1")).toBeNull();
    };
    const replaced = await renderNative(wrap(<ReplacementApprovalCard bundle={message(16, { state: "replaced", responded: true })} />));
    expect(text(replaced.byTestId("approval-replaced"))).toBe(pt("notificationsUi.replacementApproval.engine.replaced"));
    noButtons(replaced);
    const approved = await renderNative(wrap(<ReplacementApprovalCard bundle={message(17, { state: "approved", responded: true })} />));
    expect(text(approved.byTestId("approval-outcome"))).toBe(pt("notificationsUi.replacementApproval.approved"));
    expect(approved.queryByTestId("approval-replaced")).toBeNull();
    noButtons(approved);
    const dismissed = await renderNative(wrap(<ReplacementApprovalCard bundle={message(18, { state: "dismissed", responded: true })} />));
    expect(text(dismissed.byTestId("approval-outcome"))).toBe(pt("notificationsUi.replacementApproval.engine.dismissed"));
    noButtons(dismissed);
    // `responded: true` with no `state` (an older payload) reads as replaced.
    const legacy = await renderNative(wrap(<ReplacementApprovalCard bundle={message(19, { state: undefined, responded: true })} />));
    expect(text(legacy.byTestId("approval-replaced"))).toBe(pt("notificationsUi.replacementApproval.engine.replaced"));
    noButtons(legacy);

    // Every word the card asked for is in the pt locale.
    expect(missing).toEqual([]);
  });
});
