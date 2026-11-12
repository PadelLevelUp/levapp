/**
 * PAD-920 (notifications.semi-auto-approval N5) on iOS: the card for a new-engine request. One
 * block per spot type with rule 7a's preview, a remove toggle per student, "Sim" with the removed
 * ids and "Ignorar" on the class's card, "Sim" alone in the conversation, no "at the window"
 * button, and the replaced line with no buttons for a `stale` answer or a responded message.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EngineApprovalState } from "@levelup/types";
import { renderNative } from "@/test/render-native";

const respondToEngineApproval = vi.fn();
const respondToApproval = vi.fn();

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, o?: Record<string, unknown>) => (o ? `${key}|${JSON.stringify(o)}` : key),
  }),
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
import { engineApprovalFrom, engineApprovalFromState } from "./approval-bundle";

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  respondToEngineApproval.mockReset();
  respondToApproval.mockReset();
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
      { side: "left", levelId: 3, levelLabel: "Nível 3", queue: leftQueue },
      {
        side: null,
        levelId: null,
        levelLabel: null,
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

const wrap = (el: React.ReactElement) => <QueryClientProvider client={client}>{el}</QueryClientProvider>;
const text = (n: { root: { toJSON: () => unknown } }) => JSON.stringify(n.root.toJSON());

describe("the iOS card for a new-engine request (semi-auto-approval N5)", () => {
  it("[NOTIFICATIONS-SEMI-AUTO-APPROVAL-42] approves with removals, dismisses and reads a stale answer", async () => {
    // The class's card: two blocks, the left one truncated, the either one saying why it is empty.
    const onResult = vi.fn();
    const card = await renderNative(
      wrap(<ReplacementApprovalCard bundle={engineApprovalFromState(classState(11))!} allowDismiss onResult={onResult} />)
    );
    expect(card.root.root.findAll((x) => x.props.testID === "approval-block" && typeof x.type === "string")).toHaveLength(2);
    for (const id of ["1", "2", "3", "4", "5"]) expect(card.queryByTestId(`approval-remove-${id}`)).not.toBeNull();
    expect(card.queryByTestId("approval-remove-6")).toBeNull();
    expect(text(card)).toContain('notificationsUi.replacementApproval.showMore|{\\"count\\":2}');
    expect(card.queryByTestId("approval-showing-of")).not.toBeNull();
    expect(card.queryByTestId("approval-empty-reason-failed_eligibility")).not.toBeNull();
    expect(card.queryByTestId("approval-empty-reason-said_no")).not.toBeNull();
    expect(card.queryByTestId("approval-empty-reason-busy_same_time")).toBeNull();
    // N6's words for the stage, not rule 4b's old ones.
    expect(text(card)).toContain("tutorials.engine.stage.failed_eligibility");
    expect(card.queryByTestId("approve-invitations-at-window")).toBeNull();
    expect(card.queryByTestId("approval-dismiss")).not.toBeNull();

    // "Ver mais (2)" reveals the rest, each with its own toggle.
    await card.press("approval-show-more");
    expect(card.queryByTestId("approval-remove-7")).not.toBeNull();

    // Remove two students (one toggled back and forth), then "Sim (2 retirados)".
    await card.press("approval-remove-2");
    await card.press("approval-remove-7");
    await card.press("approval-remove-4");
    await card.press("approval-remove-4");
    expect(card.byTestId("approval-player-2").props.className).toContain("line-through");
    expect(card.byTestId("approval-player-4").props.className).not.toContain("line-through");
    expect(text(card)).toContain('notificationsUi.replacementApproval.yesRemoved|{\\"count\\":2}');

    respondToEngineApproval.mockResolvedValueOnce({ engine: "new", requestId: 11, result: "approved", state: "none" });
    await card.press("approval-yes");
    await card.flush();
    expect(respondToEngineApproval).toHaveBeenCalledWith({ bundleId: 11, action: "yes_now", removed: ["2", "7"] });
    expect(respondToApproval).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith("yes_now");
    expect(card.queryByTestId("approval-approved")).not.toBeNull();
    expect(card.queryByTestId("approval-yes")).toBeNull();

    // Another class card: "Ignorar" sends dismiss and reads "Ignorado".
    const other = await renderNative(wrap(<ReplacementApprovalCard bundle={engineApprovalFromState(classState(12))!} allowDismiss />));
    respondToEngineApproval.mockResolvedValueOnce({ engine: "new", requestId: 12, result: "dismissed", state: "dismissed" });
    await other.press("approval-dismiss");
    await other.flush();
    expect(respondToEngineApproval).toHaveBeenLastCalledWith({ bundleId: 12, action: "dismiss" });
    expect(other.queryByTestId("approval-dismissed")).not.toBeNull();
    expect(text(other)).toContain("notificationsUi.replacementApproval.dismissed");
    expect(other.queryByTestId("approval-dismiss")).toBeNull();

    // A third card's answer comes back stale: the replaced line and no buttons.
    const third = await renderNative(wrap(<ReplacementApprovalCard bundle={engineApprovalFromState(classState(13))!} allowDismiss />));
    respondToEngineApproval.mockResolvedValueOnce({ engine: "new", requestId: 13, result: "stale" });
    await third.press("approval-yes");
    await third.flush();
    expect(third.queryByTestId("approval-replaced")).not.toBeNull();
    expect(text(third)).toContain("notificationsUi.replacementApproval.replacedByNewer");
    expect(third.queryByTestId("approval-yes")).toBeNull();
    expect(third.queryByTestId("approval-dismiss")).toBeNull();
    expect(third.queryByTestId("approval-remove-1")).toBeNull();

    // The conversation's card, from the message's metadata (N4): "Sim" only, no window button.
    const meta = {
      engine: "new",
      requestId: 14,
      lessonInstanceId: 40,
      responded: false,
      spotTypes: classState(14).request!.spotTypes.map(({ side, levelId, levelLabel, queue }) => ({ side, levelId, levelLabel, queue })),
    };
    const convo = await renderNative(wrap(<ReplacementApprovalCard bundle={engineApprovalFrom(meta)!} queueAsOf={null} />));
    expect(convo.queryByTestId("approval-yes")).not.toBeNull();
    expect(convo.queryByTestId("approval-dismiss")).toBeNull();
    expect(convo.queryByTestId("approve-invitations-at-window")).toBeNull();
    expect(text(convo)).toContain("common.yes");

    // A message whose request is no longer pending reads replaced, with no buttons.
    const old = await renderNative(wrap(<ReplacementApprovalCard bundle={engineApprovalFrom({ ...meta, responded: true })!} />));
    expect(old.queryByTestId("approval-replaced")).not.toBeNull();
    expect(old.queryByTestId("approval-yes")).toBeNull();
  });
});
