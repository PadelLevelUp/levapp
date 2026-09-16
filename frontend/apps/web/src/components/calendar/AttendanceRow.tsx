import type { Player, PresenceStatus, AbsenceJustification } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  attendanceStateLabelKey,
  attendanceStateOf,
  attendanceStateTone,
  cancellationDetail,
  reminderHint,
  type AttendancePresenceLike,
  type StateAudience,
  type StateTone,
} from "@levelup/config";

export interface AttendanceState {
  status: PresenceStatus | null;
  justification?: AbsenceJustification;
}

interface AttendanceRowProps {
  player: Player;
  attendance: AttendanceState;
  onChange: (attendance: AttendanceState) => void;
  disabled?: boolean;
  /**
   * PAD-313 (`calendar.event-detail` rule 3a): this player's serialized
   * presence. The row asks `@levelup/config` which ONE state it is in and
   * renders that — it never reads `confirmed`, `status`, `justification` or
   * `validated` to decide what to DISPLAY. `attendance` above is the coach's
   * MARK, the write side of the toggle, which is a different thing.
   */
  presence?: AttendancePresenceLike | null;
  /** Whose row this is, so the state word addresses the right person. */
  audience?: StateAudience;
}

export function AttendanceRow({
  player,
  attendance,
  onChange,
  disabled = false,
  presence,
  audience = "coach",
}: AttendanceRowProps) {
  const { t, i18n } = useTranslation();
  const name = player.user?.name ?? t("calendar.attendance.playerFallback");

  const getInitials = (n: string) => {
    return n
      .split(" ")
      .map((x) => x[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // PAD-313 (`attendance.confirm` rule 25): ONE state word, from one source.
  const state = attendanceStateOf(presence);
  const cancellation = cancellationDetail(presence, audience);
  const reminder = reminderHint(presence);
  const TONE: Record<StateTone, string> = {
    neutral: "text-muted-foreground border-border",
    positive: "text-success border-success",
    warning: "text-warning border-warning",
    negative: "text-destructive border-destructive",
  };

  const handleStatusChange = (status: PresenceStatus) => {
    if (status === "present") {
      onChange({ status: "present", justification: undefined });
    } else {
      onChange({
        status: "absent",
        justification: attendance.justification || "unjustified",
      });
    }
  };

  const handleJustificationChange = (justification: AbsenceJustification) => {
    onChange({ status: "absent", justification });
  };

  return (
    <div
      className="p-3 rounded-lg bg-muted/50 space-y-2"
      data-testid="attendance-row"
      data-player-id={player.id}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="text-xs bg-primary text-primary-foreground font-bold">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{name}</span>

        </div>

        {/* PAD-313: the one state word. The three badges that used to sit here
            (present / justified / unjustified, plus the `confirmed` chip above)
            each read one column, so a cancelled student could show three at
            once — one of them false. */}
        <Badge
          variant="outline"
          data-testid="attendance-state"
          data-state={state}
          className={TONE[attendanceStateTone(state)]}
        >
          {t(attendanceStateLabelKey(state, audience))}
        </Badge>
      </div>

      {/* Secondary facts. Never a second state word: lesser weight, own line. */}
      {cancellation && (
        <p data-testid="attendance-cancelled-by-student" className="text-xs text-muted-foreground">
          {t(cancellation.key, {
            when: new Date(cancellation.when).toLocaleString(i18n.language, {
              dateStyle: "short",
              timeStyle: "short",
            }),
          })}
        </p>
      )}
      {reminder && (
        <p data-testid="attendance-reminder-hint" className="text-xs text-muted-foreground">
          {t(reminder)}
        </p>
      )}

      {!disabled && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant={attendance.status === "present" ? "default" : "outline"}
            size="sm"
            className={cn(
              "flex-1",
              attendance.status === "present" &&
                "bg-success hover:bg-success/90 text-success-foreground"
            )}
            onClick={() => handleStatusChange("present")}
          >
            <CheckCircle2 className="w-4 h-4 mr-1" />
            {t("calendar.attendance.present")}
          </Button>

          <Button
            type="button"
            variant={attendance.status === "absent" ? "default" : "outline"}
            size="sm"
            className={cn(
              "flex-1",
              attendance.status === "absent" &&
                "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            )}
            onClick={() => handleStatusChange("absent")}
          >
            <X className="w-4 h-4 mr-1" />
            {t("calendar.attendance.absent")}
          </Button>
        </div>
      )}

      {!disabled && attendance.status === "absent" && (
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant={
              attendance.justification === "justified" ? "default" : "outline"
            }
            size="sm"
            className={cn(
              "flex-1 text-xs",
              attendance.justification === "justified" &&
                "bg-warning hover:bg-warning/90 text-warning-foreground"
            )}
            onClick={() => handleJustificationChange("justified")}
          >
            <AlertCircle className="w-3 h-3 mr-1" />
            {t("calendar.attendance.justified")}
          </Button>

          <Button
            type="button"
            variant={
              attendance.justification === "unjustified"
                ? "destructive"
                : "outline"
            }
            size="sm"
            className="flex-1 text-xs"
            onClick={() => handleJustificationChange("unjustified")}
          >
            <X className="w-3 h-3 mr-1" />
            {t("calendar.attendance.unjustified")}
          </Button>
        </div>
      )}
    </div>
  );
}
