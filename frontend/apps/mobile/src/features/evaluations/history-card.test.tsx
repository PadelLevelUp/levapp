/**
 * PAD-402 (`evaluations.sharing` decision 8, rule 7, 9). Covers what the ticket
 * asks for on `HistoryCard`: the share button is always rendered (rule 10 — any
 * record, so the action row's width never changes with state); "Deixar de
 * partilhar" appears only once shared; "Atualizar partilha" appears only when
 * `share.stale`, and presses the SAME `share` mutation again with the record's
 * OWN stored selection (rule 7 — no new choose-step).
 *
 * `@levelup/hooks` is mocked rather than `@levelup/api`, the pattern
 * `competency-manager.test.tsx` documents (two React copies in this workspace
 * make the real react-query hooks throw under `react-test-renderer` — see
 * `mobile-harness-cannot-mount-react-query-hooks`). `expo-router`'s `router` is
 * a spy so the share icon's navigation is asserted without a real navigator.
 * Every assertion is on testIDs and mock calls, never rendered copy — `t`
 * returns its key throughout.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { EvaluationRecord } from "@levelup/types";
import { renderNative } from "@/test/render-native";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({ router: { push: nav.push } }));

const api = vi.hoisted(() => ({ share: vi.fn(), unshare: vi.fn() }));
vi.mock("@levelup/hooks", () => ({
  useShareEvaluation: () => ({
    isPending: false,
    mutate: (vars: unknown, opts?: { onSuccess?: () => void }) => {
      api.share(vars);
      opts?.onSuccess?.();
    },
  }),
  useUnshareEvaluation: () => ({
    isPending: false,
    mutate: (vars: unknown, opts?: { onSuccess?: () => void }) => {
      api.unshare(vars);
      opts?.onSuccess?.();
    },
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { HistoryCard } from "./history-card";

function record(over: Partial<EvaluationRecord>): EvaluationRecord {
  return {
    id: 41,
    evaluatedOn: "2026-09-21",
    classInstanceId: null,
    className: null,
    note: null,
    editable: true,
    ratings: [{ categoryId: 1, name: "Técnica", key: null, score: 4, scaleMin: 1, scaleMax: 5 }],
    share: null,
    ...over,
  };
}

beforeEach(() => {
  nav.push.mockReset();
  api.share.mockReset();
  api.unshare.mockReset();
});

describe("HistoryCard — PAD-402 share control", () => {
  it("always renders the share button (rule 10), and it opens the share flow with the record and player", async () => {
    const n = await renderNative(
      createElement(HistoryCard, { record: record({}), playerId: "9", playerName: "Rui Silva" }),
    );
    await n.press("evaluation-history-share-41");
    expect(nav.push).toHaveBeenCalledWith({
      pathname: "/share-evaluation",
      params: { recordId: "41", playerId: "9", playerName: "Rui Silva" },
    });
  });

  it("shows neither unshare nor update when the record has no share", async () => {
    const n = await renderNative(
      createElement(HistoryCard, { record: record({ share: null }), playerId: "9", playerName: "Rui" }),
    );
    expect(n.queryByTestId("evaluation-history-unshare-41")).toBeNull();
    expect(n.queryByTestId("evaluation-history-update-share-41")).toBeNull();
    // The status line is reserved even when unshared (nothing moves under the finger).
    expect(n.queryByTestId("evaluation-history-share-status-41")).not.toBeNull();
  });

  it("has no sharing controls without a player (the class panel's earlier-day card)", async () => {
    const n = await renderNative(createElement(HistoryCard, { record: record({}) }));
    expect(n.queryByTestId("evaluation-history-share-41")).toBeNull();
    expect(n.queryByTestId("evaluation-history-share-status-41")).toBeNull();
  });

  it("shows unshare only (no update) when shared and fresh", async () => {
    const shared = record({
      share: { sharedAt: "2026-09-21T14:05:11", categoryIds: [1], evolution: "last", includeNote: false, stale: false },
    });
    const n = await renderNative(
      createElement(HistoryCard, { record: shared, playerId: "9", playerName: "Rui" }),
    );
    expect(n.queryByTestId("evaluation-history-share-status-41")).not.toBeNull();
    expect(n.queryByTestId("evaluation-history-unshare-41")).not.toBeNull();
    expect(n.queryByTestId("evaluation-history-update-share-41")).toBeNull();

    await n.press("evaluation-history-unshare-41");
    expect(api.unshare).toHaveBeenCalledWith(41);
  });

  it("shows unshare AND update when the share is stale; update re-sends the record's own stored selection", async () => {
    const shared = record({
      share: { sharedAt: "2026-09-21T14:05:11", categoryIds: [1], evolution: "6m", includeNote: true, stale: true },
    });
    const n = await renderNative(
      createElement(HistoryCard, { record: shared, playerId: "9", playerName: "Rui" }),
    );
    expect(n.queryByTestId("evaluation-history-unshare-41")).not.toBeNull();
    expect(n.queryByTestId("evaluation-history-update-share-41")).not.toBeNull();

    await n.press("evaluation-history-update-share-41");
    expect(api.share).toHaveBeenCalledWith({
      recordId: 41,
      input: { categoryIds: [1], evolution: "6m", includeNote: true },
    });
  });
});
