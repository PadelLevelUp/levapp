import { useTranslation } from "react-i18next";
import {
  PARTICIPANT_GROUP_TITLE_KEYS,
  SIDE_LONG_KEYS,
  SIDE_SHORT_KEYS,
  groupParticipants,
  type ParticipantGroupKey,
  type ParticipantRowModel,
} from "@levelup/config";
import type { CoachPlayer, Player, Presence } from "@/types";

/**
 * PAD-659 (`calendar.event-detail` rule 22): the coach's participant list — compact rows in
 * three groups (Vão, Por responder, Não vão), each ordered by side then name. The grouping and
 * the order are `@levelup/config`'s; this file only draws them. No level and no state word on a
 * row: the group title says the state, and the level lives in the pop-up (rule 23).
 */

export type ParticipantRow = ParticipantRowModel<Player, Presence, CoachPlayer>;

/** Group dot colours from the approved design (rule 22's table). */
const DOT: Record<ParticipantGroupKey, string> = {
  going: "#12946B",
  pending: "#8592A8",
  not_going: "#D3453B",
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

interface ParticipantGroupsProps {
  participants: Player[];
  presences: Presence[] | undefined;
  roster: CoachPlayer[] | undefined;
  /** The name/avatar button that was pressed comes along, so the pop-up can hand focus back. */
  onOpen: (row: ParticipantRow, opener: HTMLButtonElement) => void;
}

export function ParticipantGroups({ participants, presences, roster, onOpen }: ParticipantGroupsProps) {
  const { t } = useTranslation();
  const groups = groupParticipants({ participants, presences, roster });

  return (
    <div className="flex flex-col gap-2.5">
      {groups.map((group) => (
        <section key={group.key} data-testid="participant-group" data-group={group.key} className="flex flex-col gap-1.5">
          <h5 className="flex h-[18px] items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground tabular-nums">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DOT[group.key] }} />
            {t(PARTICIPANT_GROUP_TITLE_KEYS[group.key], { count: group.rows.length })}
          </h5>
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {group.rows.map((row) => (
              <li
                key={row.playerId}
                data-testid={`participant-row-${row.playerId}`}
                data-state={row.state}
                className="flex h-[34px] items-center gap-2.5 px-3 max-sm:h-11"
              >
                <button
                  type="button"
                  data-testid={`participant-open-${row.playerId}`}
                  aria-label={t("calendar.participants.openProfile", { name: row.name })}
                  onClick={(e) => onOpen(row, e.currentTarget)}
                  className="group flex h-full min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#E8F1FF] text-[10px] font-bold text-[#1355DC]"
                  >
                    {initialsOf(row.name)}
                  </span>
                  <span className="min-w-0 truncate text-sm font-semibold group-hover:text-primary group-hover:underline">
                    {row.name}
                  </span>
                </button>
                {row.side ? (
                  <span
                    data-testid="participant-side"
                    title={t(SIDE_LONG_KEYS[row.side])}
                    className="flex h-[22px] w-[38px] shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground"
                  >
                    {t(SIDE_SHORT_KEYS[row.side])}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
