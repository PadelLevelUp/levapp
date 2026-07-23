import { format } from "date-fns";
import { dateFnsLocale } from "@/lib/dateLocale";
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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ClassPlanningSection } from "./ClassPlanningSection";

import type {
  ApprovalBundle,
  CalendarEvent,
  ClassInstance,
  ClassInvitation,
  CoachPlayer,
  CoachLevel,
  PresenceStatus,
  AbsenceJustification,
} from "@/types";


import { getClassInstance } from "@/api/classes";
import { sendClassReminders, cancelAttendance } from "@/api/notificationEngine";
import { confirmClassPresences } from "@/api/presences";
import { confirmClassTraining } from "@/api/training";
import { createEventSource } from "@/api/events";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ManualNotificationModal } from "./ManualNotificationModal";
import { ReplacementApprovalCard } from "@/components/notifications/ReplacementApprovalCard";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAutoInviteEnabled } from "@/hooks/useAutoInviteEnabled";

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
import { AttendanceRow, AttendanceState } from "./AttendanceRow";
import { PlayerSelector } from "./PlayerSelector";
import { LevelLabel } from "@/components/LevelLabel";

const COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#22c55e",
  "#eab308",
  "#ef4444",
  "#6366f1",
];

type AttendanceRecord = Record<string, AttendanceState>;

interface ClassDetailSheetProps {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;

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
}

export function ClassDetailSheet({
  event,
  open,
  onClose,
  players,
  levels,
  canManage,
  onDelete,
  onEdit,
  deleting = false,
  saving = false,
}: ClassDetailSheetProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { token } = useAuth();
  const autoInviteEnabled = useAutoInviteEnabled(open && canManage);

  const [classInstance, setClassInstance] = useState<ClassInstance | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ClassInstance | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editScopeDialogOpen, setEditScopeDialogOpen] = useState(false);

  const [isValidating, setIsValidating] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRecord>({});
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);

  const [localInvitations, setLocalInvitations] = useState<ClassInvitation[]>([]);
  const [invitationsOpen, setInvitationsOpen] = useState(false);
  const [approvalBundle, setApprovalBundle] = useState<ApprovalBundle | null>(null);
  const [plannedExerciseIds, setPlannedExerciseIds] = useState<string[]>([]);
  const [isPlanningMode, setIsPlanningMode] = useState(false);
  const [savingTraining, setSavingTraining] = useState(false);
  const savedPlannedIdsRef = useRef<string[]>([]);

  // PAD-46: student cancels attendance from the class-detail view.
  const [cancelAttendanceOpen, setCancelAttendanceOpen] = useState(false);
  const [cancellingAttendance, setCancellingAttendance] = useState(false);
  const [attendanceCancelled, setAttendanceCancelled] = useState(false);

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
    setInvitationsOpen(false);
    setApprovalBundle(null);
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

  // Real-time invitation updates via SSE
  useEffect(() => {
    if (!open || !canManage || !token) return;

    const es = createEventSource(token);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

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
                if (response === "yes") return { ...inv, status: "confirmed" as const };
                if (response === "no" || response === "spot_filled") return { ...inv, status: "expired" as const };
                return inv;
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

        // Notifications were sent (auto or manual) → re-fetch to show new entries
        if (data.type === "notify_sent") {
          const { lessonInstanceId } = data.payload;
          const ev = eventRef.current;
          if (!ev) return;
          const fetchEvent = { ...ev, model: "LessonInstance", originalId: Number(lessonInstanceId) };
          getClassInstance(fetchEvent as typeof ev).then((updated) => {
            setLocalInvitations(updated.invitations ?? []);
            setInvitationsOpen(true);
          }).catch(() => {});
        }
      } catch { /* ignore parse errors */ }
    };
    return () => es.close();
  }, [open, canManage, token]);

  const active = draft ?? classInstance;
  const isCanceled = active?.status === "canceled";

  const attendanceAlreadyMarked : boolean = (active?.presences?.length ?? 0) > 0;

  if (!event || !classInstance || !players || !levels) return null;
  if (!active) return null;

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

  // PAD-46: a STUDENT viewer (canManage=false) is enrolled in this instance iff
  // they appear in participants — the serializer only ever returns the viewer's
  // own player for a student, so a non-empty list means "I'm a participant".
  const classStartAt = new Date(`${active.date}T${active.startTime}`);
  const classStarted = !Number.isNaN(classStartAt.getTime()) && classStartAt.getTime() <= Date.now();
  const isStudentParticipant =
    !canManage &&
    event?.type === "class" &&
    !isCanceled &&
    (active.participants?.length ?? 0) > 0;
  // Deadline-aware messaging: at/after (start - cancellationDeadlineHours) but
  // before start → "late cancellation" warning (still allowed).
  const cancellationDeadline = active.cancellationDeadline
    ? new Date(active.cancellationDeadline)
    : null;
  const isLateCancellation =
    !!cancellationDeadline &&
    !Number.isNaN(cancellationDeadline.getTime()) &&
    Date.now() >= cancellationDeadline.getTime();
  const canCancelAttendance =
    isStudentParticipant &&
    !classStarted &&
    !attendanceCancelled &&
    cancelInstanceId != null;

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
    "recurrenceEnd",
    "notificationsEnabled",
  ] as const;

  const commitEdit = (scope: ApplyScope) => {
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

    setEditScopeDialogOpen(false);
    setIsEditing(false);

    onEdit(event, changes, scope);
    setDraft(null);
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

  const handleConfirmAttendance = async () => {
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
      status: PresenceStatus;
      justification?: AbsenceJustification;
    }>;

    if (payload.length === 0) return;

    setSavingAttendance(true);

    try {
      const {
        presences: updatedPresences,
        notifiedPlayers,
        approvalBundle: bundle,
      } = await confirmClassPresences(classInstance, payload);

      setClassInstance((prev) =>
        prev ? { ...prev, presences: updatedPresences } : prev
      );

      if (bundle) {
        // Semi-automatic mode: invitations await coach approval
        setApprovalBundle(bundle);
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

  const handleCancelAttendance = async () => {
    if (cancelInstanceId == null || cancellingAttendance) return;
    setCancellingAttendance(true);
    try {
      await cancelAttendance(cancelInstanceId);
      setAttendanceCancelled(true);
      setCancelAttendanceOpen(false);
      toast({ title: t("calendar.detail.attendanceCancelled") });
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

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="flex-1 min-w-0">
              {isEditing ? (
                <Input
                  value={active.name}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, name: e.target.value } : d))
                  }
                />
              ) : (
                <span className="truncate">{active.name}</span>
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
                    {format(new Date(active.date), "EEE, MMM d", { locale: dateFnsLocale(i18n.language) })}
                  </p>
                  {active.recurrenceEnd && !active.parentClassId && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("calendar.detail.untilDate", { date: format(new Date(active.recurrenceEnd), "MMM d", { locale: dateFnsLocale(i18n.language) }) })}
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
                  <Input
                    type="time"
                    value={active.startTime}
                    className="h-8 text-sm"
                    onChange={(e) =>
                      setDraft((d) => d ? { ...d, startTime: e.target.value } : d)
                    }
                  />
                  <Input
                    type="time"
                    value={active.endTime}
                    className="h-8 text-sm"
                    onChange={(e) =>
                      setDraft((d) => d ? { ...d, endTime: e.target.value } : d)
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
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
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
                    const absentCount = (active.presences ?? []).filter(p => p.status === "absent").length;
                    const effectiveFilled = active.participants.length - absentCount;
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
          </div>

          {/* Auto notifications */}
          {canManage && event?.type === "class" && autoInviteEnabled && (
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
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                {t("calendar.detail.participantsCount", {
                  label: isValidating ? t("calendar.detail.attendance") : t("calendar.detail.participants"),
                  current: active.participants.length,
                  max: active.maxPlayers,
                })}
              </h4>

              {canManage &&
                !isEditing &&
                !isValidating &&
                !isCanceled &&
                active.participants.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
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
                      invited={presence?.invited}
                      confirmed={presence?.confirmed}
                    />
                  );
                })}

                {active.participants.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("calendar.detail.noParticipants")}
                  </p>
                )}
              </div>
            )}
          </div>

          {canManage && !isEditing && approvalBundle && (
            <>
              <Separator />
              <ReplacementApprovalCard bundle={approvalBundle} />
            </>
          )}

          {canManage && !isEditing && localInvitations.length > 0 && (
            <>
              <Separator />
              <div>
                <button
                  type="button"
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
                    {localInvitations.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between py-1.5">
                        <span className="text-sm">{inv.playerName}</span>
                        {inv.status === "confirmed" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            <Check className="w-3 h-3" />
                            {t("calendar.detail.accepted")}
                          </span>
                        ) : inv.status === "expired" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-destructive/15 text-destructive">
                            <X className="w-3 h-3" />
                            {t("calendar.detail.declined")}
                          </span>
                        ) : inv.status === "queued" ? (
                          <span className="text-xs font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground">
                            {t("calendar.detail.queued")}
                          </span>
                        ) : (
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" disabled
                              className="h-7 gap-1 text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400 opacity-50 cursor-not-allowed"
                            >
                              <Check className="w-3 h-3" />
                              {t("calendar.detail.yes")}
                            </Button>
                            <Button size="sm" variant="outline" disabled
                              className="h-7 gap-1 text-xs border-destructive/40 text-destructive opacity-50 cursor-not-allowed"
                            >
                              <X className="w-3 h-3" />
                              {t("calendar.detail.no")}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
              {canManage && (
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={startEdit}
                    disabled={isValidating}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    {t("calendar.detail.edit")}
                  </Button>
                  {event?.type === "class" && (
                    <>
                      <Button
                        variant="outline"
                        className="flex-1"
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
                            const { sent } = await sendClassReminders(
                              event.model,
                              String(event.originalId),
                              event.date
                            );
                            toast({ title: t("calendar.detail.remindersSent", { count: sent }) });
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
                  {attendanceCancelled ? (
                    <div className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full bg-destructive/15 text-destructive">
                      <X className="w-4 h-4" />
                      {t("calendar.detail.attendanceCancelled")}
                    </div>
                  ) : canCancelAttendance ? (
                    <Button
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
                      {t("calendar.detail.cancelAttendance")}
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
                    className="flex-1"
                    disabled={savingAttendance}
                    onClick={handleConfirmAttendance}
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
              <Button className="flex-1" onClick={saveEdit} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {saving ? t("calendar.detail.saving") : t("common.save")}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>

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
              <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t("calendar.detail.cancelAttendanceLateBadge")}
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancellingAttendance}>
                {t("calendar.detail.keepAttendance")}
              </AlertDialogCancel>
              <AlertDialogAction
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
                {t("calendar.detail.cancelAttendance")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

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
    </Sheet>
  );
}
