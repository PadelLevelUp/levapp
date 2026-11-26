/**
 * classes.coach-requests-table rule 13 (PAD-795): the actions an Em aberto row of the coach's table
 * offers, exactly the ones the old list offered — private `pending`: accept, decline, propose
 * another time; academy `pending`: accept (below-the-bar confirmation), reject. One hook so the
 * table renders the buttons in its rows and the propose form / confirmation once above it, where a
 * `?proposeFor=` request that is not on the page can still open it (rule 16).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { refreshAfterRequestChange } from "@levelup/hooks";
import type { CoachRequestRow, EligibilityCheckEntry } from "@levelup/types";
import { classRequestRefusalLines, clubTodayISO, proposalAfterStartChange, requestMinutes, resolveText } from "@levelup/config";
import { busySameHourDescription } from "@/components/calendar/busySameHourDescription";
import { EligibilityConfirmDialog } from "@/components/calendar/EligibilityConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeSelect } from "@/components/ui/time-select";
import { useToast } from "@/hooks/use-toast";
import { acceptClassRequest, classRequestRefusal, declineClassRequest, proposeClassRequest } from "@/api/classRequests";
import { acceptClassJoinRequest, joinRequestRefusal, rejectClassJoinRequest, sideGoneOf } from "@/api/classJoinRequests";

const keyOf = (row: Pick<CoachRequestRow, "kind" | "id">) => `${row.kind}-${row.id}`;

export function useCoachRequestActions() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [proposing, setProposing] = useState<CoachRequestRow | null>(null);
  const [proposal, setProposal] = useState({ date: "", startTime: "10:00", endTime: "11:00" });
  const [parked, setParked] = useState<{
    row: CoachRequestRow;
    ineligible: EligibilityCheckEntry[];
    sideGone: "left" | "right" | null;
  } | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  const refresh = () => refreshAfterRequestChange(queryClient);

  useEffect(() => {
    if (proposing) formRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [proposing]);

  /** Opens the propose form on a private request, prefilled with its slot (rule 16 too). */
  const openProposal = (row: CoachRequestRow) => {
    if (!row.date || !row.startTime || !row.endTime) return;
    setProposing(row);
    setProposal({ date: row.date, startTime: row.startTime, endTime: row.endTime });
  };

  const refusalText = (err: unknown) => {
    // B-729 (rule 4a): a same-hour refusal names each clash in the coach's words.
    const lines = classRequestRefusalLines(err, "coach", i18n.language);
    if (lines) return lines.map((line) => resolveText(t, line)).join("\n");
    const refusal = classRequestRefusal(err);
    return refusal ? t(`classRequests.refusal.${refusal.code}`) : undefined;
  };

  const act = async (row: CoachRequestRow, fn: () => Promise<unknown>, okKey: string) => {
    setBusy(keyOf(row));
    try {
      await fn();
      toast({ title: t(okKey) });
      setProposing(null);
    } catch (err) {
      toast({ variant: "destructive", title: t("classRequests.decideFailed"), description: refusalText(err) });
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  // The academy decisions mirror ClassDetailSheet's, so a refusal reads the same from here.
  const academyAccept = async (row: CoachRequestRow, confirm = false) => {
    setBusy(keyOf(row));
    try {
      await acceptClassJoinRequest(row.id, confirm);
      toast({ title: t("calendar.joinRequest.acceptedToast", { name: row.displayName }) });
    } catch (err) {
      const refusal = joinRequestRefusal(err);
      if (refusal?.code === "ineligible") {
        setBusy(null);
        setParked({ row, ineligible: refusal.ineligible ?? [], sideGone: sideGoneOf(refusal) });
        return;
      }
      toast({
        title:
          refusal?.code === "spot_filled"
            ? t("calendar.joinRequest.spotFilledToast")
            : refusal?.code === "class_closed"
              ? t("calendar.joinRequest.classClosedToast")
              : t("calendar.joinRequest.decideFailed"),
        // PAD-920 (classes.instance-enrollment rule 15): a same-hour clash names the other class.
        description: busySameHourDescription(err, t, i18n.language) ?? undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const academyReject = async (row: CoachRequestRow) => {
    setBusy(keyOf(row));
    try {
      await rejectClassJoinRequest(row.id);
      toast({ title: t("calendar.joinRequest.rejectedToast", { name: row.displayName }) });
    } catch {
      toast({ title: t("calendar.joinRequest.decideFailed"), variant: "destructive" });
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  /** The buttons of one row; nothing for a row that is not `pending` (countered awaits the student). */
  const actionsFor = (row: CoachRequestRow): ReactNode => {
    if (row.status !== "pending") return null;
    const disabled = busy === keyOf(row);
    if (row.kind === "academy") {
      return (
        <div className="flex gap-2">
          <Button size="sm" disabled={disabled} onClick={() => academyAccept(row)} data-testid="class-join-list-accept">
            {t("calendar.joinRequest.accept")}
          </Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => academyReject(row)} data-testid="class-join-list-reject">
            {t("calendar.joinRequest.reject")}
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={disabled} onClick={() => act(row, () => acceptClassRequest(row.id), "classRequests.accepted")} data-testid="class-request-accept">
          {t("classRequests.accept")}
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => act(row, () => declineClassRequest(row.id), "classRequests.declined")} data-testid="class-request-decline">
          {t("classRequests.decline")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => (proposing && keyOf(proposing) === keyOf(row) ? setProposing(null) : openProposal(row))}
          data-testid="class-request-propose"
        >
          {t("classRequests.propose")}
        </Button>
      </div>
    );
  };

  /** The propose form and the below-the-bar confirmation, rendered once, above the table. */
  const panel: ReactNode = (
    <>
      {proposing && (
        <div
          ref={formRef}
          className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end rounded-md bg-muted/40 p-2"
          data-testid="class-request-proposal-form"
          data-request-id={proposing.id}
        >
          <p className="md:col-span-4 text-sm text-muted-foreground">
            {t("classRequests.from", { name: proposing.displayName })}
          </p>
          <div className="space-y-1">
            <Label className="text-xs">{t("classRequests.date")}</Label>
            <Input type="date" min={clubTodayISO()} value={proposal.date} onChange={(e) => setProposal((p) => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("availability.startTime")}</Label>
            <TimeSelect
              value={proposal.startTime}
              data-testid="class-request-proposal-start"
              aria-label={t("availability.startTime")}
              first="00:00"
              // Rule 20 (PAD-491): the end moves with the start, keeping the form's length.
              onChange={(next) => {
                setProposal((p) => ({ ...p, ...proposalAfterStartChange(p, next, requestMinutes({ startTime: proposing.startTime!, endTime: proposing.endTime! })) }));
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("availability.endTime")}</Label>
            <TimeSelect value={proposal.endTime} data-testid="class-request-proposal-end" aria-label={t("availability.endTime")} first="00:00" last="23:59" onChange={(endTime) => setProposal((p) => ({ ...p, endTime }))} />
          </div>
          <Button
            size="sm"
            disabled={busy === keyOf(proposing) || !proposal.date}
            onClick={() => act(proposing, () => proposeClassRequest(proposing.id, proposal), "classRequests.proposed")}
            data-testid="class-request-propose-send"
          >
            {t("classRequests.proposeSend")}
          </Button>
        </div>
      )}
      {/* Rule 7: accepting an academy row is a manual add — same warning as the class sheet. */}
      <EligibilityConfirmDialog
        open={parked !== null}
        ineligible={parked?.ineligible ?? []}
        sideGone={parked?.sideGone ? { side: parked.sideGone, name: parked.row.displayName } : null}
        onCancel={() => setParked(null)}
        onConfirm={() => {
          const row = parked?.row;
          setParked(null);
          if (row) void academyAccept(row, true);
        }}
      />
    </>
  );

  return { actionsFor, panel, openProposal };
}
