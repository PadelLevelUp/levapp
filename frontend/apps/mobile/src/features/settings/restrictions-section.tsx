import { notificationEngineApi } from "@levelup/api";
import {
  canStepRestriction,
  isValidQuietWindow,
  lightTheme,
  quietWindowOf,
  stepRestriction,
  type QuietWindow,
  type SteppedRestrictionKey,
} from "@levelup/config";
import type { NotificationRestrictions } from "@levelup/types";
import { Ionicons } from "@expo/vector-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TimePickerInput } from "@/components/ui/time-picker-input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * The notification engine's restrictions on iOS — notifications.config rule 14 (PAD-433),
 * the port of web's RestrictionsPanel. Controlled like web's: it renders `restrictions` and
 * reports every edit through `onChange` with the whole object, which the caller saves.
 *
 * Bounds and steps are @levelup/config's RESTRICTION_BOUNDS, the ones web reads, so the
 * two clients offer the same ranges. Excluded players are named from the config's
 * `excludedPlayerNames` (rule 14a, B-168) or from this session's search.
 *
 * Tap-to-save, so nothing moves under the finger: the switch sits at the row's right edge,
 * the stepper gets its own line under the label (a phone is too narrow for web's single
 * line — the unit wrapped), and the value has a fixed-width slot.
 */
export interface RestrictionsSectionProps {
  restrictions: NotificationRestrictions;
  excludedPlayerNames?: Record<string, string>;
  onChange: (restrictions: NotificationRestrictions) => void;
  disabled?: boolean;
}

type ToggledKey = Exclude<keyof NotificationRestrictions, "cancellationDeadlineHours">;

function RowText({ label, description }: { label: string; description: string }) {
  return (
    <View className="min-w-0 flex-1">
      <Text className="text-sm font-medium">{label}</Text>
      <Text className="text-xs text-muted-foreground">{description}</Text>
    </View>
  );
}

function Stepper({
  id,
  boundKey,
  value,
  unit,
  disabled,
  onStep,
}: {
  id: string;
  boundKey: SteppedRestrictionKey;
  value: number;
  unit: string;
  disabled?: boolean;
  onStep: (direction: 1 | -1) => void;
}) {
  const button = (direction: 1 | -1) => {
    const off = !!disabled || !canStepRestriction(boundKey, value, direction);
    return (
      <Pressable
        testID={`restriction-${id}-${direction > 0 ? "inc" : "dec"}`}
        accessibilityRole="button"
        accessibilityLabel={direction > 0 ? "+" : "−"}
        accessibilityState={{ disabled: off }}
        disabled={off}
        onPress={() => onStep(direction)}
        hitSlop={6}
        className={cn(
          "h-8 w-8 items-center justify-center rounded-md border border-input bg-background",
          off && "opacity-40"
        )}
      >
        <Ionicons name={direction > 0 ? "add" : "remove"} size={16} color={lightTheme.foreground} />
      </Pressable>
    );
  };
  return (
    <View className="flex-row items-center gap-1">
      {button(-1)}
      <Text testID={`restriction-${id}-value`} className="w-11 text-center text-sm font-semibold">
        {String(value)}
      </Text>
      {button(1)}
      <Text className="ml-1 text-xs text-muted-foreground">{unit}</Text>
    </View>
  );
}

/**
 * PAD-451 (notifications.config rule 6a): quiet hours with the coach's own window, on the same
 * 30-minute grid as web. A window the server would refuse is not reported, and the row says why.
 */
function QuietHours({
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
  const [invalid, setInvalid] = React.useState(false);
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
    <View testID="restriction-row-quietHours" className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <RowText
          label={t("settings.restrictions.quietHours")}
          description={t("settings.restrictions.quietHoursDescription", { start: window.start, end: window.end })}
        />
        <Switch
          testID="restriction-quietHours-toggle"
          accessibilityLabel={t("settings.restrictions.quietHours")}
          checked={quiet.enabled}
          disabled={disabled}
          onCheckedChange={onToggle}
        />
      </View>
      {quiet.enabled ? (
        <View className="gap-1.5">
          <View className="flex-row items-center gap-2">
            <Text className="text-xs text-muted-foreground">{t("settings.restrictions.quietHoursStart")}</Text>
            <View className="w-24">
              <TimePickerInput
                testID="restriction-quietHours-start"
                value={window.start}
                onChange={(start) => edit({ start })}
                minuteInterval={30}
                disabled={disabled}
              />
            </View>
            <Text className="text-xs text-muted-foreground">{t("settings.restrictions.quietHoursEnd")}</Text>
            <View className="w-24">
              <TimePickerInput
                testID="restriction-quietHours-end"
                value={window.end}
                onChange={(end) => edit({ end })}
                minuteInterval={30}
                disabled={disabled}
              />
            </View>
          </View>
          {invalid ? (
            <Text testID="restriction-quietHours-error" className="text-xs text-destructive">
              {t("settings.restrictions.quietHoursInvalid")}
            </Text>
          ) : null}
          <Text className="text-xs text-muted-foreground">{t("settings.restrictions.quietHoursHint")}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ExcludedPlayers({
  enabled,
  playerIds,
  names,
  disabled,
  onToggle,
  onAdd,
  onRemove,
}: {
  enabled: boolean;
  playerIds: string[];
  names: Record<string, string>;
  disabled?: boolean;
  onToggle: () => void;
  onAdd: (player: { id: string; name: string }) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<{ id: string; name: string }[]>([]);

  React.useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      notificationEngineApi
        .searchPlayers(query)
        .then((data) => {
          if (alive) setResults(data.players.filter((p) => !playerIds.includes(p.id)));
        })
        .catch(() => {
          if (alive) setResults([]);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, playerIds]);

  return (
    <View testID="restriction-row-excludedPlayers" className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <RowText
          label={t("settings.restrictions.excludedPlayers")}
          description={t("settings.restrictions.excludedPlayersDescription")}
        />
        <Switch
          testID="restriction-excludedPlayers-toggle"
          accessibilityLabel={t("settings.restrictions.excludedPlayers")}
          checked={enabled}
          disabled={disabled}
          onCheckedChange={onToggle}
        />
      </View>
      {enabled ? (
        <View className="gap-2">
          <Input
            testID="restriction-excluded-search"
            placeholder={t("settings.restrictions.searchPlayers")}
            value={query}
            onChangeText={setQuery}
            editable={!disabled}
            autoCorrect={false}
            className="h-10 text-sm"
          />
          {results.length > 0 ? (
            <View className="overflow-hidden rounded-md border border-border">
              {results.map((p) => (
                <Pressable
                  key={p.id}
                  testID={`restriction-excluded-result-${p.id}`}
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => {
                    onAdd(p);
                    setQuery("");
                    setResults([]);
                  }}
                  className="border-b border-border px-3 py-2.5"
                >
                  <Text className="text-sm">{p.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {playerIds.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5">
              {playerIds.map((id) => (
                <View key={id} className="flex-row items-center gap-1 rounded-full bg-secondary py-1 pl-2.5 pr-1">
                  <Text testID={`restriction-excluded-chip-${id}`} className="text-xs">
                    {names[id] ?? id}
                  </Text>
                  <Pressable
                    testID={`restriction-excluded-remove-${id}`}
                    accessibilityRole="button"
                    accessibilityLabel={names[id] ?? id}
                    disabled={disabled}
                    onPress={() => onRemove(id)}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={14} color={lightTheme.mutedForeground} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function RestrictionsSection({
  restrictions,
  excludedPlayerNames = {},
  onChange,
  disabled,
}: RestrictionsSectionProps) {
  const { t } = useTranslation();
  // Names picked from the search in this session, on top of the config's (B-168).
  const [pickedNames, setPickedNames] = React.useState<Record<string, string>>({});
  const names = { ...excludedPlayerNames, ...pickedNames };

  const update = <K extends ToggledKey>(key: K, patch: Partial<NotificationRestrictions[K]>) =>
    onChange({ ...restrictions, [key]: { ...restrictions[key], ...patch } });

  const toggleRow = (key: ToggledKey, label: string, description: string, stepper?: {
    boundKey: SteppedRestrictionKey & ToggledKey;
    unit: string;
  }) => {
    const state = restrictions[key] as { enabled: boolean; value?: number };
    return (
      <View testID={`restriction-row-${key}`} className="gap-2">
        <View className="flex-row items-center justify-between gap-3">
          <RowText label={label} description={description} />
          <Switch
            testID={`restriction-${key}-toggle`}
            accessibilityLabel={label}
            checked={state.enabled}
            disabled={disabled}
            onCheckedChange={() => update(key, { enabled: !state.enabled } as never)}
          />
        </View>
        {stepper && state.enabled && state.value !== undefined ? (
          <Stepper
            id={key}
            boundKey={stepper.boundKey}
            value={state.value}
            unit={stepper.unit}
            disabled={disabled}
            onStep={(d) =>
              update(stepper.boundKey, { value: stepRestriction(stepper.boundKey, state.value as number, d) })
            }
          />
        ) : null}
      </View>
    );
  };

  const deadline = restrictions.cancellationDeadlineHours ?? 24;
  const r = "settings.restrictions";

  return (
    <View className={cn("gap-4", disabled && "opacity-50")}>
      {toggleRow("maxSimultaneous", t(`${r}.maxSimultaneous`), t(`${r}.maxSimultaneousDescription`), {
        boundKey: "maxSimultaneous",
        unit: t(`${r}.students`),
      })}
      {toggleRow("maxTotal", t(`${r}.maxTotal`), t(`${r}.maxTotalDescription`), {
        boundKey: "maxTotal",
        unit: t(`${r}.total`),
      })}
      {toggleRow("maxInactiveTime", t(`${r}.maxInactiveTime`), t(`${r}.maxInactiveTimeDescription`), {
        boundKey: "maxInactiveTime",
        unit: t(`${r}.min`),
      })}
      {toggleRow("minTimeBeforeClass", t(`${r}.minTimeBeforeClass`), t(`${r}.minTimeBeforeClassDescription`), {
        boundKey: "minTimeBeforeClass",
        unit: t(`${r}.min`),
      })}
      {toggleRow(
        "maxInvitesPerStudentPerDay",
        t(`${r}.maxInvitesPerStudent`),
        t(`${r}.maxInvitesPerStudentDescription`),
        { boundKey: "maxInvitesPerStudentPerDay", unit: t(`${r}.perDay`) }
      )}
      <QuietHours
        quiet={restrictions.quietHours}
        disabled={disabled}
        onToggle={() => update("quietHours", { enabled: !restrictions.quietHours.enabled })}
        onWindow={(w) => update("quietHours", w)}
      />
      <ExcludedPlayers
        enabled={restrictions.excludedPlayers.enabled}
        playerIds={restrictions.excludedPlayers.playerIds}
        names={names}
        disabled={disabled}
        onToggle={() => update("excludedPlayers", { enabled: !restrictions.excludedPlayers.enabled })}
        onAdd={(p) => {
          setPickedNames((prev) => ({ ...prev, [p.id]: p.name }));
          update("excludedPlayers", { playerIds: [...restrictions.excludedPlayers.playerIds, p.id] });
        }}
        onRemove={(id) =>
          update("excludedPlayers", {
            playerIds: restrictions.excludedPlayers.playerIds.filter((p) => p !== id),
          })
        }
      />
      {toggleRow("excludeUnpaidSubscription", t(`${r}.excludeUnpaid`), t(`${r}.excludeUnpaidDescription`))}
      <View testID="restriction-row-cancellationDeadlineHours" className="gap-2">
        <RowText label={t(`${r}.cancellationDeadline`)} description={t(`${r}.cancellationDeadlineDescription`)} />
        <Stepper
          id="cancellationDeadlineHours"
          boundKey="cancellationDeadlineHours"
          value={deadline}
          unit={t(`${r}.hours`)}
          disabled={disabled}
          onStep={(d) =>
            onChange({ ...restrictions, cancellationDeadlineHours: stepRestriction("cancellationDeadlineHours", deadline, d) })
          }
        />
      </View>
    </View>
  );
}
