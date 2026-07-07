import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { NotificationRestrictions } from "@/types";
import { searchPlayers } from "@/api/notificationEngine";

interface RestrictionRowProps {
  label: string;
  description: string;
  enabled: boolean;
  value?: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  showValue: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onIncrement?: () => void;
  onDecrement?: () => void;
}

function RestrictionRow({
  label,
  description,
  enabled,
  value,
  unit,
  min,
  max,
  showValue,
  disabled,
  onToggle,
  onIncrement,
  onDecrement,
}: RestrictionRowProps) {
  return (
    <div className={`space-y-1 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showValue && enabled && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={onDecrement}
                disabled={value !== undefined && min !== undefined && value <= min}
              >
                <Minus className="w-3 h-3" />
              </Button>
              <span className="text-sm font-semibold w-8 text-center">
                {value}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={onIncrement}
                disabled={value !== undefined && max !== undefined && value >= max}
              >
                <Plus className="w-3 h-3" />
              </Button>
              {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
            </div>
          )}
          <Switch checked={enabled} onCheckedChange={onToggle} />
        </div>
      </div>
    </div>
  );
}

interface ExcludedPlayersRowProps {
  enabled: boolean;
  playerIds: string[];
  onToggle: () => void;
  onAddPlayer: (id: string, name: string) => void;
  onRemovePlayer: (id: string) => void;
  disabled?: boolean;
}

function ExcludedPlayersRow({
  enabled,
  playerIds,
  onToggle,
  onAddPlayer,
  onRemovePlayer,
  disabled,
}: ExcludedPlayersRowProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      try {
        const data = await searchPlayers(query);
        setResults(data.players.filter((p) => !playerIds.includes(p.id)));
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 300);
  }, [query, playerIds]);

  const handleAdd = (player: { id: string; name: string }) => {
    setPlayerNames((prev) => ({ ...prev, [player.id]: player.name }));
    onAddPlayer(player.id, player.name);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div className={`space-y-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{t("settings.restrictions.excludedPlayers")}</p>
          <p className="text-xs text-muted-foreground">
            {t("settings.restrictions.excludedPlayersDescription")}
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>

      {enabled && (
        <div className="space-y-2 ml-0">
          <div className="relative">
            <Input
              placeholder={t("settings.restrictions.searchPlayers")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 text-sm"
              onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            {open && results.length > 0 && (
              <div className="absolute z-10 top-full mt-1 w-full rounded-md border bg-popover shadow-md">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                    onMouseDown={() => handleAdd(p)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {playerIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {playerIds.map((id) => (
                <Badge key={id} variant="secondary" className="gap-1 pr-1">
                  <span className="text-xs">{playerNames[id] ?? id}</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => onRemovePlayer(id)}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface RestrictionsPanelProps {
  restrictions: NotificationRestrictions;
  onChange: (restrictions: NotificationRestrictions) => void;
  disabled?: boolean;
}

export function RestrictionsPanel({ restrictions, onChange, disabled }: RestrictionsPanelProps) {
  const { t } = useTranslation();
  const update = (key: keyof NotificationRestrictions, patch: object) => {
    onChange({ ...restrictions, [key]: { ...restrictions[key], ...patch } });
  };

  return (
    <div className="space-y-4">
      <RestrictionRow
        label={t("settings.restrictions.maxSimultaneous")}
        description={t("settings.restrictions.maxSimultaneousDescription")}
        enabled={restrictions.maxSimultaneous.enabled}
        value={restrictions.maxSimultaneous.value}
        unit={t("settings.restrictions.students")}
        min={1}
        max={20}
        showValue
        disabled={disabled}
        onToggle={() => update("maxSimultaneous", { enabled: !restrictions.maxSimultaneous.enabled })}
        onIncrement={() => update("maxSimultaneous", { value: Math.min(20, restrictions.maxSimultaneous.value + 1) })}
        onDecrement={() => update("maxSimultaneous", { value: Math.max(1, restrictions.maxSimultaneous.value - 1) })}
      />

      <RestrictionRow
        label={t("settings.restrictions.maxTotal")}
        description={t("settings.restrictions.maxTotalDescription")}
        enabled={restrictions.maxTotal.enabled}
        value={restrictions.maxTotal.value}
        unit={t("settings.restrictions.total")}
        min={1}
        max={50}
        showValue
        disabled={disabled}
        onToggle={() => update("maxTotal", { enabled: !restrictions.maxTotal.enabled })}
        onIncrement={() => update("maxTotal", { value: Math.min(50, restrictions.maxTotal.value + 1) })}
        onDecrement={() => update("maxTotal", { value: Math.max(1, restrictions.maxTotal.value - 1) })}
      />

      <RestrictionRow
        label={t("settings.restrictions.maxInactiveTime")}
        description={t("settings.restrictions.maxInactiveTimeDescription")}
        enabled={restrictions.maxInactiveTime.enabled}
        value={restrictions.maxInactiveTime.value}
        unit={t("settings.restrictions.min")}
        min={15}
        max={1440}
        showValue
        disabled={disabled}
        onToggle={() => update("maxInactiveTime", { enabled: !restrictions.maxInactiveTime.enabled })}
        onIncrement={() => update("maxInactiveTime", { value: Math.min(1440, restrictions.maxInactiveTime.value + 15) })}
        onDecrement={() => update("maxInactiveTime", { value: Math.max(15, restrictions.maxInactiveTime.value - 15) })}
      />

      <RestrictionRow
        label={t("settings.restrictions.minTimeBeforeClass")}
        description={t("settings.restrictions.minTimeBeforeClassDescription")}
        enabled={restrictions.minTimeBeforeClass.enabled}
        value={restrictions.minTimeBeforeClass.value}
        unit={t("settings.restrictions.min")}
        min={5}
        max={240}
        showValue
        disabled={disabled}
        onToggle={() => update("minTimeBeforeClass", { enabled: !restrictions.minTimeBeforeClass.enabled })}
        onIncrement={() => update("minTimeBeforeClass", { value: Math.min(240, restrictions.minTimeBeforeClass.value + 5) })}
        onDecrement={() => update("minTimeBeforeClass", { value: Math.max(5, restrictions.minTimeBeforeClass.value - 5) })}
      />

      <RestrictionRow
        label={t("settings.restrictions.maxInvitesPerStudent")}
        description={t("settings.restrictions.maxInvitesPerStudentDescription")}
        enabled={restrictions.maxInvitesPerStudentPerDay.enabled}
        value={restrictions.maxInvitesPerStudentPerDay.value}
        unit={t("settings.restrictions.perDay")}
        min={1}
        max={10}
        showValue
        disabled={disabled}
        onToggle={() => update("maxInvitesPerStudentPerDay", { enabled: !restrictions.maxInvitesPerStudentPerDay.enabled })}
        onIncrement={() => update("maxInvitesPerStudentPerDay", { value: Math.min(10, restrictions.maxInvitesPerStudentPerDay.value + 1) })}
        onDecrement={() => update("maxInvitesPerStudentPerDay", { value: Math.max(1, restrictions.maxInvitesPerStudentPerDay.value - 1) })}
      />

      <RestrictionRow
        label={t("settings.restrictions.quietHours")}
        description={t("settings.restrictions.quietHoursDescription")}
        enabled={restrictions.quietHours.enabled}
        showValue={false}
        disabled={disabled}
        onToggle={() => update("quietHours", { enabled: !restrictions.quietHours.enabled })}
      />

      <ExcludedPlayersRow
        enabled={restrictions.excludedPlayers.enabled}
        playerIds={restrictions.excludedPlayers.playerIds}
        onToggle={() => update("excludedPlayers", { enabled: !restrictions.excludedPlayers.enabled })}
        onAddPlayer={(id) => update("excludedPlayers", { playerIds: [...restrictions.excludedPlayers.playerIds, id] })}
        onRemovePlayer={(id) => update("excludedPlayers", { playerIds: restrictions.excludedPlayers.playerIds.filter((p) => p !== id) })}
        disabled={disabled}
      />

      <RestrictionRow
        label={t("settings.restrictions.excludeUnpaid")}
        description={t("settings.restrictions.excludeUnpaidDescription")}
        enabled={restrictions.excludeUnpaidSubscription.enabled}
        showValue={false}
        disabled={disabled}
        onToggle={() => update("excludeUnpaidSubscription", { enabled: !restrictions.excludeUnpaidSubscription.enabled })}
      />
    </div>
  );
}
