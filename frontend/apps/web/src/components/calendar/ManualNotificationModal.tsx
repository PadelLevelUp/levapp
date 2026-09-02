import { useState, useMemo, useEffect, useId } from "react";
import { ChevronDown, ChevronRight, Search, Send } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { CoachPlayer, StudentGroup } from "@/types";
import { sendManualNotifications, getNotificationGroups } from "@/api/notificationEngine";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

interface PlayerToggleRowProps {
  playerId: string;
  name: string;
  levelCode?: string | null;
  selected: boolean;
  onToggle: (playerId: string) => void;
  /** Group rows sit inside a bordered card, so they get slightly tighter spacing. */
  compact?: boolean;
}

/**
 * PAD-74: a single click target for the whole row.
 *
 * The row is a <label> bound to its checkbox via htmlFor, so clicking the
 * checkbox, the avatar or the name all produce exactly one toggle. The previous
 * markup had an onClick on the row AND an onCheckedChange on the checkbox, so
 * clicking the checkbox fired both handlers and the selection toggled twice —
 * which looked like the checkbox being completely unresponsive.
 */
function PlayerToggleRow({
  playerId,
  name,
  levelCode,
  selected,
  onToggle,
  compact = false,
}: PlayerToggleRowProps) {
  // useId (not the player id): the same player can legitimately appear in more
  // than one group and in the search results, and duplicate DOM ids would break
  // the label↔checkbox association.
  const checkboxId = useId();
  return (
    <label
      htmlFor={checkboxId}
      className={cn(
        "flex items-center gap-3 rounded-lg cursor-pointer transition-colors",
        compact ? "p-2" : "p-2.5",
        selected ? "bg-primary/10" : "hover:bg-muted"
      )}
    >
      <Checkbox id={checkboxId} checked={selected} onCheckedChange={() => onToggle(playerId)} />
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div
          className={cn(
            "rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0",
            compact ? "w-6 h-6" : "w-7 h-7"
          )}
        >
          {getInitials(name)}
        </div>
        <span className="text-sm truncate">{name}</span>
        {levelCode && <span className="text-xs text-muted-foreground shrink-0">{levelCode}</span>}
      </div>
    </label>
  );
}

interface ManualNotificationModalProps {
  open: boolean;
  onClose: () => void;
  eventModel: string;
  eventOriginalId: string;
  eventDate: string;
  coachPlayers: CoachPlayer[];
  existingPlayerIds: string[];
  className?: string;
}

export function ManualNotificationModal({
  open,
  onClose,
  eventModel,
  eventOriginalId,
  eventDate,
  coachPlayers,
  existingPlayerIds,
}: ManualNotificationModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loadingGroups, setLoadingGroups] = useState(false);

  const existingSet = useMemo(() => new Set(existingPlayerIds), [existingPlayerIds]);

  useEffect(() => {
    if (!open) return;
    setLoadingGroups(true);
    getNotificationGroups(eventModel, eventOriginalId, eventDate)
      .then(setGroups)
      .catch(() => setGroups([]))
      .finally(() => setLoadingGroups(false));
  }, [open, eventModel, eventOriginalId, eventDate]);

  const allEligible = useMemo(
    () => coachPlayers.filter((p) => !existingSet.has(p.playerId)),
    [coachPlayers, existingSet]
  );

  const searchResults = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return allEligible.filter((p) => p.name.toLowerCase().includes(q));
  }, [allEligible, search]);

  const togglePlayer = (playerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(playerId) ? next.delete(playerId) : next.add(playerId);
      return next;
    });
  };

  const toggleGroup = (group: StudentGroup) => {
    const ids = group.players.map((p) => p.id);
    const allSel = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSel) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  const isGroupAllSelected = (group: StudentGroup) =>
    group.players.length > 0 && group.players.every((p) => selected.has(p.id));

  const isGroupPartiallySelected = (group: StudentGroup) =>
    group.players.some((p) => selected.has(p.id)) && !isGroupAllSelected(group);

  const handleSend = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const { sent, blocked } = await sendManualNotifications(
        eventModel,
        eventOriginalId,
        eventDate,
        [...selected]
      );
      // A student can be skipped for two unrelated reasons, and the coach needs
      // to be told a different thing for each, so `blocked` is split by cause
      // rather than shown as one undifferentiated list.
      const unavailable = blocked.filter((b) => b.cause !== "preference");
      const optedOut = blocked.filter((b) => b.cause === "preference");

      // PAD-107: students who marked themselves unavailable for this slot are
      // never notified — say so by name instead of silently under-reporting.
      if (unavailable.length > 0) {
        toast.error(
          t("calendar.unavailable.blocked", {
            count: unavailable.length,
            names: unavailable.map((b) => b.name).filter(Boolean).join(", "),
          })
        );
      }
      // PAD-112: same idea for a student who turned invitations off. A silently
      // short count reads as a bug; naming them (and their own reason) makes it
      // legible as their choice.
      if (optedOut.length > 0) {
        toast.warning(
          t("calendar.notify.blockedByPreference", {
            names: optedOut.map((b) => b.name).filter(Boolean).join(", "),
          }),
          { description: optedOut.map((b) => b.reason).filter(Boolean).join(" · ") || undefined },
        );
      }
      // PAD-107's ordering: don't crow "sent to 0 students" when everyone was
      // skipped — the error/warning above already told the whole story.
      if (sent > 0 || blocked.length === 0) {
        toast.success(t("calendar.notify.invitationSent", { count: sent }));
      }
      setSelected(new Set());
      setSearch("");
      onClose();
    } catch {
      toast.error(t("calendar.notify.failedSendInvitations"));
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setSelected(new Set());
    setSearch("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("calendar.notify.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto p-1">
          {/* Groups */}
          {loadingGroups ? (
            <p className="text-xs text-muted-foreground text-center py-2">{t("calendar.notify.loadingGroups")}</p>
          ) : (
            groups.map((group) => {
              const isExpanded = expandedGroups.has(group.id);
              const allSel = isGroupAllSelected(group);
              const partial = isGroupPartiallySelected(group);
              return (
                <div key={group.id} className="rounded-lg border overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40">
                    <Checkbox
                      checked={allSel ? true : partial ? "indeterminate" : false}
                      onCheckedChange={() => toggleGroup(group)}
                      className="shrink-0"
                      aria-label={t("calendar.notify.selectAllIn", { group: group.label })}
                    />
                    <button
                      type="button"
                      className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                      onClick={() => toggleExpanded(group.id)}
                    >
                      <span className="text-sm font-medium truncate">{group.label}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        ({group.players.length})
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0" />
                      )}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-2 py-1 space-y-0.5">
                      {group.players.map((p) => (
                        <PlayerToggleRow
                          key={p.id}
                          playerId={p.id}
                          name={p.name}
                          levelCode={p.levelCode}
                          selected={selected.has(p.id)}
                          onToggle={togglePlayer}
                          compact
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Individual search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("calendar.notify.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {search && (
            <div className="space-y-0.5">
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">{t("calendar.notify.noResults")}</p>
              ) : (
                searchResults.map((p) => (
                  <PlayerToggleRow
                    key={p.playerId}
                    playerId={p.playerId}
                    name={p.name}
                    levelCode={p.level?.code}
                    selected={selected.has(p.playerId)}
                    onToggle={togglePlayer}
                  />
                ))
              )}
            </div>
          )}

          {!loadingGroups && groups.length === 0 && !search && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("calendar.notify.noEligibleStudents")}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={sending}>
            {t("common.cancel")}
          </Button>
          <Button disabled={selected.size === 0 || sending} onClick={handleSend}>
            <Send className="w-4 h-4 mr-2" />
            {selected.size > 0
              ? t("calendar.notify.sendToCount", { count: selected.size })
              : t("calendar.notify.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
