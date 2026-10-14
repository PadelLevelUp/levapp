import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import {
  PARTICIPANT_GROUP_WORD_KEYS,
  SIDE_LONG_KEYS,
  cancellationDetail,
  groupOfState,
  participantInitials,
  reminderHint,
} from "@levelup/config";
import { getAttendanceHistory } from "@/api/attendance";
import { getAbsenceHistory } from "@/api/absences";
import { getPlayerProfile } from "@/api/players";
import { createConversation } from "@/api/messages";
import { formatEvaluationDate } from "@/components/evaluations/formatEvaluationDate";
import type { ParticipantRow } from "./ParticipantGroups";

/**
 * PAD-659 (`calendar.event-detail` rule 23): a player's profile over the class. A Radix dialog
 * nested in the class sheet's own dialog: Esc and an outside click dismiss only the top layer,
 * so the class stays open where it was. Focus goes back to the name that opened it
 * (`returnFocusTo`), which the sheet passes in.
 */
interface ParticipantPopupProps {
  row: ParticipantRow | null;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}

export function ParticipantPopup({ row, onClose, returnFocusTo }: ParticipantPopupProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const playerId = row?.playerId ?? null;

  const attended = useQuery({
    queryKey: ["participant-popup", "attended", playerId],
    queryFn: () => getAttendanceHistory({ playerId: playerId as string }),
    enabled: !!playerId,
  });
  const missed = useQuery({
    queryKey: ["participant-popup", "missed", playerId],
    queryFn: () => getAbsenceHistory({ playerId: playerId as string }),
    enabled: !!playerId,
  });
  const profile = useQuery({
    queryKey: ["participant-popup", "profile", playerId],
    queryFn: () => getPlayerProfile(playerId as string),
    enabled: !!playerId,
  });

  const lastEvaluatedAt = (profile.data?.evaluations ?? [])
    .map((e) => e.evaluatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const group = row ? groupOfState(row.state) : "pending";
  const hint = reminderHint(row?.presence);
  const cancelled = cancellationDetail(row?.presence, "coach");
  const contact = row?.roster?.phone || row?.roster?.email || "—";

  const sendMessage = async () => {
    if (!row) return;
    const conversation = await createConversation({ otherParticipants: [String(row.player.userId)] });
    navigate(`/messages/${conversation.id}`);
  };

  const fact = (label: string, value: React.ReactNode, extra?: Record<string, string>) => (
    <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold tabular-nums" {...extra}>
        {value}
      </span>
    </div>
  );

  return (
    <DialogPrimitive.Root open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(11,21,36,0.45)]" />
        <DialogPrimitive.Content
          data-testid="participant-popup"
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            if (returnFocusTo) {
              e.preventDefault();
              returnFocusTo.focus();
            }
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[20px] bg-background shadow-[0_24px_48px_-24px_rgba(13,27,49,0.35)] max-sm:bottom-0 max-sm:top-auto max-sm:max-w-none max-sm:w-full max-sm:translate-y-0 max-sm:rounded-b-none"
        >
          {row ? (
            <>
              <div className="relative flex items-center gap-4 bg-[linear-gradient(150deg,#16294A,#0B1524)] p-6">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#E8F1FF] text-lg font-bold text-[#1355DC]">
                  {participantInitials(row.name)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <DialogPrimitive.Title className="truncate font-display text-xl font-bold text-white">
                    {row.name}
                  </DialogPrimitive.Title>
                  <div className="flex gap-1.5">
                    {row.side ? (
                      <span className="flex h-[22px] items-center rounded-md bg-white/15 px-2 text-[11px] font-semibold text-[#9CC6FF]">
                        {t(SIDE_LONG_KEYS[row.side])}
                      </span>
                    ) : null}
                    {row.level?.label ? (
                      <span className="flex h-[22px] items-center rounded-md bg-white/15 px-2 text-[11px] font-bold text-[#9CC6FF]">
                        {t("calendar.participants.level", { level: row.level.label })}
                      </span>
                    ) : null}
                  </div>
                </div>
                <DialogPrimitive.Close
                  data-testid="participant-popup-close"
                  aria-label={t("calendar.participants.close")}
                  className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/15 text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </DialogPrimitive.Close>
              </div>
              <div className="flex flex-col px-6 py-5">
                {fact(t("calendar.participants.inThisClass"), t(PARTICIPANT_GROUP_WORD_KEYS[group]), {
                  "data-testid": "participant-popup-state",
                  "data-group": group,
                })}
                {hint ? <p className="py-1 text-xs text-muted-foreground" data-testid="attendance-reminder-hint">{t(hint)}</p> : null}
                {cancelled ? (
                  <p className="py-1 text-xs text-muted-foreground" data-testid="attendance-cancelled-by-student">
                    {t(cancelled.key, {
                      // As AttendanceRow words it: the instant in the account's language.
                      when: new Date(cancelled.when).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }),
                    })}
                  </p>
                ) : null}
                {fact(
                  t("calendar.participants.attendance"),
                  attended.data && missed.data
                    ? t("calendar.participants.attendanceValue", { attended: attended.data.total, missed: missed.data.total })
                    : "—"
                )}
                {fact(
                  t("calendar.participants.lastEvaluation"),
                  lastEvaluatedAt
                    ? formatEvaluationDate(lastEvaluatedAt.slice(0, 10), i18n.language)
                    : profile.isSuccess
                      ? t("calendar.participants.noEvaluations")
                      : "—"
                )}
                {fact(t("calendar.participants.contact"), contact)}
              </div>
              <div className="flex gap-2 px-6 pb-6">
                <button
                  type="button"
                  data-testid="participant-popup-message"
                  onClick={sendMessage}
                  className="h-10 flex-1 rounded-xl bg-[#E8F1FF] text-[13px] font-semibold text-[#1355DC]"
                >
                  {t("calendar.participants.sendMessage")}
                </button>
                <button
                  type="button"
                  data-testid="participant-popup-profile"
                  onClick={() => navigate(`/players/${row.playerId}`)}
                  className="h-10 flex-1 rounded-xl bg-[#1355DC] text-[13px] font-semibold text-white"
                >
                  {t("calendar.participants.fullProfile")}
                </button>
              </div>
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
