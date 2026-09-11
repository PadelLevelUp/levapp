import type { Player, PresenceStatus, AbsenceJustification } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, AlertCircle, CheckCircle2, Send, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
   * PAD-199 (B-017): true only when a reminder/invitation message actually
   * reached this player (`presence.reminderSentAt`). `Presence.invited` is
   * roster membership and must not drive the badge.
   */
  reminderSent?: boolean;
  confirmed?: boolean;
  /**
   * PAD-288 (`attendance.confirm` rule 23): the UTC instant of the student's
   * own cancellation, when the presence says so (`cancelledByStudent`).
   */
  cancelledAt?: string | null;
}

export function AttendanceRow({
  player,
  attendance,
  onChange,
  disabled = false,
  reminderSent,
  confirmed,
  cancelledAt,
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

          {/* Confirmed / reminder-sent status icon — gated on the messaging
              record (calendar.event-detail rule 3a), never on `invited`. */}
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1">
              {(confirmed || reminderSent) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      data-testid="attendance-signal"
                      data-signal={confirmed ? "confirmed" : "reminder-sent"}
                      className={cn(
                      "inline-flex items-center justify-center w-5 h-5 rounded-full",
                      confirmed
                        ? "bg-success/15 text-success-strong"
                        : "bg-warning/15 text-warning"
                    )}>
                      {confirmed ? (
                        <UserCheck className="w-3 h-3" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {confirmed ? t("calendar.attendance.confirmedAttendance") : t("calendar.attendance.reminderSent")}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>

        {attendance.status === "present" && (
          <Badge variant="outline" className="text-success border-success">
            <Check className="w-3 h-3 mr-1" />
            {t("calendar.attendance.present")}
          </Badge>
        )}
        {attendance.status === "absent" &&
          attendance.justification === "justified" && (
            <Badge variant="outline" className="text-warning border-warning">
              <AlertCircle className="w-3 h-3 mr-1" />
              {t("calendar.attendance.justified")}
            </Badge>
          )}
        {cancelledAt && (
          <span data-testid="attendance-cancelled-by-student" className="text-xs text-muted-foreground">
            {t("calendar.detail.cancelledByStudentAt", {
              when: new Date(cancelledAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }),
            })}
          </span>
        )}
        {attendance.status === "absent" &&
          attendance.justification === "unjustified" && (
            <Badge variant="destructive">
              <X className="w-3 h-3 mr-1" />
              {t("calendar.attendance.unjustified")}
            </Badge>
          )}
      </div>

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
