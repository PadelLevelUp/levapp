import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
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
} from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  CalendarEvent,
  ClassInstance,
  CoachPlayer,
  CoachLevel,
} from '@/types';

import { getClassInstance } from '@/api/classes';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  ClassScopeDialog,
  ApplyScope,
} from './ClassScopeDialog';

const COLORS = [
  '#0ea5e9',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#22c55e',
  '#eab308',
  '#ef4444',
  '#6366f1',
];

interface ClassDetailSheetProps {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;

  players: CoachPlayer[];
  levels: CoachLevel[];

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
  onDelete,
  onEdit,
}: ClassDetailSheetProps) {
  const [classInstance, setClassInstance] = useState<ClassInstance | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ClassInstance | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editScopeDialogOpen, setEditScopeDialogOpen] = useState(false);

  useEffect(() => {
    if (!event) return;

    let mounted = true;

    async function load() {
      const data = await getClassInstance(event);
      if (mounted) setClassInstance(data);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [event]);

  if (!event || !classInstance || !players || !levels) return null;

  const active = draft ?? classInstance;

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  /* ---------------- Editing helpers ---------------- */

  const startEdit = () => {
    setIsEditing(true);
    setDraft(structuredClone(classInstance));
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setDraft(null);
  };

  const saveEdit = () => {
    if (!event.isRecurring) {
      commitEdit('single');
    } else {
      setEditScopeDialogOpen(true);
    }
  };

  function diffInstance<T extends Record<string, any>>(
    original: T,
    updated: T,
    fields: readonly (keyof T)[]
  ): Partial<T> {
    const diff: Partial<T> = {};

    for (const field of fields) {
      if (
        JSON.stringify(original[field]) !==
        JSON.stringify(updated[field])
      ) {
        diff[field] = updated[field];
      }
    }

    return diff;
  }

  function diffParticipants(
    original: { id: string }[],
    updated: { id: string }[]
  ) {
    const originalIds = new Set(original.map(p => p.id));
    const updatedIds = new Set(updated.map(p => p.id));

    const addPlayers = [...updatedIds].filter(id => !originalIds.has(id));
    const removePlayers = [...originalIds].filter(id => !updatedIds.has(id));

    return { addPlayers, removePlayers };
  }

  const EDITABLE_FIELDS = [
    'name',
    'date',
    'startTime',
    'endTime',
    'color',
    'maxPlayers',
    'levelId',
    'recurrenceEnd',
  ] as const;

  const commitEdit = (scope: ApplyScope) => {
    if (!draft || !event || !classInstance) return;

    const changes = diffInstance(
      classInstance,
      draft,
      EDITABLE_FIELDS
    );
    const { addPlayers, removePlayers } = diffParticipants(
      classInstance.participants,
      draft.participants
    );

    if (addPlayers.length > 0) {
      (changes as any).addPlayers = addPlayers;
    }

    if (removePlayers.length > 0) {
      (changes as any).removePlayers = removePlayers;
    }

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
    if (!event) return;

    if (!event.isRecurring) {
      onDelete(event, 'single');
      onClose();
    } else {
      setDeleteDialogOpen(true);
    }
  };

  const togglePlayer = (playerId: string) => {
    if (!draft) return;

    setDraft({
      ...draft,
      participants: draft.participants.some(p => p.id === playerId)
        ? draft.participants.filter(p => p.id !== playerId)
        : [
            ...draft.participants,
            {
              id: playerId,
              user: players.find(p => p.playerId === playerId)!,
            },
          ],
    });
  };

  /* ------------------------------------------------ */
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? (
              <Input
                value={active.name}
                onChange={(e) =>
                  setDraft(d => d ? { ...d, name: e.target.value } : d)
                }
              />
            ) : (
              active.name
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Date & Time */}
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />

              {isEditing ? (
                <div className="flex gap-3 items-center">
                  <Input
                    type="date"
                    value={active.date}
                    onChange={(e) =>
                      setDraft(d => d ? { ...d, date: e.target.value } : d)
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
                          setDraft(d =>
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
                    {format(new Date(active.date), 'EEEE, MMMM d', { locale: enUS })}
                  </span>

                  {active.recurrenceEnd && !active.parentClassId && (
                    <span className="text-xs text-muted-foreground">
                      · repeats until{' '}
                      {format(new Date(active.recurrenceEnd), 'MMM d', { locale: enUS })}
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
                      setDraft(d => d ? { ...d, startTime: e.target.value } : d)
                    }
                  />
                  <Input
                    type="time"
                    value={active.endTime}
                    onChange={(e) =>
                      setDraft(d => d ? { ...d, endTime: e.target.value } : d)
                    }
                  />
                </div>
              ) : (
                `${active.startTime} – ${active.endTime}`
              )}
            </div>
          </div>

          <Separator />

          {/* Color */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Color</div>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(color => (
                <button
                  key={color}
                  disabled={!isEditing}
                  onClick={() =>
                    setDraft(d => d ? { ...d, color } : d)
                  }
                  className={cn(
                    'w-8 h-8 rounded-full',
                    active.color === color &&
                      'ring-2 ring-offset-2 ring-primary'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <Separator />

          {/* Level */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Level</div>
            <Select
              disabled={!isEditing}
              value={active.levelId ?? ''}
              onValueChange={(value) =>
                setDraft(d => d ? { ...d, levelId: value || null } : d)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                {levels.map(level => (
                  <SelectItem key={level.id} value={level.id}>
                    {level.code} – {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Max Players */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Max players</div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                disabled={!isEditing}
                onClick={() =>
                  setDraft(d =>
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
                  setDraft(d =>
                    d ? { ...d, maxPlayers: d.maxPlayers + 1 } : d
                  )
                }
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <Separator />

          {/* Participants & Attendance */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Participants ({active.participants.length}/{active.maxPlayers})
            </h4>

            <div className={cn('space-y-2', isEditing && 'max-h-48 overflow-y-auto')}>
              {(isEditing ? players : active.participants.map(p => p.user)).map(
                (player) => {
                  const selected = active.participants.some(
                    p => p.id === player.playerId
                  );

                  return (
                    <div
                      key={`player-${player.playerId ?? player.id}`}
                      onClick={
                        isEditing
                          ? () => togglePlayer(player.playerId)
                          : undefined
                      }
                      className={cn(
                        'flex items-center gap-3 p-2 rounded-lg',
                        isEditing
                          ? selected
                            ? 'bg-primary/10 cursor-pointer'
                            : 'hover:bg-muted cursor-pointer'
                          : 'bg-muted/50'
                      )}
                    >
                      {isEditing && <Checkbox checked={selected} />}
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(player.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{player.name}</span>
                    </div>
                  );
                }
              )}
            </div>
          </div>

          <Separator />

          {/* Actions */}
          {!isEditing ? (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={startEdit}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={handleDeleteClick}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
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

      {/* Delete scope */}
      <ClassScopeDialog
        open={deleteDialogOpen}
        mode="delete"
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={(scope) => {
          setDeleteDialogOpen(false);
          if (event) {
            onDelete(event, scope);
          }
          onClose();
        }}
      />

      {/* Edit scope */}
      <ClassScopeDialog
        open={editScopeDialogOpen}
        mode="edit"
        onClose={() => setEditScopeDialogOpen(false)}
        onConfirm={commitEdit}
      />
    </Sheet>
  );
}
