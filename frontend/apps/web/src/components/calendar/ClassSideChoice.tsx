/**
 * PAD-672 slice 1 (classes.join-requests rule 20, classes.academy-class-booking rule 6): the sheet
 * that asks "Em que lado queres jogar nesta aula?" before a join request or a waiting-list join.
 *
 * - the card of the student's profile side is pre-selected and tagged "Habitual" (Q1; a `both`
 *   student is asked too); with no profile side nothing is pre-selected and "Enviar" stays
 *   disabled (Q6);
 * - the server's `409 side_full` replaces the body with the two-way choice: play both sides (the
 *   same request again with `both`) or join that side's waiting list;
 * - `mode="waiting"` is the same sheet in the waiting-list theme.
 * The pure rules live in @levelup/config (side-choice.ts), shared with the iOS sheet.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Check } from "lucide-react";
import type { ClassJoinRequest, PlayerSide } from "@levelup/types";
import {
  SIDE_CHOICE_ORDER,
  canSendSide,
  openSideWordKeys,
  preselectedSide,
  sideFullOf,
  sideHintKey,
  sideLabelKey,
  sideWordKey,
  type SideFull,
} from "@levelup/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { joinClassWaitingList } from "@/api/academyClasses";
import { createClassJoinRequest } from "@/api/classJoinRequests";
import { cn } from "@/lib/utils";

export interface ClassSideChoiceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "request" | "waiting";
  event: { model: string; originalId: number | string; date?: string | null };
  /** The student's profile side with the class's coach (Q1); null/undefined: the question is mandatory. */
  profileSide?: PlayerSide | null;
  note?: string;
  onRequestSent?: (request: ClassJoinRequest, side: PlayerSide) => void;
  onWaitingListJoined?: (side: PlayerSide) => void;
  /** Any failure that is not the `side_full` answer (the caller shows its own toast). */
  onFailed?: (error: unknown, mode: "request" | "waiting") => void;
}

export function ClassSideChoice({
  open,
  onOpenChange,
  mode,
  event,
  profileSide,
  note,
  onRequestSent,
  onWaitingListJoined,
  onFailed,
}: ClassSideChoiceProps) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<PlayerSide | null>(preselectedSide(profileSide));
  const [full, setFull] = useState<SideFull | null>(null);
  const [busy, setBusy] = useState(false);

  // Each opening starts from the profile side again; a choice does not outlive the sheet.
  useEffect(() => {
    if (open) {
      setChosen(preselectedSide(profileSide));
      setFull(null);
      setBusy(false);
    }
  }, [open, profileSide]);

  const waiting = mode === "waiting";
  const habitual = preselectedSide(profileSide);

  const sendRequest = async (side: PlayerSide) => {
    setBusy(true);
    try {
      const request = await createClassJoinRequest(event, note, side);
      onRequestSent?.(request, side);
      onOpenChange(false);
    } catch (err) {
      const refusal = sideFullOf(err);
      if (refusal) setFull(refusal);
      else {
        onFailed?.(err, "request");
        onOpenChange(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const joinList = async (side: PlayerSide) => {
    setBusy(true);
    try {
      await joinClassWaitingList(event, side);
      onWaitingListJoined?.(side);
      onOpenChange(false);
    } catch (err) {
      onFailed?.(err, "waiting");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const word = (side: PlayerSide) => t(sideWordKey(side));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="class-side-choice" data-mode={mode} data-stage={full ? "full" : "pick"}>
        {full ? (
          <>
            <DialogHeader>
              <DialogTitle data-testid="class-side-full-title">
                {t("calendar.sidePick.fullTitle", { requested: word(full.requestedSide) })}
              </DialogTitle>
              <DialogDescription data-testid="class-side-full-body">
                {t("calendar.sidePick.fullBody", {
                  open: openSideWordKeys(full)
                    .map((k) => t(k))
                    .join(t("calendar.sidePick.fullOpenJoiner")),
                  requested: word(full.requestedSide),
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
              <Button disabled={busy} onClick={() => void sendRequest("both")} data-testid="class-side-play-both">
                {t("calendar.sidePick.playBoth")}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void joinList(full.requestedSide)}
                data-testid="class-side-stay-waiting"
              >
                {t("calendar.sidePick.stayWaiting", { requested: word(full.requestedSide) })}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("calendar.sidePick.title")}</DialogTitle>
              <DialogDescription>{t(waiting ? "calendar.sidePick.waitingSub" : "calendar.sidePick.sub")}</DialogDescription>
            </DialogHeader>
            <RadioGroupPrimitive.Root
              value={chosen ?? ""}
              onValueChange={(v) => setChosen(v as PlayerSide)}
              aria-label={t("calendar.sidePick.title")}
              className="grid gap-2"
              data-testid="class-side-options"
            >
              {SIDE_CHOICE_ORDER.map((side) => {
                const selected = chosen === side;
                return (
                  <RadioGroupPrimitive.Item
                    key={side}
                    value={side}
                    data-testid={`class-side-${side}`}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? waiting
                          ? "border-[1.5px] border-warning bg-warning/10"
                          : "border-[1.5px] border-primary bg-primary/10"
                        : "border-border bg-background",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        selected
                          ? waiting
                            ? "border-warning bg-warning text-white"
                            : "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{t(sideLabelKey(side))}</span>
                        {habitual === side && (
                          <Badge variant="secondary" data-testid={`class-side-usual-${side}`}>
                            {t("calendar.sidePick.usual")}
                          </Badge>
                        )}
                        {side === "both" && (
                          <Badge
                            variant="outline"
                            className={waiting ? "border-warning/40 bg-warning/10 text-warning-strong" : "border-info/40 bg-info/10 text-info"}
                          >
                            {t("calendar.sidePick.moreChances")}
                          </Badge>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">{t(sideHintKey(side, mode))}</span>
                    </span>
                  </RadioGroupPrimitive.Item>
                );
              })}
            </RadioGroupPrimitive.Root>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="class-side-cancel">
                {t("calendar.sidePick.cancel")}
              </Button>
              <Button
                disabled={busy || !canSendSide(chosen)}
                onClick={() => chosen && void (waiting ? joinList(chosen) : sendRequest(chosen))}
                data-testid="class-side-send"
              >
                {t(waiting ? "classRequests.academy.joinWaitlist" : "calendar.sidePick.send")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
