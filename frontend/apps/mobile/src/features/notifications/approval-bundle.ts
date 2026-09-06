/**
 * What a replacement-approval bundle offers the coach (PAD-168).
 *
 * Mirrors the derivation web does inline in
 * `apps/web/src/components/notifications/ReplacementApprovalCard.tsx` and in
 * `MessageBubble.tsx`'s `messageType === "replacement_approval"` branch. iOS
 * rendered those messages as plain text, so semi-automatic approval could not
 * be completed from the phone at all.
 *
 * The rules are small but each one is a real product decision (which badge,
 * whether the "at window open" button exists, when the whole bundle is stale),
 * so they live here where a unit test can reach them rather than inside JSX —
 * mobile screens are not unit-testable in this repo (see vitest.config.ts).
 */

import type {
  ApprovalAction,
  ApprovalBundle,
  ApprovalQueuePlayer,
  ApprovalVacancyResult,
} from "@levelup/types";

/**
 * A `replacement_approval` message carries the bundle in `message.metadata`.
 * Web casts it straight across (`metadata as unknown as ApprovalBundle`) and
 * then guards on `bundleId` + a non-empty `vacancies` array before rendering.
 * That guard is the whole contract, so it is done once, here, and returns
 * `null` for anything that would render an empty card.
 */
export function approvalBundleFrom(
  metadata: unknown
): ApprovalBundle | null {
  if (!metadata || typeof metadata !== "object") return null;
  const candidate = metadata as Partial<ApprovalBundle>;
  if (typeof candidate.bundleId !== "string" || candidate.bundleId === "") {
    return null;
  }
  if (!Array.isArray(candidate.vacancies) || candidate.vacancies.length === 0) {
    return null;
  }
  return candidate as ApprovalBundle;
}

/** A translation key plus its interpolation values, resolved by the caller's `t`. */
export type TranslatedLabel = {
  key: string;
  params?: Record<string, number>;
};

/**
 * The queue-position chip next to a player's name: an explicit `groupLabel`
 * wins, then the round number, then the group index — and nothing at all when
 * the backend sent none of the three. `groupLabel` is server-authored text and
 * therefore carries no key.
 */
export function queueBadgeLabel(
  player: Pick<ApprovalQueuePlayer, "roundNumber" | "groupIndex" | "groupLabel">
): { text: string } | TranslatedLabel | null {
  if (player.groupLabel) return { text: player.groupLabel };
  if (player.roundNumber != null) {
    return {
      key: "notificationsUi.replacementApproval.round",
      params: { number: player.roundNumber },
    };
  }
  if (player.groupIndex != null) {
    return {
      key: "notificationsUi.replacementApproval.group",
      params: { index: player.groupIndex },
    };
  }
  return null;
}

export type ApprovalCardState = {
  /** The window has not opened yet, so "Yes, at <window>" is a real choice. */
  windowOpenInFuture: boolean;
  /** Every vacancy came back stale — the bundle is moot, show one notice. */
  allStale: boolean;
  /** The recorded answer, local-first then the bundle's own. */
  response: ApprovalAction | null;
  /** Show the approve/dismiss buttons. */
  showActions: boolean;
};

export type ApprovalCardInput = {
  /** Vacancy ids the server reported stale in this session's response. */
  staleVacancyIds?: number[];
  /** An answer given in this session, before any refetch reflects it. */
  localResponse?: ApprovalAction | null;
  /** Viewing your own message: render the card without action buttons. */
  readOnly?: boolean;
  /** Injectable clock, so the window rule is testable. */
  now?: Date;
};

export function approvalCardState(
  bundle: ApprovalBundle,
  {
    staleVacancyIds = [],
    localResponse = null,
    readOnly = false,
    now = new Date(),
  }: ApprovalCardInput = {}
): ApprovalCardState {
  // The bundle's own answer is the fallback, exactly as web seeds its
  // useState: `bundle.responded ? bundle.response ?? null : null`.
  const response =
    localResponse ?? (bundle.responded ? bundle.response ?? null : null);

  // `allStale` is only meaningful once the server has told us something is
  // stale — an empty stale list must not make an empty-checked `every()` true.
  const allStale =
    staleVacancyIds.length > 0 &&
    bundle.vacancies.every((vacancy) =>
      staleVacancyIds.includes(vacancy.vacancyId)
    );

  const windowOpenInFuture =
    !!bundle.windowOpenAt &&
    new Date(bundle.windowOpenAt).getTime() > now.getTime();

  return {
    windowOpenInFuture,
    allStale,
    response,
    showActions: !response && !allStale && !readOnly,
  };
}

/**
 * What to do with the server's answer to an approve/dismiss tap.
 *
 * The tap is a request: by the time it lands the spots may already have been
 * filled or expired, and the server says so per vacancy. Web decides this
 * inline inside `handleRespond`; pulling it out is what makes it testable on
 * iOS.
 */
export type ApprovalRespondOutcome = {
  /** Vacancy ids the server marked stale. */
  staleVacancyIds: number[];
  /** Every vacancy was stale — worth an explicit toast. */
  allStale: boolean;
  /** Toast key to show, or `null` when there is nothing to say. */
  toastKey: string | null;
};

export function approvalRespondOutcome(
  vacancies:
    | { vacancyId: number; result: ApprovalVacancyResult }[]
    | null
    | undefined
): ApprovalRespondOutcome {
  const list = vacancies ?? [];
  const staleVacancyIds = list
    .filter((vacancy) => vacancy.result === "stale")
    .map((vacancy) => vacancy.vacancyId);
  const allStale =
    staleVacancyIds.length > 0 && staleVacancyIds.length === list.length;
  return {
    staleVacancyIds,
    allStale,
    toastKey: allStale
      ? "notificationsUi.replacementApproval.spotsFilledOrExpired"
      : null,
  };
}
