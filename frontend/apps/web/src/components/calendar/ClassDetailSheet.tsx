import { format } from "date-fns";
import { dateFnsLocale } from "@/lib/dateLocale";
import { joinClassWaitingList } from "@/api/academyClasses";
import {
  Users,
  Clock,
  Calendar,
  Trash2,
  Edit,
  Save,
  X,
  Plus,
  Minus,
  Check,
  Bell,
  Send,
  ChevronDown,
  ChevronRight,
  Repeat,
  Loader2,
  AlertTriangle,
  UserX,
  Copy,
  MoreHorizontal,
  MessageCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createConversation } from "@/api/messages";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { hasUnsavedClassEdit } from "@/lib/classEditUnsaved";
import { listCourtsForClass } from "@/api/courts";
import { useTranslation } from "react-i18next";

import { ClassPlanningSection } from "./ClassPlanningSection";

import type {
  ApprovalBundle,
  CalendarEvent,
  ClassInstance,
  ClassInvitation,
  CoachPlayer,
  CoachLevel,
  Court,
  PresenceStatus,
  AbsenceJustification,
} from "@/types";


import { assignedSideOf, blockedNames, classEvaluationsAction, endsAfterStart, errorStatusOf, firstAndLastName, isHhMm, joinRequestAcceptedAtOnce, sideLongKeyOf, sideWordKey } from "@levelup/config";
import { useClassEvaluations, useCoachDisplayName } from "@levelup/hooks";
import { ClassEvaluationsAction } from "@/components/evaluations/ClassEvaluationsAction";
import { ClassEvaluationsPanel } from "@/components/evaluations/ClassEvaluationsPanel";
import { CLASS_COLOR_SWATCHES, attendanceStateOf, classHasEnded, liveInstanceIdOf, presenceChangedFor, canConfirmAttendance, clearsFor, comeBackAction, comeBackFromAnswer, effectiveFilledSpotsOf, findOverlappingEvent, participantsHeader, hasRecordedAttendance, lisbonNowMs, parseISODate, reminderAnswerOutcome, reminderArrivedFor, wallClockISOMs, wallClockMs } from "@levelup/config";
import { getClassInstance } from "@/api/classes";
import {
  acceptClassJoinRequest,
  joinRequestRefusal,
  rejectClassJoinRequest,
  sideGoneOf,
  withdrawClassJoinRequest,
} from "@/api/classJoinRequests";
import {
  sendClassReminders,
  cancelAttendance,
  respondToReminder,
  coachRespondToNotification,
  withdrawInvitation,
  getApprovalSuggestions,
  recomputeApprovalSuggestions,
} from "@/api/notificationEngine";
import { INVITATION_OUTCOME_KEY, INVITATION_OUTCOME_TONE, inviteeActionsFor, inviteeNotes, outcomeAfterCoachAction, outcomeAfterResponse, statusForOutcome, mergeSuggestionBundles, suggestionBundles } from "@levelup/config";
import { confirmClassPresences, setPresenceSide } from "@/api/presences";
import { confirmClassTraining } from "@/api/training";
import { subscribeAppEvents } from "@/api/events";
import { ParticipantGroups, type ParticipantRow } from "./ParticipantGroups";
import { ParticipantPopup } from "./ParticipantPopup";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ManualNotificationModal } from "./ManualNotificationModal";
import { Badge } from "@/components/ui/badge";
import { ClassWaitingListSection } from "./ClassWaitingListSection";
import { ClassSideChoice } from "./ClassSideChoice";
import { JoinRequestSide } from "./JoinRequestSide";
import { ReplacementApprovalCard } from "@/components/notifications/ReplacementApprovalCard";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { TimeSelect, endAfterStartMove } from "@/components/ui/time-select";
import { cn } from "@/lib/utils";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ClassScopeDialog, ApplyScope } from "./ClassScopeDialog";
import type { SideInOccurrence } from "./SideInOccurrenceControl";
import { AttendanceRow, AttendanceState } from "./AttendanceRow";
import { PlayerSelector } from "./PlayerSelector";
import { LevelLabel } from "@/components/LevelLabel";
import { OverlapConfirmDialog } from "./OverlapConfirmDialog";
import { EligibilityConfirmDialog } from "./EligibilityConfirmDialog";
import { checkEligibility } from "@/api/notificationEngine";
import type { ClassJoinRequest, EligibilityCheckEntry, PlayerSide } from "@levelup/types";
import { ClassEligibilityBlock } from "./ClassEligibilityBlock";

// PAD-246: one shared palette for every picker — calendar.mobile-views rule 6.
const COLORS: readonly string[] = CLASS_COLOR_SWATCHES;

type AttendanceRecord = Record<string, AttendanceState>;

interface ClassDetailSheetProps {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
  /** PAD-285 (dashboard.blocks rule 10): open with the Notificar picker already up. */
  openNotify?: boolean;

  players: CoachPlayer[];
  levels: CoachLevel[];

  canManage: boolean,

  onDelete: (event: CalendarEvent, scope: ApplyScope) => void;
  onEdit: (
    event: CalendarEvent,
    updated: Partial<ClassInstance>,
    scope: ApplyScope
  ) => void;
  deleting?: boolean;
  saving?: boolean;
  /** Events already loaded for the visible week — used to warn on overlap (PAD-99). */
  existingEvents?: CalendarEvent[];
  /** classes.clone (PAD-524): "Clonar aula" — the page opens the new-class sheet prefilled. */
  onClone?: (event: CalendarEvent) => void;
}

export function ClassDetailSheet({
  event,
  open,
  onClose,
  openNotify,
  players,
  levels,
  canManage,
  onDelete,
  onEdit,
  deleting = false,
  saving = false,
  existingEvents = [],
  onClone,
}: ClassDetailSheetProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  // PAD-683 (players.nickname rules 8, 9b): the class detail is a shared payload, so the invitee
  // list, join requests and their toasts resolve the coach's display name here; a student's view
  // asks nothing and keeps the real name.
  const displayName = useCoachDisplayName({ enabled: canManage });

  const [classInstance, setClassInstance] = useState<ClassInstance | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ClassInstance | null>(null);
  // classes.edit rule 10 (PAD-525, B-341): the "Descartar alterações?" question shown when a close
  // would drop an unsaved draft.
  const [discardAskOpen, setDiscardAskOpen] = useState(false);
  // classes.edit rule 10 (PAD-525, B-341): an edit belongs to ONE class on ONE opening. The sheet
  // stays mounted across a close, so a draft that outlived it rendered the NEXT class over the
  // previous class's edits. Keyed on the id: a refetch after a save makes a new event object with
  // the same id, and that must not drop an edit in progress.
  useEffect(() => {
    setIsEditing(false);
    setDraft(null);
    setDiscardAskOpen(false);
  }, [event?.id]);
  // clubs.courts rule 7 (PAD-194; B-266): the editor offers the CLASS's club's courts — what
  // edit_class validates against — not the coach's current club's.
  const [courts, setCourts] = useState<Court[]>([]);
  const classClubId = classInstance?.clubId ?? null;
  useEffect(() => {
    if (!isEditing) return;
    let cancelled = false;
    listCourtsForClass({ clubId: classClubId })
      .then((rows) => {
        if (!cancelled) setCourts(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isEditing, classClubId]);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editScopeDialogOpen, setEditScopeDialogOpen] = useState(false);
  const [overlapConfirmOpen, setOverlapConfirmOpen] = useState(false);
  // PAD-150: a manual add that fails the bar asks first (rule 7d). The pending
  // edit is parked here until the coach confirms or cancels.
  const [ineligible, setIneligible] = useState<EligibilityCheckEntry[]>([]);
  // PAD-131 (classes.join-requests): a student's ask / the coach's decision.
  const [joinBusy, setJoinBusy] = useState(false);
  // PAD-664: the class (by event id) whose waiting list the student just joined.
  const [joinedWaitingFor, setJoinedWaitingFor] = useState<string | null>(null);
  // PAD-672 (join-requests rule 20): the side sheet, and the side of the place just joined.
  const [sideSheet, setSideSheet] = useState<"request" | "waiting" | null>(null);
  const [joinedWaitingSide, setJoinedWaitingSide] = useState<PlayerSide | null>(null);
  const [pendingAccept, setPendingAccept] = useState<{
    id: number;
    ineligible: EligibilityCheckEntry[];
    /** PAD-808 (rule 7a): the side asked for and the student, when no spot of it is open any more. */
    sideGone: { side: "left" | "right"; name: string } | null;
  } | null>(null);
  const [pendingEdit, setPendingEdit] = useState<{
    changes: Record<string, unknown>;
    scope: ApplyScope;
  } | null>(null);

  const [isValidating, setIsValidating] = useState(false);
  // PAD-659 (rule 23): the player pop-up, and the name that opened it (focus goes back there).
  const [popupRow, setPopupRow] = useState<ParticipantRow | null>(null);
  const [popupOpener, setPopupOpener] = useState<HTMLElement | null>(null);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRecord>({});
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  // PAD-285: the dashboard's "Convidar" lands here with Notificar to open — once
  // the sheet is up for a coach, and only for this opening.
  useEffect(() => {
    if (open && openNotify && canManage && event?.type === "class") setShowNotifyModal(true);
  }, [open, openNotify, canManage, event?.type]);
  const [sendingReminders, setSendingReminders] = useState(false);

  // PAD-376 (evaluations.class-panel): "Avaliações" swaps this surface for the class's
  // participants. Whether it is offered is the SERVER's answer — its read never
  // materialises the occurrence, and `canRate` is false for a past class that was never
  // opened — so nothing here compares a date with this device's clock. The panel owns its
  // state: closing the sheet or moving to another class unmounts it (rule 9).
  const [showEvaluations, setShowEvaluations] = useState(false);
  const isClassEvent = event?.type === "class";
  const evaluationsRef = useMemo(
    () => (event && isClassEvent ? { model: event.model, id: Number(event.originalId), date: event.date } : null),
    [event, isClassEvent]
  );
  const classEvaluations = useClassEvaluations(evaluationsRef, open && canManage);
  const evaluationsAction = classEvaluationsAction({
    isCoach: canManage,
    isClass: isClassEvent,
    data: classEvaluations.data,
    isError: classEvaluations.isError,
    errorStatus: errorStatusOf(classEvaluations.error),
  });
  useEffect(() => {
    setShowEvaluations(false);
  }, [open, event?.id]);

  const [localInvitations, setLocalInvitations] = useState<ClassInvitation[]>([]);
  // PAD-548 (calendar.event-detail rules 17–18): the coach's actions on an invitee row.
  const [inviteeToDelete, setInviteeToDelete] = useState<ClassInvitation | null>(null);
  const [inviteeBusyId, setInviteeBusyId] = useState<number | null>(null);
  // A coach action re-reads the class (the roster changed, the next candidate was asked); the
  // reset effect below must not fold the invited section the coach is working in.
  const keepInvitationsOpenRef = useRef(false);
  const [invitationsOpen, setInvitationsOpen] = useState(false);
  // PAD-765 (semi-auto-approval rule 12): every pending bundle of the class, oldest spot first.
  const [approvalBundles, setApprovalBundles] = useState<ApprovalBundle[]>([]);
  // PAD-770: the bundles the coach answered here; their card stays through a re-read until closed.
  const answeredBundleIdsRef = useRef<Set<string>>(new Set());
  // PAD-545 / PAD-542 (semi-auto-approval rule 12): the class's suggestion state, read on open so
  // a pending list survives a reload, and an ignored one offers "Suggest automatic invitations".
  const [suggestionsIgnored, setSuggestionsIgnored] = useState(false);
  const [semiAutomatic, setSemiAutomatic] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const suggestionsInstanceId = (() => {
    const fromPresence = classInstance?.presences?.[0]?.lessonInstanceId;
    if (fromPresence != null) return Number(fromPresence);
    if (event?.model === "LessonInstance") return Number(event.originalId);
    return null;
  })();
  useEffect(() => {
    setSuggestionsIgnored(false);
    if (!open || !canManage || suggestionsInstanceId == null) return;
    let cancelled = false;
    getApprovalSuggestions(suggestionsInstanceId)
      .then((s) => {
        if (cancelled) return;
        setSemiAutomatic(!!s.semiAutomatic);
        // PAD-770 (rule 12b): a spot that filled or a student who joined since drops out here.
        setApprovalBundles((prev) => mergeSuggestionBundles(prev, suggestionBundles(s), answeredBundleIdsRef.current));
        setSuggestionsIgnored(s.state === "dismissed");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // PAD-765: read again once the class loads — the class-id reset below clears the cards, and a
    // class known from the event (its id in the event) could be read before it and lose them.
    // PAD-770: and every time the class is read again (a presence moved, a join was accepted), so
    // the cards follow the class without reopening it.
  }, [open, canManage, suggestionsInstanceId, classInstance]);

  const handleRecomputeSuggestions = async () => {
    if (suggestionsInstanceId == null || recomputing) return;
    setRecomputing(true);
    try {
      const s = await recomputeApprovalSuggestions(suggestionsInstanceId);
      if (s.state === "pending" && s.bundle) {
        setApprovalBundles(suggestionBundles(s));
        setSuggestionsIgnored(false);
      } else {
        setSuggestionsIgnored(false);
      }
    } catch {
      toast({ title: t("notificationsUi.replacementApproval.genericError"), variant: "destructive" });
    } finally {
      setRecomputing(false);
    }
  };
  const [plannedExerciseIds, setPlannedExerciseIds] = useState<string[]>([]);
  const [isPlanningMode, setIsPlanningMode] = useState(false);
  const [savingTraining, setSavingTraining] = useState(false);
  const savedPlannedIdsRef = useRef<string[]>([]);

  // PAD-46: student cancels attendance from the class-detail view.
  const [cancelAttendanceOpen, setCancelAttendanceOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // PAD-684: the server's own answer, shown until the refetch lands (never invented).
  const [comeBackShown, setComeBackShown] = useState<ReturnType<typeof comeBackAction>>(null);
  const [openingChat, setOpeningChat] = useState(false);
  const navigate = useNavigate();
  const [cancellingAttendance, setCancellingAttendance] = useState(false);
  const [attendanceCancelled, setAttendanceCancelled] = useState(false);
  // PAD-567: the over-capacity warning before a cleared absence is saved.
  const [clearOverCapacity, setClearOverCapacity] = useState<{ filled: number; capacity: number } | null>(null);

  // PAD-73: student proactively declines a future class from the participants
  // section, before they would even have been reminded to confirm.

  useEffect(() => {
    if (!canManage) {
      setIsEditing(false);
      setDraft(null);
      setDeleteDialogOpen(false);
      setConfirmDeleteOpen(false);
      setEditScopeDialogOpen(false);
      setIsValidating(false);
    }
  }, [canManage, open]);

  useEffect(() => {
    if (!event) return;

    let mounted = true;

    // PAD-73: the optimistic "I just declined" flags belong to ONE class. Clear
    // them whenever the sheet switches classes, otherwise opening another class
    // right after declining would render it as already declined.
    setAttendanceCancelled(false);
    setCancelAttendanceOpen(false);

    async function load() {
      const data = await getClassInstance(event);
      if (!mounted) return;
      setClassInstance(data);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [event]);


  // PAD-548 (calendar.event-detail rule 17): the row shows the outcome the server answered.
  const applyInviteeAnswer = (inv: ClassInvitation, action: string, byCoach: boolean) => {
    const outcome = outcomeAfterCoachAction(action);
    if (outcome) {
      setLocalInvitations((prev) =>
        prev.map((row) =>
          row.id !== inv.id
            ? row
            : {
                ...row,
                outcome,
                status: statusForOutcome(outcome),
                answeredBy:
                  byCoach && (outcome === "accepted" || outcome === "declined") ? "coach" : row.answeredBy,
              }
        )
      );
    }
    if (action === "spot_filled") toast({ title: t("calendar.detail.inviteeClassFull") });
    else if (action === "expired") toast({ title: t("calendar.detail.inviteeClassOver") });
    if (outcome === "accepted" || outcome === "withdrawn") {
      // The roster changed, or the next candidate was asked: re-read the class, keeping the
      // invited section open.
      const ev = eventRef.current;
      if (ev) {
        keepInvitationsOpenRef.current = true;
        // A failed re-read never reaches the reset effect, so clear the flag here; a successful
        // one is consumed (and cleared) by that effect.
        getClassInstance(ev).then(setClassInstance).catch(() => {
          keepInvitationsOpenRef.current = false;
        });
      }
    }
  };

  const handleInviteeRespond = async (inv: ClassInvitation, action: "yes" | "no") => {
    setInviteeBusyId(inv.id);
    try {
      const result = await coachRespondToNotification(inv.id, action);
      applyInviteeAnswer(inv, result.action, true);
    } catch {
      toast({ title: t("calendar.detail.inviteeActionFailed"), variant: "destructive" });
    } finally {
      setInviteeBusyId(null);
    }
  };

  // PAD-548 (rule 18): the warning was confirmed; withdraw.
  const handleInviteeDelete = async () => {
    const inv = inviteeToDelete;
    setInviteeToDelete(null);
    if (!inv) return;
    setInviteeBusyId(inv.id);
    try {
      const result = await withdrawInvitation(inv.id);
      if (result.action === "confirmed") toast({ title: t("calendar.detail.inviteeAlreadyAccepted") });
      applyInviteeAnswer(inv, result.action, false);
    } catch {
      toast({ title: t("calendar.detail.inviteeActionFailed"), variant: "destructive" });
    } finally {
      setInviteeBusyId(null);
    }
  };

  useEffect(() => {
    if (!classInstance?.participants) return;

    const initial: AttendanceRecord = {};
    for (const p of classInstance.participants) {
      const existing = classInstance.presences?.find(
        (x) => x.playerId === p.id
      );
      initial[p.id] = {
        status: (existing?.status ?? null) as PresenceStatus | null,
        justification: existing?.justification as AbsenceJustification | undefined,
      };
    }
    setAttendance(initial);
    setIsValidating(false);
    setSavingAttendance(false);
    setLocalInvitations(classInstance.invitations ?? []);
    setInvitationsOpen(keepInvitationsOpenRef.current);
    keepInvitationsOpenRef.current = false;
    setApprovalBundles([]);
    answeredBundleIdsRef.current = new Set();
    setPlannedExerciseIds(classInstance.plannedExerciseIds ?? []);
    setIsPlanningMode(false);
    setCancelAttendanceOpen(false);
    setCancellingAttendance(false);
    setAttendanceCancelled(false);
  }, [classInstance?.id]);

  // Keep a live ref to event so SSE handlers don't go stale
  const eventRef = useRef<typeof event>(event);
  eventRef.current = event;

  // Same for the rendered invitation rows — the SSE handler needs to know
  // whether the answered invite is the row currently shown for that student.
  const invitationsRef = useRef(localInvitations);
  invitationsRef.current = localInvitations;
  // The open occurrence's id for the live handler (B-542): the fetched instance's own id,
  // else the event's — a virtual occurrence is materialised by the reminder that asks.
  const classInstanceRef = useRef(classInstance);
  classInstanceRef.current = classInstance;

  // Real-time updates via SSE — the student's reminder (B-542) and the coach's rows.
  useEffect(() => {
    if (!open || !token) return;

    // messaging.sse-realtime rule 15 (PAD-277): the tab's one shared stream.
    return subscribeAppEvents(token, (data) => {
      try {
        // B-542 (attendance.confirm rule 27): the coach's reminder for THIS occurrence just
        // landed — "Vou" lives in the fresh payload, so re-read the instance instead of
        // waiting for a re-open.
        const openEvent = eventRef.current;
        // B-548: `classInstance.id` is the calendar-event id ("lessoninstance-12"), never the
        // instance number, so it never matched an event's lessonInstanceId — the shared
        // reading takes it from a presence or the event instead.
        const openId = liveInstanceIdOf(classInstanceRef.current, openEvent);
        if (reminderArrivedFor(data, openId)) {
          if (openEvent) getClassInstance(openEvent).then(setClassInstance).catch(() => {});
          return;
        }
        if (!canManage) return;

        // PAD-659 (`calendar.event-detail` rule 24): a presence in this class moved — a
        // student's answer or cancellation, or a mark from another tab — so the groups regroup.
        const occurrence =
          openEvent?.model === "Lesson" ? { lessonId: openEvent.originalId, date: openEvent.date } : null;
        if (presenceChangedFor(data, openId, occurrence)) {
          if (openEvent) getClassInstance(openEvent).then(setClassInstance).catch(() => {});
          return;
        }

        // Player accepted / declined an invite → update badge in-place
        if (data.type === "notification_responded") {
          const { notificationEventId, response, lessonInstanceId } = data.payload;
          const matched = invitationsRef.current.some(
            (inv) => inv.id === notificationEventId
          );

          if (matched) {
            setLocalInvitations((prev) =>
              prev.map((inv) => {
                if (inv.id !== notificationEventId) return inv;
                // PAD-548 (rule 16): the row renders `outcome`; `status` is kept in step.
                const outcome = outcomeAfterResponse(response);
                if (!outcome) return inv;
                return { ...inv, outcome, status: statusForOutcome(outcome) };
              })
            );
          } else if (lessonInstanceId) {
            // The guest list holds one row per STUDENT (PAD-72), so the invite
            // that was answered may not be the row we're showing for them.
            // Re-fetch to pick up the newly-winning record.
            const ev = eventRef.current;
            if (ev) {
              const fetchEvent = { ...ev, model: "LessonInstance", originalId: Number(lessonInstanceId) };
              getClassInstance(fetchEvent as typeof ev)
                .then((updated) => setLocalInvitations(updated.invitations ?? []))
                .catch(() => {});
            }
          }
        }

        // PAD-131: a student asked to join, or the class filled and their
        // requests closed → re-fetch so the requests block is current.
        if (data.type === "join_request_created" || data.type === "join_requests_superseded" || data.type === "waiting_list_changed") {
          const ev = eventRef.current;
          if (ev) getClassInstance(ev).then(setClassInstance).catch(() => {});
        }

        // Notifications were sent (auto or manual) → re-fetch to show new entries
        if (data.type === "notify_sent") {
          const { lessonInstanceId } = data.payload;
          const ev = eventRef.current;
          if (!ev) return;
          // PAD-773: only this class's invitations; a batch sent for another class publishes too.
          if (openId == null || Number(lessonInstanceId) !== openId) return;
          const fetchEvent = { ...ev, model: "LessonInstance", originalId: Number(lessonInstanceId) };
          getClassInstance(fetchEvent as typeof ev).then((updated) => {
            setLocalInvitations(updated.invitations ?? []);
            setInvitationsOpen(true);
          }).catch(() => {});
        }
      } catch { /* a malformed payload must not break the sheet */ }
    });
  }, [open, canManage, token]);

  const active = draft ?? classInstance;
  const isCanceled = active?.status === "canceled";

  // PAD-551 (classes.instance-enrollment rule 13): the coach sets a player's side for this
  // occurrence (a virtual one is materialised on the server). The change may re-side open spots
  // and withdraw invitations for balance, so the whole class is re-read, not just the row.
  const [sideBusy, setSideBusy] = useState<string | null>(null);
  const changeSide = async (playerId: string, side: "left" | "right" | null) => {
    if (!classInstance) return;
    setSideBusy(playerId);
    try {
      await setPresenceSide(classInstance, playerId, side);
      if (event) setClassInstance(await getClassInstance(event));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast({
        title: t(status === 409 ? "calendar.side.ended" : "calendar.side.saveFailed"),
        variant: "destructive",
      });
    } finally {
      setSideBusy(null);
    }
  };
  // The one shape both the attendance rows and the participant popup read. A virtual occurrence has
  // no presence rows yet: the player starts on "Habitual".
  const sideFor = (playerId: string): SideInOccurrence | undefined => {
    if (!canManage || classInstance?.sideEditable === undefined) return undefined;
    const presence = classInstance.presences?.find((x) => String(x.playerId) === playerId);
    return {
      current: presence?.side ?? null,
      override: !!presence?.sideOverride,
      editable: !!classInstance.sideEditable && !isCanceled,
      busy: sideBusy === playerId,
      onChange: (next) => void changeSide(playerId, next),
    };
  };

  // PAD-131 (classes.join-requests rules 1, 4, 5, 7, 9): the student asks or
  // withdraws; the coach accepts (a manual add — a student who slipped below
  // the bar needs the same named-reason confirmation) or rejects.
  const refreshInstance = async () => {
    if (!event) return;
    try {
      setClassInstance(await getClassInstance(event));
    } catch {
      /* keep what we have */
    }
  };
  // PAD-672: "Pedir para entrar" and the waiting-list join both ask for the side first
  // (ClassSideChoice); the sheet sends and reports back through these callbacks.
  const handleSideRequestSent = async (request?: ClassJoinRequest) => {
    // PAD-672 slice 2 (join-requests rule 21): the coach's automatic acceptance took it at once, so
    // the student is enrolled already — say that, not "the coach was told", and re-read the class.
    if (joinRequestAcceptedAtOnce(request)) {
      toast({ title: t("calendar.joinRequest.acceptedNow") });
      void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    } else {
      toast({ title: t("calendar.joinRequest.sentTitle"), description: t("calendar.joinRequest.sentBody") });
    }
    await refreshInstance();
  };
  const handleSideWaitingJoined = (side: PlayerSide) => {
    if (!event) return;
    setJoinedWaitingFor(String(event.id));
    setJoinedWaitingSide(side);
    toast({ title: t("calendar.waitingList.joined") });
    void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    void refreshInstance();
  };
  const handleSideFailed = async (err: unknown, mode: "request" | "waiting") => {
    if (mode === "waiting") {
      toast({ title: t("calendar.waitingList.failed"), variant: "destructive" });
      return;
    }
    const refusal = joinRequestRefusal(err);
    toast({
      title: t("calendar.joinRequest.failed"),
      description: refusal ? t(`calendar.joinRequest.refusal.${refusal.code}`) : undefined,
      variant: "destructive",
    });
    await refreshInstance();
  };
  const handleWithdrawJoinRequest = async (id: number) => {
    setJoinBusy(true);
    try {
      await withdrawClassJoinRequest(id);
      toast({ title: t("calendar.joinRequest.withdrawn") });
    } catch {
      toast({ title: t("calendar.joinRequest.failed"), variant: "destructive" });
    } finally {
      await refreshInstance();
      setJoinBusy(false);
    }
  };
  const handleDecideJoinRequest = async (id: number, accept: boolean, confirm = false) => {
    const req = classInstance?.joinRequests?.find((r) => r.id === id);
    setJoinBusy(true);
    try {
      if (accept) await acceptClassJoinRequest(id, confirm);
      else await rejectClassJoinRequest(id);
      toast({
        title: t(accept ? "calendar.joinRequest.acceptedToast" : "calendar.joinRequest.rejectedToast", {
          name: req ? displayName(req.playerId, req.playerName) : "",
        }),
      });
    } catch (err) {
      const refusal = joinRequestRefusal(err);
      if (refusal?.code === "ineligible") {
        setJoinBusy(false);
        const side = sideGoneOf(refusal);
        setPendingAccept({
          id,
          ineligible: refusal.ineligible ?? [],
          sideGone: side ? { side, name: req ? displayName(req.playerId, req.playerName) : "" } : null,
        });
        return;
      }
      toast({
        title:
          refusal?.code === "spot_filled"
            ? t("calendar.joinRequest.spotFilledToast")
            : refusal?.code === "class_closed"
              ? t("calendar.joinRequest.classClosedToast")
              : t("calendar.joinRequest.decideFailed"),
        variant: "destructive",
      });
    } finally {
      await refreshInstance();
      setJoinBusy(false);
    }
  };

  const attendanceAlreadyMarked : boolean = (active?.presences?.length ?? 0) > 0;
  // PAD-335 (`classes.delete` rule 7): the delete dialogs say when the coach's
  // register goes with the class. Enrolment rows alone are not a register.
  const attendanceRecorded = hasRecordedAttendance(active?.presences);
  const deleteAttendanceNote = attendanceRecorded
    ? t("calendar.detail.deleteAttendanceNote")
    : undefined;

  if (!event || !classInstance || !players || !levels) return null;
  if (!active) return null;
  // PAD-771 (calendar.event-detail rule 5): the coach's participants header.
  const header = participantsHeader(effectiveFilledSpotsOf(active.participants, active.presences), active.maxPlayers);

  const canApplyScope = event?.isRecurring === true

  // PAD-46: resolve the real LessonInstance id to cancel against. Prefer the id
  // carried on the student's own presence (works for recurring lessons that were
  // materialized on confirmation); fall back to the event's originalId when the
  // event already points at a LessonInstance.
  const cancelInstanceId = (() => {
    const fromPresence = classInstance?.presences?.[0]?.lessonInstanceId;
    if (fromPresence != null) return Number(fromPresence);
    if (event?.model === "LessonInstance") return Number(event.originalId);
    return null;
  })();
  // PAD-288 / PAD-282 (`attendance.confirm` rules 18 and 20): when the
  // occurrence has no instance row yet, address it the way the calendar event
  // does — the server materialises it and then cancels.
  const cancelTarget: number | { model: string; originalId: string | number; date: string } | null =
    cancelInstanceId != null
      ? cancelInstanceId
      : event
        ? { model: event.model, originalId: event.originalId, date: active.date }
        : null;

  // PAD-46: a STUDENT viewer (canManage=false) is enrolled in this instance iff
  // they appear in participants — the serializer only ever returns the viewer's
  // own player for a student, so a non-empty list means "I'm a participant".
  // Club digits on both sides (attendance.confirm rule 9, PAD-295).
  const classStartMs = wallClockMs(active.date, active.startTime);
  const classStarted = !Number.isNaN(classStartMs) && classStartMs <= lisbonNowMs();
  // PAD-663 (rule 25): until the class ends, a coach's validated mark is worded as intent.
  const classEnded = classHasEnded(active.date, active.endTime);
  const isStudentParticipant =
    !canManage &&
    event?.type === "class" &&
    !isCanceled &&
    (active.participants?.length ?? 0) > 0;
  // Deadline-aware messaging: at/after (start - cancellationDeadlineHours) but
  // before start → "late cancellation" warning (still allowed).
  const cancellationDeadlineMs = active.cancellationDeadline
    ? wallClockISOMs(active.cancellationDeadline)
    : NaN;
  const isLateCancellation =
    !Number.isNaN(cancellationDeadlineMs) && lisbonNowMs() >= cancellationDeadlineMs;
  // PAD-73: the student's own presence row. The serializer only ever returns the
  // viewer's own presence for a student, so `presences[0]` IS "my presence".
  // Deriving the declined state from it (rather than from local component state)
  // is what makes the "not attending" badge survive a reload — there is no extra
  // column and no extra request behind it.
  const ownPresence = !canManage ? classInstance?.presences?.[0] : undefined;
  const declinedOnServer =
    ownPresence?.status === "absent" && ownPresence?.justification === "justified";
  const hasDeclined = attendanceCancelled || declinedOnServer;

  // PAD-313 rule 25: `canDeclineProactively` is no longer a render condition —
  // it only ever chose between two identical buttons. The server still computes
  // it and still classifies the decline; the client uses the `proactive` key of
  // the reply for the toast.
  const canCancelAttendance =
    isStudentParticipant &&
    !classStarted &&
    !hasDeclined;

  const startEdit = () => {
    if (!canManage || !onEdit) return;
    setIsEditing(true);
    setIsValidating(false);
    setDraft(structuredClone(classInstance));
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setDraft(null);
  };

  const saveEdit = () => {
    // B-275 (PAD-508): a cleared native time input reads ""; never send it (the server would refuse it).
    if (draft && (!isHhMm(draft.startTime) || !isHhMm(draft.endTime))) {
      toast({
        variant: "destructive",
        title: t("calendar.addClass.missingFieldsTitle"),
        description: t("calendar.addClass.missingFieldsDescription", { fields: t("calendar.addClass.fieldTime") }),
      });
      return;
    }
    // PAD-508 (classes.edit rule 7b): a typed end at or before the start is never sent.
    if (draft && !endsAfterStart(draft.startTime, draft.endTime)) {
      toast({
        variant: "destructive",
        title: t("calendar.addClass.missingFieldsTitle"),
        description: t("calendar.addClass.endBeforeStart"),
      });
      return;
    }
    // PAD-99: warn (non-blocking) when the edited date/time overlaps another
    // event on the same day. Only check when the timing actually changed, so
    // editing a name/participants on an already-overlapping class doesn't nag.
    const timingChanged =
      !!draft &&
      !!classInstance &&
      ((draft.date ?? "").slice(0, 10) !== (classInstance.date ?? "").slice(0, 10) ||
        draft.startTime !== classInstance.startTime ||
        draft.endTime !== classInstance.endTime);

    if (timingChanged && draft) {
      const conflict = findOverlappingEvent(
        { date: draft.date, startTime: draft.startTime, endTime: draft.endTime },
        existingEvents,
        event?.id
      );
      if (conflict) {
        setOverlapConfirmOpen(true);
        return;
      }
    }

    proceedSaveEdit();
  };

  const proceedSaveEdit = () => {
    setOverlapConfirmOpen(false);
    if (canApplyScope) {
      setEditScopeDialogOpen(true);
    } else {
      commitEdit("single");
    }
  };

  function diffInstance<T extends Record<string, any>>(
    original: T,
    updated: T,
    fields: readonly (keyof T)[]
  ): Partial<T> {
    const diff: Partial<T> = {};
    for (const field of fields) {
      if (JSON.stringify(original[field]) !== JSON.stringify(updated[field])) {
        diff[field] = updated[field];
      }
    }
    return diff;
  }

  function diffParticipants(
    original: { id: string }[],
    updated: { id: string }[]
  ) {
    const originalIds = new Set(original.map((p) => p.id));
    const updatedIds = new Set(updated.map((p) => p.id));

    const addPlayers = [...updatedIds].filter((id) => !originalIds.has(id));
    const removePlayers = [...originalIds].filter((id) => !updatedIds.has(id));

    return { addPlayers, removePlayers };
  }

  const EDITABLE_FIELDS = [
    "name",
    "date",
    "startTime",
    "endTime",
    "color",
    "maxPlayers",
    "levelId",
    "courtId",
    "recurrenceEnd",
    "notificationsEnabled",
    // PAD-129: the eligibility tier this sheet addresses (null / [] / rules).
    "eligibilityRules",
    // PAD-130: the open-spot toggle at this tier (null / true / false).
    "openSpotsVisible",
    // PAD-429 (notifications.toggle-class rule 7): the auto-invites tri-state
    // at this tier (null / true / false).
    "autoInvites",
  ] as const;

  /** classes.edit rule 10: unsaved means different from the loaded class, by value — the same
   *  comparison the save makes (fields of EDITABLE_FIELDS plus the participant diff). */
  const hasUnsavedEdit = () =>
    isEditing && !!draft && !!classInstance &&
    hasUnsavedClassEdit(
      classInstance as unknown as Record<string, unknown> & { participants?: { id: string }[] },
      draft as unknown as Record<string, unknown> & { participants?: { id: string }[] },
      EDITABLE_FIELDS as unknown as readonly string[]
    );

  /** classes.edit rule 10 (PAD-525): every close of the sheet (X, Escape, click outside) comes
   *  through here. With an unsaved draft it asks first; otherwise it ends edit mode and closes.
   *  There is no Save in the question — a save has its own sequence (scope, overlap, eligibility). */
  const requestClose = () => {
    if (hasUnsavedEdit()) {
      setDiscardAskOpen(true);
      return;
    }
    setIsEditing(false);
    setDraft(null);
    onClose();
  };

  const discardAndClose = () => {
    setDiscardAskOpen(false);
    setIsEditing(false);
    setDraft(null);
    onClose();
  };

  /** The save itself, once any eligibility warning has been answered. */
  const finalizeEdit = (changes: Record<string, unknown>, scope: ApplyScope) => {
    if (!onEdit || !event) return;
    setEditScopeDialogOpen(false);
    setIsEditing(false);
    onEdit(event, changes, scope);
    setDraft(null);
  };

  const commitEdit = async (scope: ApplyScope) => {
    if (!canManage || !onEdit) return;
    if (!draft || !event || !classInstance) return;

    const changes = diffInstance(classInstance, draft, EDITABLE_FIELDS);
    const { addPlayers, removePlayers } = diffParticipants(
      classInstance.participants,
      draft.participants
    );

    if (addPlayers.length > 0) (changes as any).addPlayers = addPlayers;
    if (removePlayers.length > 0) (changes as any).removePlayers = removePlayers;

    if (Object.keys(changes).length === 0) {
      setDraft(null);
      setIsEditing(false);
      return;
    }

    // PAD-150 (eligibility.enforcement rules 6, 7, 7d): adding students by
    // hand asks first when the bar says no — and names why. A failed check
    // never blocks the save: the warning is a courtesy, the enrolment is the
    // coach's.
    if (addPlayers.length > 0) {
      try {
        const { ineligible: failing } = await checkEligibility(
          event.model,
          String(event.originalId),
          event.date,
          addPlayers
        );
        if (failing.length > 0) {
          setEditScopeDialogOpen(false);
          setIneligible(failing);
          setPendingEdit({ changes: changes as Record<string, unknown>, scope });
          return;
        }
      } catch {
        // Fall through: rule 6 warns, it never blocks.
      }
    }

    finalizeEdit(changes as Record<string, unknown>, scope);
  };

  const handleDeleteClick = () => {
    if (!canManage || !onDelete) return;
    if (!event) return;

    if (canApplyScope) {
      // Recurring class: the scope dialog (single / whole series) already acts
      // as the confirmation step.
      setDeleteDialogOpen(true);
    } else {
      // Non-recurring class: require an explicit confirm before deleting.
      setConfirmDeleteOpen(true);
    }
  };

  const togglePlayer = (playerId: string) => {
    if (!draft) return;

    setDraft({
      ...draft,
      participants: draft.participants.some((p) => String(p.id) === String(playerId))
        ? draft.participants.filter((p) => String(p.id) !== String(playerId))
        : [
            ...draft.participants,
            {
              id: playerId,
              user: players.find((p) => String(p.playerId) === String(playerId))!,
            } as any,
          ],
    });
  };

  const handleAttendanceChange = (playerId: string, state: AttendanceState) => {
    setAttendance((prev) => ({
      ...prev,
      [playerId]: state,
    }));
  };

  const handleConfirmAttendance = async (force = false) => {
    if (!classInstance) return;
    if (!classInstance.participants?.length) return;

    const payload = classInstance.participants
      .map((p) => ({
        playerId: p.id,
        status: attendance[p.id]?.status,
        justification: attendance[p.id]?.justification,
      }))
      .filter((x) => x.status !== null) as Array<{
      playerId: string;
      status?: PresenceStatus;
      justification?: AbsenceJustification;
      clear?: true;
    }>;
    // PAD-567 (attendance.validation rule 26): rows the coach cleared back to "no answer".
    const serverRows = classInstance.presences ?? [];
    const clears = clearsFor(serverRows, attendance);
    for (const playerId of clears) payload.push({ playerId, clear: true });
    if (payload.length === 0) return;
    // A cleared absence takes its seat back; when the class is already full the
    // coach is warned and may go ahead (owner decision, 2026-10-09).
    const absentClears = clearsFor(serverRows, attendance, { absencesOnly: true });
    if (!force && absentClears.length > 0) {
      const filledNow = effectiveFilledSpotsOf(active.participants, serverRows);
      const capacity = active.maxPlayers ?? 0;
      if (capacity > 0 && filledNow >= capacity) {
        setClearOverCapacity({ filled: filledNow + absentClears.length, capacity });
        return;
      }
    }

    setSavingAttendance(true);

    try {
      const {
        presences: updatedPresences,
        notifiedPlayers,
        invitationsQueued,
        approvalBundle: bundle,
      } = await confirmClassPresences(classInstance, payload);

      setClassInstance((prev) =>
        prev ? { ...prev, presences: updatedPresences } : prev
      );

      if (bundle) {
        // Semi-automatic mode: invitations await coach approval
        setApprovalBundles((prev) => [...prev.filter((b) => b.bundleId !== bundle.bundleId), bundle]);
        toast({
          title: t("calendar.detail.attendanceSavedTitle"),
          description: t("calendar.detail.approvalNeededDescription"),
        });
      } else if (notifiedPlayers.length > 0 && event && updatedPresences.length > 0) {
        // Fetch by the actual LessonInstance ID from presences (works even for
        // recurring lessons that were just materialized during confirmation)
        const instanceId = Number(updatedPresences[0].lessonInstanceId);
        const fetchEvent = { ...event, model: "LessonInstance", originalId: instanceId };
        const updated = await getClassInstance(fetchEvent as typeof event);
        setLocalInvitations(updated.invitations ?? []);
        setInvitationsOpen(true);
        const n = notifiedPlayers.length;
        toast({
          title: t("calendar.detail.attendanceSavedTitle"),
          description: t("calendar.detail.invitesSentDescription", { count: n }),
        });
      } else if (invitationsQueued) {
        // PAD-733: the server sends the invitations right after answering.
        toast({
          title: t("calendar.detail.attendanceSavedTitle"),
          description: t("calendar.detail.invitesQueuedDescription"),
        });
      } else {
        toast({ title: t("calendar.detail.attendanceSavedTitle") });
      }

      setIsValidating(false);
    } catch {
      toast({
        variant: "destructive",
        title: t("calendar.detail.failedSaveAttendance"),
      });
    } finally {
      setSavingAttendance(false);
    }
  };

  const startPlanning = () => {
    savedPlannedIdsRef.current = [...plannedExerciseIds];
    setIsPlanningMode(true);
  };

  const cancelPlanning = () => {
    setPlannedExerciseIds(savedPlannedIdsRef.current);
    setIsPlanningMode(false);
  };

  const handleSaveTraining = async () => {
    if (!classInstance) return;
    setSavingTraining(true);
    try {
      const { plannedExerciseIds: saved } = await confirmClassTraining(classInstance, plannedExerciseIds);
      setPlannedExerciseIds(saved);
      setIsPlanningMode(false);
      toast({ title: t("calendar.detail.trainingSaved") });
    } catch {
      toast({ variant: "destructive", title: t("calendar.detail.failedSaveTraining") });
    } finally {
      setSavingTraining(false);
    }
  };

  // PAD-570 (attendance.confirm rule 27): "Vou" is offered on the SERVER's
  // `pendingConfirmation` — asked (the reminder instant, or a reminder sent by
  // hand), still `planned`, not started — and never on a date derived here.
  // Rule 28: `not_coming` is final; the PAD-315 come-back that lived here is gone.
  const ownState = attendanceStateOf(ownPresence);
  const canConfirm =
    isStudentParticipant &&
    canConfirmAttendance({
      state: ownState,
      pendingConfirmation: classInstance?.pendingConfirmation,
      classStarted,
    });
  const ownInstanceId = Number(ownPresence?.lessonInstanceId);
  // PAD-684 (attendance.confirm rule 28): "Afinal vou" - the SERVER's `comeBack` decides.
  const comeBackKind = comeBackShown ?? comeBackAction(classInstance?.comeBack, ownState);

  const handleConfirmMyAttendance = async () => {
    if (!Number.isFinite(ownInstanceId) || confirming) return;
    setConfirming(true);
    try {
      const answer = await respondToReminder(ownInstanceId, "yes");
      const outcome = reminderAnswerOutcome(answer);
      const shown = comeBackFromAnswer(answer);
      if (shown) setComeBackShown(shown);
      if (outcome.record === "confirmed") {
        toast({ title: t("calendar.detail.confirmAttendanceDone") });
      } else if (outcome.messageKey) {
        toast({
          title: t(outcome.messageKey),
          variant: outcome.tone === "error" ? "destructive" : "default",
        });
      }
      // Either way the server is the truth: re-read rather than paint.
      await refreshInstance();
      setComeBackShown(null);
    } catch {
      toast({ variant: "destructive", title: t("messages.somethingWentWrong") });
    } finally {
      setConfirming(false);
    }
  };

  // PAD-684 rule 28: no spot left - the PAD-547 / PAD-577 join for THIS occurrence.
  const handleComeBackWaitingList = async () => {
    if (!event || joinBusy) return;
    setJoinBusy(true);
    try {
      const place = await joinClassWaitingList(event);
      if ((place as { onWaitingList?: boolean } | null)?.onWaitingList) setComeBackShown("on_waiting_list");
      toast({ title: t("calendar.waitingList.joined") });
      void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      await refreshInstance();
      setComeBackShown(null);
    } catch {
      toast({ title: t("calendar.waitingList.failed"), variant: "destructive" });
    } finally {
      setJoinBusy(false);
    }
  };

  // PAD-570 rule 28: the way forward after "Não vou" is the coach's chat.
  const openCoachChat = async () => {
    const coachUserId = classInstance?.coachUserId;
    if (!coachUserId || openingChat) return;
    setOpeningChat(true);
    try {
      const conversation = await createConversation({ otherParticipants: [String(coachUserId)] });
      navigate(`/messages/${conversation.id}`);
    } catch {
      toast({ variant: "destructive", title: t("messages.somethingWentWrong") });
    } finally {
      setOpeningChat(false);
    }
  };

  const handleCancelAttendance = async () => {
    if (cancelTarget == null || cancellingAttendance) return;
    setCancellingAttendance(true);
    try {
      // PAD-313 rule 25: the SERVER says which kind of decline this was; the
      // client never decided it, and no longer pretends to by drawing a
      // different button.
      const result = await cancelAttendance(cancelTarget);
      setAttendanceCancelled(true);
      setCancelAttendanceOpen(false);
      toast({
        title: result?.proactive
          ? t("calendar.detail.proactiveDeclineDone")
          : t("calendar.detail.attendanceCancelled"),
      });
      // Rule 20: re-read the payload — it now resolves to the materialised
      // instance and carries the student's presence.
      await refreshInstance();
    } catch {
      // 409 (class already started) and any other failure surface the same
      // graceful error toast.
      toast({
        variant: "destructive",
        title: t("calendar.detail.cancelAttendanceFailed"),
      });
    } finally {
      setCancellingAttendance(false);
    }
  };

  // PAD-73: proactive decline. Same endpoint as the plain cancel — the server
  // classifies which kind of decline it was and reports it back in `proactive`,
  // so this handler never has to reason about the reminder cutoff itself.
  // PAD-313 rule 25: `handleProactiveDecline` is gone — it called the same
  // endpoint with the same payload as `handleCancelAttendance`.

  if (showEvaluations && evaluationsRef && evaluationsAction === "available") {
    return (
      <Sheet open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("players.classEvaluations.title", { name: active.name })}</SheetTitle>
          </SheetHeader>
          <ClassEvaluationsPanel classRef={evaluationsRef} className={active.name} onBack={() => setShowEvaluations(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="flex-1 min-w-0">
              {isEditing ? (
                <Input
                  data-testid="class-edit-name"
                  value={active.name}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, name: e.target.value } : d))
                  }
                />
              ) : (
                <span className="truncate" data-testid="class-detail-title">{active.name}</span>
              )}
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* 2×2 Info Blocks */}
          <div className="grid grid-cols-2 gap-3">
            {/* Date */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{t("calendar.detail.date")}</span>
              </div>
              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    type="date"
                    value={active.date}
                    className="h-8 text-sm"
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, date: e.target.value } : d))
                    }
                  />
                  {active.recurrenceEnd && !active.parentClassId && (
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">{t("calendar.detail.until")}</span>
                      <Input
                        type="date"
                        value={active.recurrenceEnd}
                        className="h-8 text-sm"
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, recurrenceEnd: e.target.value } : d
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium">
                    {format(parseISODate(active.date), "EEE, d MMM", { locale: dateFnsLocale(i18n.language) })}
                  </p>
                  {active.recurrenceEnd && !active.parentClassId && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("calendar.detail.untilDate", { date: format(parseISODate(active.recurrenceEnd), "d MMM", { locale: dateFnsLocale(i18n.language) }) })}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Time */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{t("calendar.detail.time")}</span>
              </div>
              {isEditing ? (
                <div className="space-y-1">
                  {/* PAD-508 (classes.edit rule 7b): the same never-empty field as the new-class sheet. */}
                  <TimeSelect
                    data-testid="class-detail-start-time"
                    aria-label={t("calendar.addClass.timeStart")}
                    value={active.startTime}
                    onChange={(startTime) =>
                      setDraft((d) =>
                        d ? { ...d, startTime, endTime: endAfterStartMove(d.startTime, d.endTime, startTime) } : d
                      )
                    }
                  />
                  <TimeSelect
                    data-testid="class-detail-end-time"
                    aria-label={t("calendar.addClass.timeEnd")}
                    value={active.endTime}
                    from={active.startTime}
                    onChange={(endTime) => setDraft((d) => (d ? { ...d, endTime } : d))}
                    // PAD-559 (rule 8c): an end typed at or before the start is refused in the field.
                    onRefused={() =>
                      toast({
                        variant: "destructive",
                        title: t("calendar.addClass.missingFieldsTitle"),
                        description: t("calendar.addClass.endBeforeStart"),
                      })
                    }
                  />
                </div>
              ) : (
                <p className="text-sm font-medium">
                  {active.startTime} – {active.endTime}
                </p>
              )}
            </div>

            {/* Capacity */}
            <div data-testid="class-detail-capacity" className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{t("calendar.detail.capacity")}</span>
              </div>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      setDraft((d) =>
                        d ? { ...d, maxPlayers: Math.max(1, d.maxPlayers - 1) } : d
                      )
                    }
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold">
                    {active.maxPlayers}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      setDraft((d) => (d ? { ...d, maxPlayers: d.maxPlayers + 1 } : d))
                    }
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div>
                  {(() => {
                    // PAD-71: shared with the calendar event card's X/Y badge
                    // (backend `LessonInstance.effective_filled_spots`).
                    // B-240: over the listed students only, so an edit's unticked
                    // declined student is not subtracted (calendar.event-detail rule 5).
                    const effectiveFilled = effectiveFilledSpotsOf(
                      active.participants,
                      active.presences
                    );
                    const openSpots = active.maxPlayers - effectiveFilled;
                    const pendingInvites = localInvitations.filter(inv => inv.status === "sent" || inv.status === "queued").length;
                    return (
                      <>
                        <p className="text-sm font-medium">{effectiveFilled}/{active.maxPlayers}</p>
                        {openSpots > 0 && (
                          <p className="text-xs text-muted-foreground">{pendingInvites > 0 ? t("calendar.detail.openSpotsPending", { count: openSpots, pending: pendingInvites }) : t("calendar.detail.openSpots", { count: openSpots })}</p>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Level */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="text-xs font-medium">{t("calendar.detail.level")}</span>
              </div>
              {isEditing ? (
                <Select
                  value={active.levelId ?? ""}
                  onValueChange={(value) =>
                    setDraft((d) => (d ? { ...d, levelId: value || null } : d))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={t("calendar.detail.selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {levels.map((level) => (
                      <SelectItem key={level.id} value={level.id}>
                        <LevelLabel code={level.code} label={level.label} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm font-medium">
                  {levels.find((l) => l.id === active.levelId)?.code ?? "—"}
                </p>
              )}
            </div>

            {/* Club · Court (clubs.courts rule 7, PAD-194) */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1" data-testid="class-detail-place">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="text-xs font-medium">{t("calendar.detail.club")}</span>
              </div>
              {isEditing && courts.length > 0 ? (
                <Select
                  value={active.courtId ? String(active.courtId) : "none"}
                  onValueChange={(value) =>
                    setDraft((d) => (d ? { ...d, courtId: value === "none" ? null : Number(value) } : d))
                  }
                >
                  <SelectTrigger className="h-8 text-sm" data-testid="class-detail-court">
                    <SelectValue placeholder={t("calendar.detail.noCourt")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("calendar.detail.noCourt")}</SelectItem>
                    {courts.map((court) => (
                      <SelectItem key={court.id} value={String(court.id)} data-testid={`class-detail-court-option-${court.id}`}>
                        {court.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm font-medium">
                  {active.clubName ?? "—"}
                  {active.courtName ? ` · ${active.courtName}` : ""}
                </p>
              )}
            </div>
          </div>

          {/* Auto notifications */}
          {/* PAD-793 (classes.create rule 6b): shown whatever the coach's engine state. */}
          {canManage && event?.type === "class" && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <span className="text-sm font-medium">{t("calendar.detail.autoNotifications")}</span>
                    <p className="text-xs text-muted-foreground">{t("calendar.detail.autoNotificationsDescription")}</p>
                  </div>
                </div>
                <Switch
                  checked={active.notificationsEnabled ?? false}
                  onCheckedChange={(checked) =>
                    setDraft((d) => d ? { ...d, notificationsEnabled: checked } : d)
                  }
                  disabled={!isEditing}
                />
              </div>
            </div>
          )}

          {/* PAD-129: which eligibility tier applies, and the override editor in edit mode */}
          {canManage && event?.type === "class" && active && (
            <ClassEligibilityBlock
              current={active.eligibilityRules ?? null}
              effective={active.effectiveEligibilityRules ?? null}
              source={active.eligibilitySource ?? "coach"}
              editing={isEditing}
              onChange={(eligibilityRules) =>
                setDraft((d) => (d ? { ...d, eligibilityRules } : d))
              }
              openSpots={active.openSpotsVisible ?? null}
              effectiveOpenSpots={active.effectiveOpenSpotsVisible ?? false}
              openSpotsSource={active.openSpotsSource ?? "coach"}
              onOpenSpotsChange={(openSpotsVisible) =>
                setDraft((d) => (d ? { ...d, openSpotsVisible } : d))
              }
              autoInvites={active.autoInvites ?? null}
              effectiveAutoInvites={active.effectiveAutoInvites ?? false}
              autoInvitesSource={active.autoInvitesSource ?? "type"}
              onAutoInvitesChange={(autoInvites) =>
                setDraft((d) => (d ? { ...d, autoInvites } : d))
              }
            />
          )}

          {/* Color — only in edit mode */}
          {isEditing && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <span className="text-xs font-medium text-muted-foreground">{t("calendar.detail.color")}</span>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setDraft((d) => (d ? { ...d, color } : d))}
                    className={cn(
                      "w-7 h-7 rounded-full transition-all",
                      active.color === color && "ring-2 ring-offset-2 ring-primary"
                    )}
                    style={{ backgroundColor: color }}
                    type="button"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recurring — only in edit mode */}
          {isEditing && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Repeat className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">{t("calendar.detail.recurring")}</span>
                </div>
                <Switch
                  checked={active.isRecurring ?? false}
                  onCheckedChange={(checked) =>
                    setDraft((d) => d ? { ...d, isRecurring: checked } : d)
                  }
                />
              </div>
              {active.isRecurring && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{t("calendar.detail.daysOfWeek")}</span>
                    <div className="flex gap-1">
                      {[
                        { value: 1, label: "M" },
                        { value: 2, label: "T" },
                        { value: 3, label: "W" },
                        { value: 4, label: "T" },
                        { value: 5, label: "F" },
                        { value: 6, label: "S" },
                        { value: 0, label: "S" },
                      ].map(({ value, label }) => {
                        const days: number[] = (active as any).recurrenceRule?.daysOfWeek ?? [];
                        const isSelected = days.includes(value);
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              setDraft((d) => {
                                if (!d) return d;
                                const current: number[] = (d as any).recurrenceRule?.daysOfWeek ?? [];
                                const updated = isSelected
                                  ? current.filter((x) => x !== value)
                                  : [...current, value];
                                return {
                                  ...d,
                                  recurrenceRule: { ...(d as any).recurrenceRule, frequency: "weekly", daysOfWeek: updated },
                                };
                              })
                            }
                            className={cn(
                              "w-8 h-8 rounded-full text-xs font-medium transition-colors",
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted hover:bg-muted-foreground/10"
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{t("calendar.detail.endDate")}</span>
                    <Input
                      type="date"
                      value={active.recurrenceEnd ?? ""}
                      className="h-8 text-sm"
                      onChange={(e) =>
                        setDraft((d) => d ? { ...d, recurrenceEnd: e.target.value } : d)
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-2">
              {canManage && !isEditing && !isValidating ? (
                // PAD-771 (rule 5's named exception): the filled spots over the capacity and how
                // many are open; a not-coming student frees their spot here too.
                <div className="flex flex-col gap-0.5">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    {t("calendar.participants.title")}
                  </h4>
                  <p data-testid="participants-enrolled" className="text-[13px] text-muted-foreground tabular-nums">
                    {t(header.key, header.values)}
                  </p>
                </div>
              ) : (
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                {t("calendar.detail.participantsCount", {
                  label: isValidating ? t("calendar.detail.attendance") : t("calendar.detail.participants"),
                  // PAD-313 (`calendar.event-detail` rule 5): ONE meaning for the
                  // count on this sheet. The header reads `effectiveFilledSpotsOf`
                  // and this list read `participants.length`, so a cancelled
                  // student made the two contradict each other — "0/4, 4 open"
                  // above "Participants (1/4)". A not-coming student is listed,
                  // visibly not coming, and not counted as filling a spot.
                  current: effectiveFilledSpotsOf(active.participants, active.presences),
                  max: active.maxPlayers,
                })}
              </h4>
              )}

              {canManage &&
                !isEditing &&
                !isValidating &&
                !isCanceled &&
                active.participants.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    data-testid="attendance-edit"
                    onClick={() => setIsValidating(true)}
                  >
                    {attendanceAlreadyMarked ? t("calendar.detail.editAttendance") : t("calendar.detail.markAttendance")}
                  </Button>
                )}
            </div>

            {isEditing ? (
              <PlayerSelector
                players={players}
                levels={levels}
                selectedPlayerIds={active.participants.map((p: any) => p.id)}
                classLevelId={active.levelId}
                onToggle={togglePlayer}
              />
            ) : canManage && !isValidating && active.participants.length > 0 ? (
              // PAD-659 (`calendar.event-detail` rule 22): the coach's read view.
              <ParticipantGroups
                participants={active.participants}
                presences={classInstance?.presences}
                roster={players}
                onOpen={(row, opener) => {
                  setPopupOpener(opener);
                  setPopupRow(row);
                }}
              />
            ) : (
              <div className="space-y-2">
                {active.participants.map((p) => {
                  const presence = classInstance?.presences?.find(
                    (x) => x.playerId === p.id
                  );
                  return (
                    <AttendanceRow
                      key={p.id}
                      player={p}
                      attendance={attendance[p.id] || { status: null }}
                      onChange={(state) => handleAttendanceChange(p.id, state)}
                      disabled={!isValidating || isCanceled}
                      // PAD-313 rule 25: the row reads ONE state from the
                      // presence. A student is only ever served their own
                      // presence, so `!canManage` identifies their own row.
                      presence={presence}
                      audience={canManage ? "coach" : "student"}
                      side={sideFor(String(p.id))}
                      classEnded={classEnded}
                    />
                  );
                })}

                {active.participants.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("calendar.detail.noParticipants")}
                  </p>
                )}

                {/* PAD-313 rule 25: the student's own state is the ONE state word
                    on their participant row above. The "not attending /
                    justified absence" panel that used to sit here, and the
                    separate "I can't attend" button beside it, were two more
                    renderings of the same fact — the founder read three at once.
                    The single cancel action lives in the action area below. */}
              </div>
            )}
          </div>

          {/* PAD-131: a student outside the class asks for the open spot
              (rule 1) or withdraws their pending ask (rule 4). */}
          {!canManage &&
            !isEditing &&
            !isCanceled &&
            !classStarted &&
            !isStudentParticipant &&
            event.studentRelation !== "full" &&
            event.studentRelation !== "waiting" &&
            (event.openSpot || active.myJoinRequest) && (
              <div
                className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                data-testid="class-join-request"
              >
                {active.myJoinRequest?.status === "pending" ? (
                  <>
                    {active.myJoinRequest.side ? (
                      <div className="space-y-1" data-testid="class-join-request-sent">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{t("calendar.sidePick.sentTitle")}</p>
                          <Badge
                            variant="outline"
                            className="border-warning/40 bg-warning/10 text-warning-strong"
                            data-testid="class-join-request-sent-badge"
                          >
                            {t("calendar.sidePick.sentBadge")}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground" data-testid="class-join-request-sent-line">
                          {event.coachName
                            ? t("calendar.sidePick.sentLine", {
                                side: t(sideWordKey(active.myJoinRequest.side)),
                                coach: firstAndLastName(event.coachName),
                              })
                            : t("calendar.sidePick.sentLineNoCoach", {
                                side: t(sideWordKey(active.myJoinRequest.side)),
                              })}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm font-medium">{t("calendar.joinRequest.pending")}</p>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      disabled={joinBusy}
                      onClick={() => handleWithdrawJoinRequest(active.myJoinRequest!.id)}
                      data-testid="class-join-withdraw"
                    >
                      {t("calendar.sidePick.cancelRequest")}
                    </Button>
                  </>
                ) : (
                  <>
                    {active.myJoinRequest && active.myJoinRequest.status !== "withdrawn" && (
                      <p className="text-xs text-muted-foreground">
                        {t(`calendar.joinRequest.${active.myJoinRequest.status}`)}
                      </p>
                    )}
                    {event.openSpot && (
                      <>
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={joinBusy}
                          onClick={() => setSideSheet("request")}
                          data-testid="class-join-request-button"
                        >
                          {t("calendar.joinRequest.request")}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          {event.coachName
                            ? t("calendar.joinRequest.requestHint", { coach: event.coachName })
                            : t("calendar.joinRequest.requestHintNoCoach")}
                        </p>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

          {/* PAD-664: a full class the student is not in — join its waiting list; one they
              already wait for says so instead of offering the button. */}
          {!canManage &&
            !isEditing &&
            !isCanceled &&
            !classStarted &&
            !isStudentParticipant &&
            (event.studentRelation === "waiting" || joinedWaitingFor === String(event.id) ? (
              <div
                className="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2"
                data-testid="class-waiting-list-student"
              >
                {joinedWaitingSide ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium" data-testid="class-waiting-list-on">
                        {t("calendar.sidePick.waitingTitle")}
                      </p>
                      <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-strong">
                        {t("calendar.sidePick.waitingBadge")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground" data-testid="class-waiting-list-side-line">
                      {t("calendar.sidePick.waitingLine", { side: t(sideWordKey(joinedWaitingSide)) })}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium" data-testid="class-waiting-list-on">
                      {t("calendar.waitingList.on")}
                    </p>
                    <p className="text-xs text-muted-foreground">{t("calendar.waitingList.onHint")}</p>
                  </>
                )}
              </div>
            ) : event.studentRelation === "full" ? (
              <div
                className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                data-testid="class-waiting-list-student"
              >
                <p className="text-xs text-muted-foreground">{t("calendar.waitingList.fullHint")}</p>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={joinBusy}
                  onClick={() => setSideSheet("waiting")}
                  data-testid="class-waiting-list-join"
                >
                  {t("calendar.waitingList.join")}
                </Button>
              </div>
            ) : null)}

          {/* PAD-131 (rules 5, 7, 9): the coach decides each pending request. */}
          {canManage && !isEditing && (active.joinRequests?.length ?? 0) > 0 && (
            <>
              <Separator />
              <div className="space-y-1" data-testid="class-join-requests">
                <p className="text-sm font-medium py-1">
                  {t("calendar.joinRequest.coachTitle", { count: active.joinRequests!.length })}
                </p>
                {active.joinRequests!.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-2 py-1"
                    data-testid="class-join-request-row"
                  >
                    <div className="min-w-0">
                      <span className="text-sm truncate block">{displayName(req.playerId, req.playerName)}</span>
                      {/* PAD-358 (classes.academy-class-booking rule 5): the student's note. */}
                      {req.note && (
                        <p
                          className="text-xs text-muted-foreground break-words"
                          data-testid="class-join-request-note"
                        >
                          {req.note}
                        </p>
                      )}
                      {/* PAD-672 (rule 20): the side asked for + "Usar … no perfil". */}
                      <JoinRequestSide request={req} />
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={joinBusy}
                        onClick={() => handleDecideJoinRequest(req.id, false)}
                        data-testid="class-join-reject"
                      >
                        {t("calendar.joinRequest.reject")}
                      </Button>
                      <Button
                        size="sm"
                        disabled={joinBusy}
                        onClick={() => handleDecideJoinRequest(req.id, true)}
                        data-testid="class-join-accept"
                      >
                        {t("calendar.joinRequest.accept")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {canManage && !isEditing && savingAttendance && semiAutomatic && (
            // PAD-542: the confirm computes the suggestions; say so while it runs.
            <>
              <Separator />
              <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="suggestions-preparing">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("notificationsUi.replacementApproval.preparing")}
              </p>
            </>
          )}

          {canManage && !isEditing && approvalBundles.length > 0 && (
            <>
              <Separator />
              {/* PAD-765 (rule 12): one card per pending bundle, oldest spot first. */}
              {approvalBundles.map((approvalBundle) => (
                <ReplacementApprovalCard
                  key={approvalBundle.bundleId}
                  bundle={approvalBundle}
                  allowDismiss
                  onResult={(action) => {
                    // PAD-545: an ignored list leaves the class; the coach can ask for a fresh one.
                    if (action === "dismiss") {
                      setApprovalBundles((prev) => prev.filter((b) => b.bundleId !== approvalBundle.bundleId));
                      setSuggestionsIgnored(true);
                    } else {
                      answeredBundleIdsRef.current.add(approvalBundle.bundleId);
                    }
                  }}
                />
              ))}
            </>
          )}

          {canManage && !isEditing && approvalBundles.length === 0 && suggestionsIgnored && (
            <>
              <Separator />
              <Button
                variant="outline"
                className="w-full"
                onClick={handleRecomputeSuggestions}
                disabled={recomputing}
                data-testid="recompute-suggestions"
              >
                {recomputing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {recomputing
                  ? t("notificationsUi.replacementApproval.preparing")
                  : t("notificationsUi.replacementApproval.recompute")}
              </Button>
            </>
          )}

          {canManage && !isEditing && localInvitations.length > 0 && (
            <>
              <Separator />
              <div>
                <button
                  type="button"
                  data-testid="class-invited-toggle"
                  className="flex items-center justify-between w-full text-sm font-medium py-1"
                  onClick={() => setInvitationsOpen((o) => !o)}
                >
                  <span>{t("calendar.detail.invited", { count: localInvitations.length })}</span>
                  {invitationsOpen ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>

                {invitationsOpen && (
                  <div className="mt-2 space-y-1">
                    {localInvitations.map((inv) => {
                      // PAD-548 (calendar.event-detail rules 16–17): one outcome word, decided by the
                      // server; actions only on a pending or declined row.
                      const tone = INVITATION_OUTCOME_TONE[inv.outcome];
                      const actions = canManage ? inviteeActionsFor(inv.outcome) : [];
                      const toneClass =
                        tone === "success"
                          ? "bg-success/15 text-success"
                          : tone === "destructive"
                            ? "bg-destructive/15 text-destructive"
                            : tone === "warning"
                              ? "bg-warning/15 text-warning"
                              : tone === "outline"
                                ? "border border-border text-foreground"
                                : "bg-muted text-muted-foreground";
                      return (
                        <div
                          key={inv.id}
                          data-testid={`invitee-row-${inv.playerId}`}
                          data-outcome={inv.outcome}
                          className="flex items-center justify-between gap-2 py-1.5"
                        >
                          <span className="text-sm">{displayName(inv.playerId, inv.playerName)}</span>
                          <div className="flex items-center gap-1.5">
                            <div className="flex flex-col items-end">
                              <span
                                data-testid={`invitee-outcome-${inv.playerId}`}
                                className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full", toneClass)}
                              >
                                {inv.outcome === "accepted" ? <Check className="w-3 h-3" /> : null}
                                {inv.outcome === "declined" ? <X className="w-3 h-3" /> : null}
                                {t(INVITATION_OUTCOME_KEY[inv.outcome])}
                              </span>
                              {inviteeNotes(inv).map((note) => (
                                <span
                                  key={note.id}
                                  data-testid={`invitee-${note.id}-${inv.playerId}`}
                                  className="text-[10px] text-muted-foreground"
                                >
                                  {t(note.key)}
                                </span>
                              ))}
                            </div>
                            {actions.length > 0 ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={inviteeBusyId === inv.id}
                                    data-testid={`invitee-actions-${inv.playerId}`}
                                    aria-label={t("calendar.detail.inviteeActions")}
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {actions.includes("accept") ? (
                                    <DropdownMenuItem data-testid="invitee-mark-accepted" onClick={() => handleInviteeRespond(inv, "yes")}>
                                      <Check className="w-4 h-4 mr-2" />
                                      {t("calendar.detail.markAccepted")}
                                    </DropdownMenuItem>
                                  ) : null}
                                  {actions.includes("decline") ? (
                                    <DropdownMenuItem data-testid="invitee-mark-declined" onClick={() => handleInviteeRespond(inv, "no")}>
                                      <X className="w-4 h-4 mr-2" />
                                      {t("calendar.detail.markDeclined")}
                                    </DropdownMenuItem>
                                  ) : null}
                                  {actions.includes("delete") ? (
                                    <DropdownMenuItem
                                      data-testid="invitee-delete"
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setInviteeToDelete(inv)}
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      {t("calendar.detail.deleteInvitation")}
                                    </DropdownMenuItem>
                                  ) : null}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* PAD-547 (calendar.event-detail rules 19–20): the class's waiting list, coach only. */}
          {canManage && !isEditing && (
            <>
              <Separator />
              <ClassWaitingListSection
                event={event}
                isRecurring={event.isRecurring === true || classInstance.isRecurring === true}
                recurrenceEnd={classInstance.recurrenceEnd ?? null}
                rows={classInstance.waitingList ?? []}
                roster={players}
                enrolledIds={(classInstance.participants ?? []).map((p) => p.id)}
                onChanged={() => {
                  const ev = eventRef.current;
                  if (ev) getClassInstance(ev).then(setClassInstance).catch(() => {});
                }}
              />
            </>
          )}

          <Separator />

          <ClassPlanningSection
            exerciseIds={plannedExerciseIds}
            onChange={setPlannedExerciseIds}
            disabled={!canManage || isValidating || isEditing}
            isEditing={isPlanningMode}
            onEditStart={startPlanning}
          />

          {canManage && isPlanningMode && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={cancelPlanning}
                disabled={savingTraining}
              >
                <X className="w-4 h-4 mr-2" />
                {t("common.cancel")}
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveTraining}
                disabled={savingTraining}
              >
                <Check className="w-4 h-4 mr-2" />
                {savingTraining ? t("calendar.detail.saving") : t("calendar.detail.confirm")}
              </Button>
            </div>
          )}

          <Separator />

          {!isEditing ? (
            <>
              <ClassEvaluationsAction state={evaluationsAction} onOpen={() => setShowEvaluations(true)} onRetry={() => void classEvaluations.refetch()} />
              {canManage && (
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    className="flex-1"
                    data-testid="class-edit"
                    onClick={startEdit}
                    disabled={isValidating}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    {t("calendar.detail.edit")}
                  </Button>
                  {onClone && event?.type === "class" && (
                    <Button
                      variant="outline"
                      className="flex-1"
                      data-testid="class-clone"
                      onClick={() => event && onClone(event)}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {t("calendar.detail.clone")}
                    </Button>
                  )}
                  {event?.type === "class" && (
                    <>
                      <Button
                        variant="outline"
                        className="flex-1"
                        data-testid="class-notify-open"
                        onClick={() => setShowNotifyModal(true)}
                        disabled={isValidating || sendingReminders}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        {t("calendar.detail.notify")}
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        disabled={isValidating || sendingReminders}
                        onClick={async () => {
                          if (!event) return;
                          setSendingReminders(true);
                          try {
                            const { sent, blocked } = await sendClassReminders(
                              event.model,
                              String(event.originalId),
                              event.date
                            );
                            // Two unrelated reasons a student is skipped, and
                            // the coach is told a different thing for each, so
                            // split `blocked` by cause instead of showing one
                            // undifferentiated list.
                            const unavailable = blocked.filter((b) => b.cause !== "preference");
                            const optedOut = blocked.filter((b) => b.cause === "preference");

                            // PAD-107: name whoever could not be reached because
                            // they marked themselves unavailable for this slot.
                            if (unavailable.length > 0) {
                              toast({
                                variant: "destructive",
                                title: t("calendar.unavailable.title"),
                                description: t("calendar.unavailable.blocked", {
                                  count: unavailable.length,
                                  names: blockedNames(unavailable, displayName),
                                }),
                              });
                            }
                            // PAD-112: a student who blocked all notifications
                            // is skipped; name them so the short count reads as
                            // their choice rather than as a failure.
                            if (optedOut.length > 0) {
                              toast({
                                title: t("calendar.notify.blockedByPreference", {
                                  names: blockedNames(optedOut, displayName),
                                }),
                              });
                            }
                            // PAD-107's ordering: no "reminders sent to 0" when
                            // everyone was skipped — that already got its toast.
                            if (sent > 0 || blocked.length === 0) {
                              toast({ title: t("calendar.detail.remindersSent", { count: sent }) });
                            }
                          } catch {
                            toast({ title: t("calendar.detail.failedSendReminders"), variant: "destructive" });
                          } finally {
                            setSendingReminders(false);
                          }
                        }}
                      >
                        <Bell className="w-4 h-4 mr-2" />
                        {sendingReminders ? t("calendar.detail.sending") : t("calendar.detail.remind")}
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    className="text-destructive"
                    data-testid="class-delete"
                    onClick={handleDeleteClick}
                    disabled={isValidating || deleting}
                    aria-label={t("calendar.detail.deleteClass")}
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </div>
              )}

              {/* PAD-46: student cancels their own attendance from the class view */}
              {!canManage && (
                <>
                  {/* PAD-73: `hasDeclined` (not the local-only
                      `attendanceCancelled`) so this state survives a reload —
                      it is re-derived from the student's own serialized
                      presence, no new column required. */}
                  {/* PAD-570 (attendance.confirm rule 27): "Vou" only once asked — the
                      server's `pendingConfirmation`, never a date computed here. */}
                  {/* PAD-672 slice 3 (rule 13a): the student's own row — "Ambos → esquerda" once the
                      class is full and they play both sides. */}
                  {ownPresence?.side === "both" && assignedSideOf("both", ownPresence.assignedSide) && (
                    <p className="text-sm" data-testid="class-own-assigned-side">
                      <span className="text-muted-foreground">{t("calendar.side.yours")}: </span>
                      <span className="font-medium">{t(sideLongKeyOf("both", ownPresence.assignedSide))}</span>
                    </p>
                  )}
                  {canConfirm && (
                    <Button
                      data-testid="class-confirm-attendance"
                      className="w-full"
                      onClick={handleConfirmMyAttendance}
                      disabled={confirming}
                    >
                      {confirming ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      {t("calendar.detail.confirmAttendance")}
                    </Button>
                  )}
                  {/* PAD-570 rule 28: "Não vou" is final — no way back (the PAD-315
                      come-back lived here); the hint points to the coach's chat. */}
                  {comeBackKind === "rejoin" && (
                    <Button
                      data-testid="attendance-come-back"
                      className="w-full"
                      onClick={handleConfirmMyAttendance}
                      disabled={confirming}
                    >
                      {confirming ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      {t("calendar.detail.comeBack")}
                    </Button>
                  )}
                  {comeBackKind === "waiting_list" && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground" data-testid="attendance-come-back-spot-taken">
                        {t("calendar.detail.spotTaken")}
                      </p>
                      <Button
                        data-testid="attendance-come-back-waiting-list"
                        variant="outline"
                        className="w-full"
                        onClick={handleComeBackWaitingList}
                        disabled={joinBusy}
                      >
                        {t("calendar.waitingList.join")}
                      </Button>
                    </div>
                  )}
                  {comeBackKind === "on_waiting_list" && (
                    <p className="text-xs text-muted-foreground" data-testid="attendance-come-back-on-waiting-list">
                      {t("calendar.detail.onWaitingList")}
                    </p>
                  )}
                  {(hasDeclined || comeBackKind === "final_hint") &&
                    (comeBackKind === null || comeBackKind === "final_hint") && (
                    <div className="space-y-2" data-testid="class-declined-hint">
                      <p className="text-xs text-muted-foreground">
                        {t("calendar.detail.declinedFinalHint")}
                      </p>
                      {classInstance?.coachUserId ? (
                        <Button
                          data-testid="class-chat-coach"
                          variant="outline"
                          size="sm"
                          onClick={openCoachChat}
                          disabled={openingChat}
                        >
                          {openingChat ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <MessageCircle className="w-4 h-4 mr-2" />
                          )}
                          {t("calendar.detail.declinedFinalChat")}
                        </Button>
                      ) : null}
                    </div>
                  )}
                  {/* PAD-313 rule 25: one action, and no state pill here — the
                      student's state is the one word on their row above. */}
                  {hasDeclined ? null : canCancelAttendance ? (
                    <Button
                      data-testid="class-cancel-attendance"
                      variant="outline"
                      className="w-full text-destructive"
                      onClick={() => setCancelAttendanceOpen(true)}
                      disabled={cancellingAttendance}
                    >
                      {cancellingAttendance ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <X className="w-4 h-4 mr-2" />
                      )}
                      {t("calendar.detail.proactiveDecline")}
                    </Button>
                  ) : null}
                </>
              )}

              {canManage && isValidating && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setIsValidating(false)}
                    disabled={savingAttendance}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    data-testid="attendance-save"
                    className="flex-1"
                    disabled={savingAttendance}
                    onClick={() => handleConfirmAttendance()}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    {t("calendar.detail.confirm")}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={cancelEdit} disabled={saving}>
                <X className="w-4 h-4 mr-2" />
                {t("common.cancel")}
              </Button>
              <Button className="flex-1" onClick={saveEdit} disabled={saving} data-testid="class-edit-save">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {saving ? t("calendar.detail.saving") : t("common.save")}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>

      {/* PAD-548 (calendar.event-detail rule 18): the warning before a withdrawal. */}
      {/* PAD-672 (join-requests rule 20): which side the student wants, before the ask is sent. */}
      {event && !canManage && (
        <ClassSideChoice
          open={sideSheet !== null}
          onOpenChange={(o) => {
            if (!o) setSideSheet(null);
          }}
          mode={sideSheet ?? "request"}
          event={event}
          profileSide={active?.profileSide ?? event.profileSide ?? null}
          onRequestSent={(request) => void handleSideRequestSent(request)}
          onWaitingListJoined={handleSideWaitingJoined}
          onFailed={(err, mode) => void handleSideFailed(err, mode)}
        />
      )}
      <AlertDialog open={inviteeToDelete !== null} onOpenChange={(open) => { if (!open) setInviteeToDelete(null); }}>
        <AlertDialogContent data-testid="invitee-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("calendar.detail.deleteInvitation")}</AlertDialogTitle>
            <AlertDialogDescription>{t("calendar.detail.deleteInvitationWarning")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="invitee-delete-cancel">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="invitee-delete-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleInviteeDelete}
            >
              {t("calendar.detail.deleteInvitationConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* classes.edit rule 10 (PAD-525, B-341): "Descartar alterações?" — Discard (leave; the
          draft is dropped, nothing is sent) or Keep editing (stay, every edit where it was). */}
      <AlertDialog open={discardAskOpen} onOpenChange={setDiscardAskOpen}>
        <AlertDialogContent data-testid="class-unsaved-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("classDetail.unsavedChanges.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("classDetail.unsavedChanges.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="class-unsaved-keep">
              {t("classDetail.unsavedChanges.keepEditing")}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="class-unsaved-discard"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={discardAndClose}
            >
              {t("classDetail.unsavedChanges.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PAD-46: confirm student cancellation, with deadline-aware messaging */}
      {!canManage && (
        <AlertDialog open={cancelAttendanceOpen} onOpenChange={setCancelAttendanceOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("calendar.detail.cancelAttendanceConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isLateCancellation
                  ? t("calendar.detail.cancelAttendanceLateBody")
                  : t("calendar.detail.cancelAttendanceConfirmBody")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {isLateCancellation && (
              <div className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t("calendar.detail.cancelAttendanceLateBadge")}
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancellingAttendance}>
                {t("calendar.detail.keepAttendance")}
              </AlertDialogCancel>
              <AlertDialogAction
                data-testid="class-cancel-attendance-confirm"
                onClick={(e) => {
                  e.preventDefault();
                  handleCancelAttendance();
                }}
                disabled={cancellingAttendance}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {cancellingAttendance ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {/* PAD-313 rule 25: the confirmation speaks the same words as
                    the trigger — one string, so they cannot drift apart. */}
                {t("calendar.detail.proactiveDecline")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* PAD-567 (attendance.validation rule 26): a cleared absence takes its seat back. */}
      <AlertDialog open={clearOverCapacity !== null} onOpenChange={(o) => !o && setClearOverCapacity(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("calendar.detail.clearOverCapacityTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("calendar.detail.clearOverCapacityBody", {
                filled: clearOverCapacity?.filled ?? 0,
                capacity: clearOverCapacity?.capacity ?? 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("calendar.detail.clearOverCapacityKeep")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="attendance-clear-over-capacity-confirm"
              onClick={(e) => {
                e.preventDefault();
                setClearOverCapacity(null);
                void handleConfirmAttendance(true);
              }}
            >
              {t("calendar.detail.clearOverCapacityConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EligibilityConfirmDialog
        open={pendingEdit !== null}
        ineligible={ineligible}
        onCancel={() => {
          // Back to the edit, draft intact — nothing was saved.
          setPendingEdit(null);
          setIneligible([]);
        }}
        onConfirm={() => {
          const parked = pendingEdit;
          setPendingEdit(null);
          setIneligible([]);
          if (parked) finalizeEdit(parked.changes, parked.scope);
        }}
      />

      {/* PAD-131 rule 7: accepting a request is a manual add — same warning. */}
      <EligibilityConfirmDialog
        open={pendingAccept !== null}
        ineligible={pendingAccept?.ineligible ?? []}
        sideGone={pendingAccept?.sideGone ?? null}
        onCancel={() => setPendingAccept(null)}
        onConfirm={() => {
          const parked = pendingAccept;
          setPendingAccept(null);
          if (parked) void handleDecideJoinRequest(parked.id, true, true);
        }}
      />

      {/* PAD-313 rule 25: the separate proactive-decline dialog is gone with its
          button — the one confirmation above carries the deadline instead. */}

      {canManage && event && (
        <ManualNotificationModal
          open={showNotifyModal}
          onClose={() => setShowNotifyModal(false)}
          eventModel={event.model}
          eventOriginalId={String(event.originalId)}
          eventDate={event.date}
          coachPlayers={players}
          existingPlayerIds={(classInstance?.participants ?? []).map((p) => p.id)}
        />
      )}

      {/* PAD-58: confirm deletion of a non-recurring class before removing it. */}
      {canManage && onDelete && (
        <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("calendar.detail.deleteConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("calendar.detail.deleteConfirmBody")}
              </AlertDialogDescription>
              {deleteAttendanceNote && (
                <p
                  data-testid="delete-attendance-note"
                  className="text-sm font-medium text-destructive"
                >
                  {deleteAttendanceNote}
                </p>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>
                {t("calendar.detail.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  setConfirmDeleteOpen(false);
                  if (event) onDelete(event, "single");
                }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t("calendar.detail.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {canManage && onDelete && (
        <ClassScopeDialog
          open={deleteDialogOpen}
          mode="delete"
          note={deleteAttendanceNote}
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={(scope) => {
            setDeleteDialogOpen(false);
            if (event) onDelete(event, scope);
          }}
        />
      )}

      {canManage && onEdit && (
        <ClassScopeDialog
          open={editScopeDialogOpen}
          mode="edit"
          onClose={() => setEditScopeDialogOpen(false)}
          onConfirm={commitEdit}
        />
      )}

      {canManage && (
        <ParticipantPopup
          row={popupRow}
          onClose={() => setPopupRow(null)}
          returnFocusTo={popupOpener}
          side={popupRow ? sideFor(popupRow.playerId) : undefined}
        />
      )}

      {canManage && onEdit && (
        <OverlapConfirmDialog
          open={overlapConfirmOpen}
          onCancel={() => setOverlapConfirmOpen(false)}
          onConfirm={proceedSaveEdit}
        />
      )}
    </Sheet>
  );
}
