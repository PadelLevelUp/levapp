import type { Player, PresenceStatus, AbsenceJustification } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Check, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  attendanceStateLabelKey,
  attendanceStateOf,
  attendanceStateTone,
  cancellationDetail,
  displayStateOf,
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
  /**
   * PAD-551 (`classes.instance-enrollment` rule 13): the player's side in this occurrence, for the
   * coach. `current` is the side the server reports, `override` whether it is set here, and
   * `editable` the server's answer to "may it still change". `onChange(null)` goes back to the
   * usual side.
   */
  side?: {
    current: "left" | "right" | "both" | null;
    override: boolean;
    editable: boolean;
    busy?: boolean;
    onChange: (side: "left" | "right" | null) => void;
  };
  /**
   * PAD-663 (`calendar.event-detail` rule 25): has the class ended? Until it has, a coach's
   * validated mark is worded as the intent ("Vai", not "Presente"). Defaults to true, the
   * record's own word, for a caller that does not know.
   */
  classEnded?: boolean;
}

export function AttendanceRow({
  player,
  attendance,
  onChange,
  disabled = false,
  presence,
  audience = "coach",
  side,
  classEnded = true,
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
  // PAD-663: the word and tone follow the display state; `data-state` keeps the stored one.
  const shown = displayStateOf(state, classEnded);
  const cancellation = cancellationDetail(presence, audience);
  const reminder = reminderHint(presence);
  const TONE: Record<StateTone, string> = {
    neutral: "text-muted-foreground border-border",
    positive: "text-success border-success",
    warning: "text-warning border-warning",
    negative: "text-destructive border-destructive",
  };

  const handleStatusChange = (status: PresenceStatus) => {
    // PAD-567 (attendance.validation rule 26): the selected state pressed again clears the
    // row back to "no answer"; the save then sends `{playerId, clear: true}`.
    if (attendance.status === status) {
      onChange({ status: null, justification: undefined });
      return;
    }
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
          className={TONE[attendanceStateTone(shown)]}
        >
          {t(attendanceStateLabelKey(shown, audience))}
        </Badge>
      </div>

      {/* PAD-551: the side this player plays in this occurrence, when set here. */}
      {side?.override && (side.current === "left" || side.current === "right") && (
        <p data-testid={`participant-side-${player.id}`} className="text-xs font-medium text-foreground">
          {t(`calendar.side.tag.${side.current}`)}
        </p>
      )}
      {side?.editable && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("calendar.side.label")}</span>
          <ToggleGroup
            type="single"
            size="sm"
            value={side.override && side.current ? side.current : "usual"}
            // Radix reports "" when the pressed item is pressed again: one choice is always on.
            onValueChange={(v) => {
              if (v === "usual") side.onChange(null);
              else if (v === "left" || v === "right") side.onChange(v);
            }}
            disabled={side.busy}
            aria-label={t("calendar.side.label")}
            className="justify-start"
          >
            {(["usual", "left", "right"] as const).map((v) => (
              <ToggleGroupItem
                key={v}
                value={v}
                data-testid={`participant-side-${v}-${player.id}`}
                className="h-8 px-2 text-xs"
              >
                {t(`calendar.side.${v}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}

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
            data-testid="attendance-present"
            aria-pressed={attendance.status === "present"}
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
            data-testid="attendance-absent"
            aria-pressed={attendance.status === "absent"}
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
            data-testid="attendance-justified"
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
            data-testid="attendance-unjustified"
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
