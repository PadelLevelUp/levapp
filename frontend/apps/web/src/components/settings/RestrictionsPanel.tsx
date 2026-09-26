import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { NotificationRestrictions } from "@/types";
import { searchPlayers } from "@/api/notificationEngine";
import {
  canStepRestriction,
  isValidQuietWindow,
  QUIET_HOURS_STEP_SECONDS,
  quietWindowOf,
  stepRestriction,
  type QuietWindow,
  type SteppedRestrictionKey,
} from "@levelup/config";

interface RestrictionRowProps {
  label: string;
  description: string;
  enabled: boolean;
  value?: number;
  unit?: string;
  /** PAD-433: bounds and step come from @levelup/config's RESTRICTION_BOUNDS, shared with iOS. */
  boundKey?: SteppedRestrictionKey;
  showValue: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onIncrement?: () => void;
  onDecrement?: () => void;
  testId?: string;
}

function RestrictionRow({
  label,
  description,
  enabled,
  value,
  unit,
  boundKey,
  showValue,
  disabled,
  onToggle,
  onIncrement,
  onDecrement,
  testId,
}: RestrictionRowProps) {
  return (
    <div className={`space-y-1 ${disabled ? "opacity-50 pointer-events-none" : ""}`} data-testid={testId}>
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
                disabled={value !== undefined && boundKey !== undefined && !canStepRestriction(boundKey, value, -1)}
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
                disabled={value !== undefined && boundKey !== undefined && !canStepRestriction(boundKey, value, 1)}
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

interface ScalarStepperRowProps {
  label: string;
  description: string;
  value: number;
  unit?: string;
  boundKey: SteppedRestrictionKey;
  disabled?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}

/**
 * A stepper row for a plain scalar restriction (no enable/disable toggle), used
 * for the cancellation deadline. Mirrors the RestrictionRow stepper style but is
 * always active. See PAD-45.
 */
function ScalarStepperRow({
  label,
  description,
  value,
  unit,
  boundKey,
  disabled,
  onIncrement,
  onDecrement,
}: ScalarStepperRowProps) {
  return (
    <div className={`space-y-1 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={onDecrement}
              disabled={!canStepRestriction(boundKey, value, -1)}
            >
              <Minus className="w-3 h-3" />
            </Button>
            <span className="text-sm font-semibold w-8 text-center">{value}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={onIncrement}
              disabled={!canStepRestriction(boundKey, value, 1)}
            >
              <Plus className="w-3 h-3" />
            </Button>
            {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ExcludedPlayersRowProps {
  enabled: boolean;
  playerIds: string[];
  /** PAD-433 / B-168: names from the config GET, so a reload still names each chip. */
  excludedPlayerNames: Record<string, string>;
  onToggle: () => void;
  onAddPlayer: (id: string, name: string) => void;
  onRemovePlayer: (id: string) => void;
  disabled?: boolean;
  testId?: string;
}

function ExcludedPlayersRow({
  enabled,
  playerIds,
  excludedPlayerNames,
  onToggle,
  onAddPlayer,
  onRemovePlayer,
  disabled,
  testId,
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
    <div className={`space-y-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`} data-testid={testId}>
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
                  <span className="text-xs">{playerNames[id] ?? excludedPlayerNames[id] ?? id}</span>
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

/**
 * PAD-451 (notifications.config rule 6a): quiet hours with the coach's own window. The pickers
 * step by 30 minutes; a window the server would refuse (empty, off the grid) is not reported, so
 * it is never saved, and the row says why.
 */
function QuietHoursRow({
  quiet,
  disabled,
  onToggle,
  onWindow,
}: {
  quiet: NotificationRestrictions["quietHours"];
  disabled?: boolean;
  onToggle: () => void;
  onWindow: (window: QuietWindow) => void;
}) {
  const { t } = useTranslation();
  const window = quietWindowOf(quiet);
  const [invalid, setInvalid] = useState(false);
  const edit = (patch: Partial<QuietWindow>) => {
    const next = { ...window, ...patch };
    if (!isValidQuietWindow(next.start, next.end)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onWindow(next);
  };
  return (
    <div className={`space-y-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`} data-testid="restriction-row-quiet-hours">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{t("settings.restrictions.quietHours")}</p>
          <p className="text-xs text-muted-foreground">
            {t("settings.restrictions.quietHoursDescription", { start: window.start, end: window.end })}
          </p>
        </div>
        <Switch checked={quiet.enabled} onCheckedChange={onToggle} />
      </div>
      {quiet.enabled && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="quiet-hours-start">
              {t("settings.restrictions.quietHoursStart")}
            </label>
            <Input
              id="quiet-hours-start"
              type="time"
              step={QUIET_HOURS_STEP_SECONDS}
              value={window.start}
              onChange={(e) => edit({ start: e.target.value })}
              className="h-8 w-28 text-sm"
              data-testid="restriction-quietHours-start"
            />
            <label className="text-xs text-muted-foreground" htmlFor="quiet-hours-end">
              {t("settings.restrictions.quietHoursEnd")}
            </label>
            <Input
              id="quiet-hours-end"
              type="time"
              step={QUIET_HOURS_STEP_SECONDS}
              value={window.end}
              onChange={(e) => edit({ end: e.target.value })}
              className="h-8 w-28 text-sm"
              data-testid="restriction-quietHours-end"
            />
          </div>
          {invalid && (
            <p className="text-xs text-destructive" data-testid="restriction-quietHours-error">
              {t("settings.restrictions.quietHoursInvalid")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t("settings.restrictions.quietHoursHint")}</p>
        </div>
      )}
    </div>
  );
}

interface RestrictionsPanelProps {
  restrictions: NotificationRestrictions;
  /** PAD-433 / B-168: `config.excludedPlayerNames` from GET /notify/config. */
  excludedPlayerNames?: Record<string, string>;
  onChange: (restrictions: NotificationRestrictions) => void;
  disabled?: boolean;
}

export function RestrictionsPanel({ restrictions, excludedPlayerNames = {}, onChange, disabled }: RestrictionsPanelProps) {
  const { t } = useTranslation();
  // Only the object-valued restriction keys go through this helper; the scalar
  // cancellationDeadlineHours is updated directly via onChange (see below).
  type ObjectRestrictionKey = {
    [K in keyof NotificationRestrictions]: NotificationRestrictions[K] extends object
      ? K
      : never;
  }[keyof NotificationRestrictions];
  const update = (key: ObjectRestrictionKey, patch: object) => {
    onChange({ ...restrictions, [key]: { ...restrictions[key], ...patch } });
  };
  // Plain scalar (hours before class start); default 24 for configs saved before
  // the field existed. See PAD-45.
  const cancellationDeadline = restrictions.cancellationDeadlineHours ?? 24;

  return (
    <div className="space-y-4">
      <RestrictionRow
        label={t("settings.restrictions.maxSimultaneous")}
        description={t("settings.restrictions.maxSimultaneousDescription")}
        enabled={restrictions.maxSimultaneous.enabled}
        value={restrictions.maxSimultaneous.value}
        unit={t("settings.restrictions.students")}
        boundKey="maxSimultaneous"
        showValue
        disabled={disabled}
        onToggle={() => update("maxSimultaneous", { enabled: !restrictions.maxSimultaneous.enabled })}
        onIncrement={() => update("maxSimultaneous", { value: stepRestriction("maxSimultaneous", restrictions.maxSimultaneous.value, 1) })}
        onDecrement={() => update("maxSimultaneous", { value: stepRestriction("maxSimultaneous", restrictions.maxSimultaneous.value, -1) })}
      />

      <RestrictionRow
        label={t("settings.restrictions.maxTotal")}
        description={t("settings.restrictions.maxTotalDescription")}
        enabled={restrictions.maxTotal.enabled}
        value={restrictions.maxTotal.value}
        unit={t("settings.restrictions.total")}
        boundKey="maxTotal"
        showValue
        disabled={disabled}
        onToggle={() => update("maxTotal", { enabled: !restrictions.maxTotal.enabled })}
        onIncrement={() => update("maxTotal", { value: stepRestriction("maxTotal", restrictions.maxTotal.value, 1) })}
        onDecrement={() => update("maxTotal", { value: stepRestriction("maxTotal", restrictions.maxTotal.value, -1) })}
      />

      <RestrictionRow
        label={t("settings.restrictions.maxInactiveTime")}
        description={t("settings.restrictions.maxInactiveTimeDescription")}
        enabled={restrictions.maxInactiveTime.enabled}
        value={restrictions.maxInactiveTime.value}
        unit={t("settings.restrictions.min")}
        boundKey="maxInactiveTime"
        showValue
        disabled={disabled}
        onToggle={() => update("maxInactiveTime", { enabled: !restrictions.maxInactiveTime.enabled })}
        onIncrement={() => update("maxInactiveTime", { value: stepRestriction("maxInactiveTime", restrictions.maxInactiveTime.value, 1) })}
        onDecrement={() => update("maxInactiveTime", { value: stepRestriction("maxInactiveTime", restrictions.maxInactiveTime.value, -1) })}
        testId="restriction-row-max-inactive-time"
      />

      <RestrictionRow
        label={t("settings.restrictions.minTimeBeforeClass")}
        description={t("settings.restrictions.minTimeBeforeClassDescription")}
        enabled={restrictions.minTimeBeforeClass.enabled}
        value={restrictions.minTimeBeforeClass.value}
        unit={t("settings.restrictions.min")}
        boundKey="minTimeBeforeClass"
        showValue
        disabled={disabled}
        onToggle={() => update("minTimeBeforeClass", { enabled: !restrictions.minTimeBeforeClass.enabled })}
        onIncrement={() => update("minTimeBeforeClass", { value: stepRestriction("minTimeBeforeClass", restrictions.minTimeBeforeClass.value, 1) })}
        onDecrement={() => update("minTimeBeforeClass", { value: stepRestriction("minTimeBeforeClass", restrictions.minTimeBeforeClass.value, -1) })}
      />

      <RestrictionRow
        label={t("settings.restrictions.maxInvitesPerStudent")}
        description={t("settings.restrictions.maxInvitesPerStudentDescription")}
        enabled={restrictions.maxInvitesPerStudentPerDay.enabled}
        value={restrictions.maxInvitesPerStudentPerDay.value}
        unit={t("settings.restrictions.perDay")}
        boundKey="maxInvitesPerStudentPerDay"
        showValue
        disabled={disabled}
        onToggle={() => update("maxInvitesPerStudentPerDay", { enabled: !restrictions.maxInvitesPerStudentPerDay.enabled })}
        onIncrement={() => update("maxInvitesPerStudentPerDay", { value: stepRestriction("maxInvitesPerStudentPerDay", restrictions.maxInvitesPerStudentPerDay.value, 1) })}
        onDecrement={() => update("maxInvitesPerStudentPerDay", { value: stepRestriction("maxInvitesPerStudentPerDay", restrictions.maxInvitesPerStudentPerDay.value, -1) })}
      />

      <QuietHoursRow
        quiet={restrictions.quietHours}
        disabled={disabled}
        onToggle={() => update("quietHours", { enabled: !restrictions.quietHours.enabled })}
        onWindow={(w) => update("quietHours", w)}
      />

      <ExcludedPlayersRow
        enabled={restrictions.excludedPlayers.enabled}
        playerIds={restrictions.excludedPlayers.playerIds}
        excludedPlayerNames={excludedPlayerNames}
        onToggle={() => update("excludedPlayers", { enabled: !restrictions.excludedPlayers.enabled })}
        onAddPlayer={(id) => update("excludedPlayers", { playerIds: [...restrictions.excludedPlayers.playerIds, id] })}
        onRemovePlayer={(id) => update("excludedPlayers", { playerIds: restrictions.excludedPlayers.playerIds.filter((p) => p !== id) })}
        disabled={disabled}
        testId="restriction-row-excluded-players"
      />

      <RestrictionRow
        label={t("settings.restrictions.excludeUnpaid")}
        description={t("settings.restrictions.excludeUnpaidDescription")}
        enabled={restrictions.excludeUnpaidSubscription.enabled}
        showValue={false}
        disabled={disabled}
        onToggle={() => update("excludeUnpaidSubscription", { enabled: !restrictions.excludeUnpaidSubscription.enabled })}
        testId="restriction-row-exclude-unpaid"
      />

      <ScalarStepperRow
        label={t("settings.restrictions.cancellationDeadline")}
        description={t("settings.restrictions.cancellationDeadlineDescription")}
        value={cancellationDeadline}
        unit={t("settings.restrictions.hours")}
        boundKey="cancellationDeadlineHours"
        disabled={disabled}
        onIncrement={() => onChange({ ...restrictions, cancellationDeadlineHours: stepRestriction("cancellationDeadlineHours", cancellationDeadline, 1) })}
        onDecrement={() => onChange({ ...restrictions, cancellationDeadlineHours: stepRestriction("cancellationDeadlineHours", cancellationDeadline, -1) })}
      />
    </div>
  );
}
