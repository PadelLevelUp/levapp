/**
 * classes.coach-requests-table rule 13 (PAD-795), mirroring web's useCoachRequestActions: the
 * actions an Em aberto row offers, exactly the ones the old list offered — private `pending`: accept,
 * decline, propose another time; academy `pending`: accept (below-the-bar confirmation), reject.
 * The propose form and the confirmation render once, above the list (`panel`), so a `proposeFor`
 * request that is not on a loaded page can still open it (rule 16).
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { classRequestRefusalLines, proposalAfterStartChange, requestMinutes } from "@levelup/config";
import { refreshAfterRequestChange } from "@levelup/hooks";
import type { CoachRequestRow, EligibilityCheckEntry } from "@levelup/types";
import * as classRequestsApi from "@levelup/api/src/resources/classRequests";
import * as classJoinRequestsApi from "@levelup/api/src/resources/classJoinRequests";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Text } from "@/components/ui/text";
import { TimePickerInput } from "@/components/ui/time-picker-input";
import { toast } from "@/components/ui/toast";
import { busySameHourToast, showBusySameHourToast } from "@/features/calendar/busy-same-hour-toast";
import { EligibilityConfirmDialog } from "@/features/calendar/eligibility-confirm-dialog";

const keyOf = (row: Pick<CoachRequestRow, "kind" | "id">) => `${row.kind}-${row.id}`;

export function useCoachRequestActions() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [proposing, setProposing] = React.useState<CoachRequestRow | null>(null);
  const [proposal, setProposal] = React.useState({ date: "", startTime: "10:00", endTime: "11:00" });
  const [parked, setParked] = React.useState<{
    row: CoachRequestRow;
    ineligible: EligibilityCheckEntry[];
    sideGone: "left" | "right" | null;
  } | null>(null);

  // The request lists, the class detail's own read, the calendar (rule 19, PAD-488) and the table's pages.
  const refresh = () => void refreshAfterRequestChange(queryClient);

  /** Opens the propose form on a private request, prefilled with its slot. */
  const openProposal = (row: CoachRequestRow) => {
    if (!row.date || !row.startTime || !row.endTime) return;
    setProposing(row);
    setProposal({ date: row.date, startTime: row.startTime, endTime: row.endTime });
  };

  const refusalText = (err: unknown) => {
    // B-729 (rule 4a): a same-hour refusal names each clash in the coach's words.
    const lines = classRequestRefusalLines(err, "coach", i18n.language);
    if (lines) return lines.map((line) => t(line.key, line.params)).join("\n");
    const refusal = classRequestsApi.classRequestRefusal(err);
    return refusal ? t(`classRequests.refusal.${refusal.code}`) : t("classRequests.decideFailed");
  };

  const act = async (row: CoachRequestRow, fn: () => Promise<unknown>, okKey: string) => {
    setBusy(keyOf(row));
    try {
      await fn();
      toast.success(t(okKey));
      setProposing(null);
    } catch (err) {
      toast.error(refusalText(err));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  // The academy decisions mirror class/[id].tsx's, so refusals and toasts read the same from here.
  const academyAccept = async (row: CoachRequestRow, confirm = false) => {
    setBusy(keyOf(row));
    try {
      await classJoinRequestsApi.acceptClassJoinRequest(row.id, confirm);
      toast.success(t("calendar.joinRequest.acceptedToast", { name: row.displayName }));
    } catch (err) {
      // PAD-920 (classes.instance-enrollment rule 15): say who and where, never the generic line.
      const clash = busySameHourToast(err, i18n.language);
      if (clash) {
        showBusySameHourToast(clash, t, toast.error);
        return;
      }
      const refusal = classJoinRequestsApi.joinRequestRefusal(err);
      if (refusal?.code === "ineligible") {
        setBusy(null);
        setParked({ row, ineligible: refusal.ineligible ?? [], sideGone: classJoinRequestsApi.sideGoneOf(refusal) });
        return;
      }
      toast.error(
        refusal?.code === "spot_filled"
          ? t("calendar.joinRequest.spotFilledToast")
          : refusal?.code === "class_closed"
            ? t("calendar.joinRequest.classClosedToast")
            : t("calendar.joinRequest.decideFailed")
      );
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const academyReject = async (row: CoachRequestRow) => {
    setBusy(keyOf(row));
    try {
      await classJoinRequestsApi.rejectClassJoinRequest(row.id);
      toast.success(t("calendar.joinRequest.rejectedToast", { name: row.displayName }));
    } catch {
      toast.error(t("calendar.joinRequest.decideFailed"));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  /** The buttons of one row; nothing for a row that is not `pending` (countered awaits the student). */
  const actionsFor = (row: CoachRequestRow): React.ReactNode => {
    if (row.status !== "pending") return null;
    const disabled = busy === keyOf(row);
    if (row.kind === "academy") {
      return (
        <View className="flex-row flex-wrap gap-2" testID={`coach-request-actions-academy-${row.id}`}>
          <Button size="sm" disabled={disabled} onPress={() => academyAccept(row)} testID={`class-join-list-accept-${row.id}`}>
            <Text>{t("calendar.joinRequest.accept")}</Text>
          </Button>
          <Button size="sm" variant="outline" disabled={disabled} onPress={() => academyReject(row)} testID={`class-join-list-reject-${row.id}`}>
            <Text>{t("calendar.joinRequest.reject")}</Text>
          </Button>
        </View>
      );
    }
    return (
      <View className="flex-row flex-wrap gap-2" testID={`coach-request-actions-private-${row.id}`}>
        <Button size="sm" disabled={disabled} onPress={() => act(row, () => classRequestsApi.acceptClassRequest(row.id), "classRequests.accepted")} testID="class-request-accept">
          <Text>{t("classRequests.accept")}</Text>
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onPress={() => act(row, () => classRequestsApi.declineClassRequest(row.id), "classRequests.declined")} testID="class-request-decline">
          <Text>{t("classRequests.decline")}</Text>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onPress={() => (proposing && keyOf(proposing) === keyOf(row) ? setProposing(null) : openProposal(row))}
          testID="class-request-propose"
        >
          <Text>{t("classRequests.propose")}</Text>
        </Button>
      </View>
    );
  };

  /** The propose form and the below-the-bar confirmation, rendered once above the list. */
  const panel: React.ReactNode = (
    <>
      {proposing ? (
        <View className="gap-2 rounded-md bg-muted/40 p-2" testID="class-request-proposal-form">
          <Text className="text-sm text-muted-foreground">{t("classRequests.from", { name: proposing.displayName })}</Text>
          <DatePickerInput testID="class-request-proposal-date" label={t("classRequests.date")} value={proposal.date} onChange={(v) => setProposal((p) => ({ ...p, date: v }))} />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <TimePickerInput
                testID="class-request-proposal-start"
                label={t("availability.startTime")}
                value={proposal.startTime}
                onChange={(v) =>
                  setProposal((p) => ({
                    ...p,
                    ...proposalAfterStartChange(p, v, requestMinutes({ startTime: proposing.startTime!, endTime: proposing.endTime! })),
                  }))
                }
              />
            </View>
            <View className="flex-1">
              <TimePickerInput testID="class-request-proposal-end" label={t("availability.endTime")} value={proposal.endTime} onChange={(v) => setProposal((p) => ({ ...p, endTime: v }))} />
            </View>
          </View>
          <Button size="sm" disabled={busy === keyOf(proposing) || !proposal.date} onPress={() => act(proposing, () => classRequestsApi.proposeClassRequest(proposing.id, proposal), "classRequests.proposed")} testID="class-request-propose-send">
            <Text>{t("classRequests.proposeSend")}</Text>
          </Button>
        </View>
      ) : null}
      {/* Rule 7: accepting an academy row is a manual add — same warning as the class detail screen. */}
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
