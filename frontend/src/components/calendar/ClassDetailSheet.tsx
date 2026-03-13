import { format } from "date-fns";
import { enUS } from "date-fns/locale";
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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ClassPlanningSection } from "./ClassPlanningSection";

import type {
  CalendarEvent,
  ClassInstance,
  ClassInvitation,
  CoachPlayer,
  CoachLevel,
  PresenceStatus,
  AbsenceJustification,
} from "@/types";


import { getClassInstance } from "@/api/classes";
import { confirmClassPresences } from "@/api/presences";
import { confirmClassTraining } from "@/api/training";
import { createEventSource } from "@/api/events";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ManualNotificationModal } from "./ManualNotificationModal";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ClassScopeDialog, ApplyScope } from "./ClassScopeDialog";
import { AttendanceRow, AttendanceState } from "./AttendanceRow";
import { PlayerSelector } from "./PlayerSelector";

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
}: ClassDetailSheetProps) {
  const { toast } = useToast();
  const { token } = useAuth();
  const autoInviteEnabled = useAutoInviteEnabled(open && canManage);

  const [classInstance, setClassInstance] = useState<ClassInstance | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ClassInstance | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editScopeDialogOpen, setEditScopeDialogOpen] = useState(false);

  const [isValidating, setIsValidating] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRecord>({});
  const [showNotifyModal, setShowNotifyModal] = useState(false);

  const [localInvitations, setLocalInvitations] = useState<ClassInvitation[]>([]);
  const [invitationsOpen, setInvitationsOpen] = useState(false);
  const [plannedExerciseIds, setPlannedExerciseIds] = useState<string[]>([]);
  const [isPlanningMode, setIsPlanningMode] = useState(false);
  const [savingTraining, setSavingTraining] = useState(false);
  const savedPlannedIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!canManage) {
      setIsEditing(false);
      setDraft(null);
      setDeleteDialogOpen(false);
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
    setPlannedExerciseIds(classInstance.plannedExerciseIds ?? []);
    setIsPlanningMode(false);
  }, [classInstance?.id]);

  // Keep a live ref to event so SSE handlers don't go stale
  const eventRef = useRef<typeof event>(event);
  eventRef.current = event;

  // Real-time invitation updates via SSE
  useEffect(() => {
    if (!open || !canManage || !token) return;

    const es = createEventSource(token);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        // Player accepted / declined an invite → update badge in-place
        if (data.type === "notification_responded") {
          const { notificationEventId, response } = data.payload;
          setLocalInvitations((prev) =>
            prev.map((inv) => {
              if (inv.id !== notificationEventId) return inv;
              if (response === "yes") return { ...inv, status: "confirmed" as const };
              if (response === "no" || response === "spot_filled") return { ...inv, status: "expired" as const };
              return inv;
            })
          );
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

    setClassInstance(draft);
    onEdit(event, changes, scope);
    setDraft(null);
  };

  const handleDeleteClick = () => {
    if (!canManage || !onDelete) return;
    if (!event) return;

    if (canApplyScope) {
      setDeleteDialogOpen(true);
    } else {
      onDelete(event, "single");
      onClose();
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
      const { presences: updatedPresences, notifiedPlayers } = await confirmClassPresences(classInstance, payload);

      setClassInstance((prev) =>
        prev ? { ...prev, presences: updatedPresences } : prev
      );

      if (notifiedPlayers.length > 0 && event && updatedPresences.length > 0) {
        // Fetch by the actual LessonInstance ID from presences (works even for
        // recurring lessons that were just materialized during confirmation)
        const instanceId = Number(updatedPresences[0].lessonInstanceId);
        const fetchEvent = { ...event, model: "LessonInstance", originalId: instanceId };
        const updated = await getClassInstance(fetchEvent as typeof event);
        setLocalInvitations(updated.invitations ?? []);
        setInvitationsOpen(true);
        const n = notifiedPlayers.length;
        toast({
          title: "Attendance saved",
          description: `Sent an invite to ${n} ${n === 1 ? "player" : "players"}`,
        });
      } else {
        toast({ title: "Attendance saved" });
      }

      setIsValidating(false);
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to save attendance",
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
      toast({ title: "Training saved" });
    } catch {
      toast({ variant: "destructive", title: "Failed to save training" });
    } finally {
      setSavingTraining(false);
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
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />

              {isEditing ? (
                <div className="flex gap-3 items-center">
                  <Input
                    type="date"
                    value={active.date}
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, date: e.target.value } : d))
                    }
                  />

                  {active.recurrenceEnd && !active.parentClassId && (
                    <>
                      <span className="text-xs text-muted-foreground">
                        repeat until
                      </span>
                      <Input
                        type="date"
                        value={active.recurrenceEnd}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, recurrenceEnd: e.target.value } : d
                          )
                        }
                      />
                    </>
                  )}
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <span>
                    {format(new Date(active.date), "EEEE, MMMM d", {
                      locale: enUS,
                    })}
                  </span>

                  {active.recurrenceEnd && !active.parentClassId && (
                    <span className="text-xs text-muted-foreground">
                      · repeats until{" "}
                      {format(new Date(active.recurrenceEnd), "MMM d", {
                        locale: enUS,
                      })}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              {isEditing ? (
                <div className="flex gap-2">
                  <Input
                    type="time"
                    value={active.startTime}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, startTime: e.target.value } : d
                      )
                    }
                  />
                  <Input
                    type="time"
                    value={active.endTime}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, endTime: e.target.value } : d
                      )
                    }
                  />
                </div>
              ) : (
                `${active.startTime} – ${active.endTime}`
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="text-sm font-medium">Color</div>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((color) => (
                <button
                  key={color}
                  disabled={!isEditing}
                  onClick={() => setDraft((d) => (d ? { ...d, color } : d))}
                  className={cn(
                    "w-8 h-8 rounded-full",
                    active.color === color && "ring-2 ring-offset-2 ring-primary"
                  )}
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="text-sm font-medium">Level</div>
            <Select
              disabled={!isEditing}
              value={active.levelId ?? ""}
              onValueChange={(value) =>
                setDraft((d) => (d ? { ...d, levelId: value || null } : d))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                {levels.map((level) => (
                  <SelectItem key={level.id} value={level.id}>
                    {level.code} – {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {canManage && event?.type === "class" && autoInviteEnabled && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Automatic notifications</span>
                </div>
                <Switch
                  checked={active.notificationsEnabled ?? true}
                  onCheckedChange={(checked) =>
                    setDraft((d) => d ? { ...d, notificationsEnabled: checked } : d)
                  }
                  disabled={!isEditing}
                />
              </div>
            </>
          )}

          <Separator />

          <div className="space-y-2">
            <div className="text-sm font-medium">Capacity</div>
            {isEditing ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setDraft((d) =>
                      d ? { ...d, maxPlayers: Math.max(1, d.maxPlayers - 1) } : d
                    )
                  }
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="w-8 text-center font-semibold">
                  {active.maxPlayers}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setDraft((d) => (d ? { ...d, maxPlayers: d.maxPlayers + 1 } : d))
                  }
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <p className="text-sm">
                {(() => {
                  const absentCount = (active.presences ?? []).filter(p => p.status === "absent").length;
                  const effectiveFilled = active.participants.length - absentCount;
                  const openSpots = active.maxPlayers - effectiveFilled;
                  const pendingInvites = localInvitations.filter(inv => inv.status === "sent" || inv.status === "queued").length;
                  const details: string[] = [];
                  if (openSpots > 0) details.push(`${openSpots} open`);
                  if (absentCount > 0) details.push(`${absentCount} absent`);
                  if (pendingInvites > 0) details.push(`${pendingInvites} invite${pendingInvites !== 1 ? "s" : ""} pending`);
                  return (
                    <>
                      {effectiveFilled}/{active.maxPlayers}
                      {details.length > 0 && (
                        <span className="text-muted-foreground ml-1">
                          ({details.join(", ")})
                        </span>
                      )}
                    </>
                  );
                })()}
              </p>
            )}
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                {isValidating ? "Attendance" : "Participants"} (
                {active.participants.length}/{active.maxPlayers})
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
                    {attendanceAlreadyMarked ? "Edit attendance" : "Mark attendance"}
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
                {active.participants.map((p) => (
                  <AttendanceRow
                    key={p.id}
                    player={p}
                    attendance={attendance[p.id] || { status: null }}
                    onChange={(state) => handleAttendanceChange(p.id, state)}
                    disabled={!isValidating || isCanceled}
                  />
                ))}

                {active.participants.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No participants
                  </p>
                )}
              </div>
            )}
          </div>

          {canManage && !isEditing && localInvitations.length > 0 && (
            <>
              <Separator />
              <div>
                <button
                  type="button"
                  className="flex items-center justify-between w-full text-sm font-medium py-1"
                  onClick={() => setInvitationsOpen((o) => !o)}
                >
                  <span>Invited ({localInvitations.length})</span>
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
                            Accepted
                          </span>
                        ) : inv.status === "expired" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-destructive/15 text-destructive">
                            <X className="w-3 h-3" />
                            Declined
                          </span>
                        ) : inv.status === "queued" ? (
                          <span className="text-xs font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground">
                            Queued
                          </span>
                        ) : (
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" disabled
                              className="h-7 gap-1 text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400 opacity-50 cursor-not-allowed"
                            >
                              <Check className="w-3 h-3" />
                              Yes
                            </Button>
                            <Button size="sm" variant="outline" disabled
                              className="h-7 gap-1 text-xs border-destructive/40 text-destructive opacity-50 cursor-not-allowed"
                            >
                              <X className="w-3 h-3" />
                              No
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
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveTraining}
                disabled={savingTraining}
              >
                <Check className="w-4 h-4 mr-2" />
                {savingTraining ? "Saving…" : "Confirm"}
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
                    Edit
                  </Button>
                  {event?.type === "class" && (
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowNotifyModal(true)}
                      disabled={isValidating}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Notify
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="text-destructive"
                    onClick={handleDeleteClick}
                    disabled={isValidating}
                    aria-label="Delete class"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {canManage && isValidating && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setIsValidating(false)}
                    disabled={savingAttendance}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={savingAttendance}
                    onClick={handleConfirmAttendance}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Confirm
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={cancelEdit}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button className="flex-1" onClick={saveEdit}>
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            </div>
          )}
        </div>
      </SheetContent>

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

      {canManage && onDelete && (
        <ClassScopeDialog
          open={deleteDialogOpen}
          mode="delete"
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={(scope) => {
            setDeleteDialogOpen(false);
            if (event) onDelete(event, scope);
            onClose();
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
