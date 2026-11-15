/**
 * PAD-920 (notifications.config rule 20): the iOS edits of the new engine's own settings and of the
 * tiers, kept pure so the screen only renders. `perTier` is in tier order (0 the coach's list, 1 the
 * students' list, then one per invitation group), so every edit of the groups moves its entry with it
 * (the shared `perTier*` helpers, which web uses too).
 */
import type { EngineConfig, EngineTimingPair, InvitationGroup } from "@levelup/types";
import { FIXED_TIERS, moveTier, perTierAfterMove, perTierAfterRemove, perTierAligned } from "@levelup/config";

/** What a coach on `new` with nothing stored edits: every value the engine's default (rule 20). */
export const ENGINE_CONFIG_FALLBACK: EngineConfig = {
  maxAtATime: null,
  timing: { method: "fixed", betweenRoundsMinutes: null, betweenGroupsMinutes: null },
  autoEntryBeforeAttendanceRequest: false,
  waitingListSideChoice: false,
};

export function engineConfigOf(engine: EngineConfig | undefined): EngineConfig {
  return {
    ...ENGINE_CONFIG_FALLBACK,
    ...engine,
    timing: { ...ENGINE_CONFIG_FALLBACK.timing, ...engine?.timing },
  };
}

/** A tier's index from its group's: the groups follow the fixed tiers. */
export function tierIndexOfGroup(groupIndex: number): number {
  return groupIndex + FIXED_TIERS.length;
}

/** `perTier` as long as the tiers, each missing entry null (that tier uses the pair). */
export function perTierFor(engine: EngineConfig, groupCount: number): Array<EngineTimingPair | null> {
  return perTierAligned(engine.timing.perTier, groupCount);
}

/** `perTier` is written only with `per_tier` (rule 20's validation refuses it otherwise). */
function withPerTier(engine: EngineConfig, perTier: Array<EngineTimingPair | null>): EngineConfig {
  if (engine.timing.method !== "per_tier") return engine;
  return { ...engine, timing: { ...engine.timing, perTier } };
}

export function setTimingMethod(engine: EngineConfig, method: EngineConfig["timing"]["method"], groupCount: number): EngineConfig {
  const timing = { ...engine.timing, method };
  if (method === "per_tier") timing.perTier = perTierFor(engine, groupCount);
  else delete timing.perTier;
  return { ...engine, timing };
}

type TiersEdit = { groups: InvitationGroup[]; engine: EngineConfig };

export function moveGroup(groups: InvitationGroup[], engine: EngineConfig, from: number, to: number): TiersEdit {
  const next = moveTier(groups, from, to);
  if (next === groups) return { groups, engine };
  return { groups: next, engine: withPerTier(engine, perTierAfterMove(perTierFor(engine, groups.length), from, to)) };
}

export function removeGroup(groups: InvitationGroup[], engine: EngineConfig, index: number): TiersEdit {
  return {
    groups: groups.filter((_, i) => i !== index),
    engine: withPerTier(engine, perTierAfterRemove(perTierFor(engine, groups.length), index)),
  };
}

export function addGroup(groups: InvitationGroup[], engine: EngineConfig, id: string): TiersEdit {
  return { groups: [...groups, { id, rules: [] }], engine: withPerTier(engine, perTierFor(engine, groups.length + 1)) };
}

/** One tier's own pair; a null side of it falls back to the coach's pair, then to `maxInactiveTime`. */
export function setTierPair(engine: EngineConfig, groupCount: number, tierIndex: number, pair: EngineTimingPair): EngineConfig {
  const perTier = perTierFor(engine, groupCount);
  perTier[tierIndex] = pair;
  return withPerTier(engine, perTier);
}
