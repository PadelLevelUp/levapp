import { buildClassEditChanges } from "./edit-class-diff";
import { unavailableBeforeSave } from "./unavailable-check";

/**
 * The class screens' save sequences (classes.create rule 10, classes.edit rule 9,
 * PAD-474), kept out of the screens so they can be tested: the screens mount
 * native pieces the unit harness cannot. new.tsx and [id].tsx decide whether and
 * when to save only through these, never on their own.
 */

export interface CreateFlowDeps<B> {
  hasConflict: () => boolean;
  /** The class's slot, or null while the form lacks one. */
  slot: () => { date: string; startTime: string; endTime: string } | null;
  playerIds: () => string[];
  acknowledged: () => boolean;
  api: {
    checkAvailabilityConflicts: (date: string, startTime: string, endTime: string, playerIds: string[]) => Promise<B[]>;
  };
  save: () => Promise<void>;
  ui: { askOverlap: () => void; askUnavailable: (students: B[]) => void; acknowledgeUnavailable: () => void };
}

/**
 * Create, as web's AddClassSheet: the overlap warning (PAD-159), then the
 * unavailable-student warning (calendar.student-blockers rule 9), then save.
 * Neither warning blocks; create runs no eligibility check and applies no cap.
 */
export function createClassCreateFlow<B>(deps: CreateFlowDeps<B>) {
  const afterOverlap = async () => {
    const slot = deps.slot();
    const blocked = slot
      ? await unavailableBeforeSave({
          acknowledged: deps.acknowledged(),
          playerIds: deps.playerIds(),
          lookup: () =>
            deps.api.checkAvailabilityConflicts(slot.date, slot.startTime, slot.endTime, deps.playerIds()),
        })
      : [];
    if (blocked.length > 0) {
      deps.ui.askUnavailable(blocked);
      return;
    }
    await deps.save();
  };
  return {
    start: async () => {
      if (deps.hasConflict()) {
        deps.ui.askOverlap();
        return;
      }
      await afterOverlap();
    },
    afterOverlap,
    confirmUnavailable: async () => {
      deps.ui.acknowledgeUnavailable();
      await deps.save();
    },
  };
}

type Participants = { participants?: { id: string }[] };

/** Whether an edit has anything to save — the participant diff included. */
export function hasClassEditChanges<T extends Participants>(original: T, draft: T): boolean {
  return Object.keys(buildClassEditChanges(original, draft)).length > 0;
}

export interface EditFlowDeps<T extends Participants, E> {
  original: T;
  draft: T;
  eligibility: (added: string[]) => Promise<{ ineligible: E[] }>;
  finalize: (changes: Record<string, unknown>) => Promise<void>;
  ui: { nothingToSave: () => void; askEligibility: (failing: E[], changes: Record<string, unknown>) => void };
}

/**
 * Edit, as web's ClassDetailSheet.commitEdit: build the change set (fields and
 * participants), save nothing when it is empty, and ask first when an added
 * student fails the bar (eligibility.enforcement rule 7d). A failed check saves.
 */
export async function commitClassEdit<T extends Participants, E>(deps: EditFlowDeps<T, E>): Promise<void> {
  const changes = buildClassEditChanges(deps.original, deps.draft);
  if (Object.keys(changes).length === 0) {
    deps.ui.nothingToSave();
    return;
  }
  const added = Array.isArray(changes.addPlayers) ? (changes.addPlayers as string[]) : [];
  if (added.length > 0) {
    try {
      const { ineligible } = await deps.eligibility(added);
      if (ineligible.length > 0) {
        deps.ui.askEligibility(ineligible, changes);
        return;
      }
    } catch {
      // eligibility.enforcement rule 6: the warning is a courtesy, the enrolment is the coach's.
    }
  }
  await deps.finalize(changes);
}
