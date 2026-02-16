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
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  CalendarEvent,
  ClassInstance,
  CoachPlayer,
  CoachLevel,
  PresenceStatus,
  AbsenceJustification,
} from "@/types";

import { getClassInstance } from "@/api/classes";
import { confirmClassPresences } from "@/api/presences";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

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

  const [classInstance, setClassInstance] = useState<ClassInstance | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ClassInstance | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editScopeDialogOpen, setEditScopeDialogOpen] = useState(false);

  const [isValidating, setIsValidating] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRecord>({});

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
  }, [classInstance?.id]);

  const active = draft ?? classInstance;
  const isCanceled = active?.status === "canceled";

  const attendanceAlreadyMarked : boolean = (active?.presences?.length ?? 0) > 0;

  if (!event || !classInstance || !players || !levels) return null;
  if (!active) return null;

  const canApplyScope = event?.isRecurring === true

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

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
      participants: draft.participants.some((p) => p.id === playerId)
        ? draft.participants.filter((p) => p.id !== playerId)
        : [
            ...draft.participants,
            {
              id: playerId,
              user: players.find((p) => p.playerId === playerId)!,
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
      const updatedPresences = await confirmClassPresences(classInstance, payload);

      setClassInstance((prev) =>
        prev ? { ...prev, presences: updatedPresences } : prev
      );

      toast({
        title: "Attendance saved",
      });

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

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? (
              <Input
                value={active.name}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, name: e.target.value } : d))
                }
              />
            ) : (
              active.name
            )}
          </SheetTitle>
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

          <Separator />

          <div className="space-y-2">
            <div className="text-sm font-medium">Max players</div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                disabled={!isEditing}
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
                disabled={!isEditing}
                onClick={() =>
                  setDraft((d) => (d ? { ...d, maxPlayers: d.maxPlayers + 1 } : d))
                }
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
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
              <div className={cn("space-y-2", "max-h-48 overflow-y-auto")}>
                {players.map((player) => {
                  const selected = active.participants.some(
                    (p: any) => p.id === player.playerId
                  );

                  return (
                    <div
                      key={`player-${player.playerId}`}
                      onClick={() => togglePlayer(player.playerId)}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg cursor-pointer",
                        selected ? "bg-primary/10" : "hover:bg-muted"
                      )}
                    >
                      <Checkbox checked={selected} />
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs">
                          {getInitials(player.name)}
                        </div>
                        <span className="text-sm">{player.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
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

          <Separator />

          {!isEditing ? (
            <>
              {canManage && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={startEdit}
                    disabled={isValidating}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive"
                    onClick={handleDeleteClick}
                    disabled={isValidating}
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