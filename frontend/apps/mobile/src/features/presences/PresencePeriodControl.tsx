import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  customPresencePeriod,
  lightTheme,
  presencePeriodShortcuts,
  type PresencePeriodShortcut,
} from "@levelup/config";

import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { isDefaultChoice, shortcutChoice, type PresencePeriodChoice } from "./presences-period";

/**
 * PAD-837c (attendance.validation rule 17g) — the period at the top of the reporting surface.
 *
 * The same shape as the student's `AttendanceRangeControls` (PAD-162): a row of shortcut chips
 * plus "…", which reveals a from/to pair (the app's `DatePickerInput`, the native picker) and
 * an Apply. Inline rather than a sheet so the coach sees the KPIs move as they pick, and so the
 * date pickers' own dialogs never have to open on top of another dialog.
 *
 * What the control *shows* as the period is `label`, the server's echoed bounds (criterion 67),
 * not the chip: "Este mês" is read only up to today (rule 17h), and the label says so.
 *
 * The default is the coach's (Q5): the chip that is the default carries a mark, and any other
 * shortcut offers "Usar como predefinido", which saves it on the account (criterion 72). A custom
 * range cannot be a default — the saved value is a shortcut — so the offer is not made for one.
 */
export function PresencePeriodControl({
  choice,
  defaultPeriod,
  label,
  onChoose,
  onMakeDefault,
  savingDefault = false,
}: {
  choice: PresencePeriodChoice;
  defaultPeriod: PresencePeriodShortcut;
  /** The echoed `from – to`, or `null` while the period's payload has not arrived. */
  label: string | null;
  onChoose: (choice: PresencePeriodChoice) => void;
  onMakeDefault: (shortcut: PresencePeriodShortcut) => void;
  savingDefault?: boolean;
}) {
  const { t } = useTranslation();
  const custom = choice.kind === "custom" ? choice : null;
  const [expanded, setExpanded] = React.useState(custom !== null);
  const [from, setFrom] = React.useState(custom?.from ?? "");
  const [to, setTo] = React.useState(custom?.to ?? "");
  const [invalid, setInvalid] = React.useState(false);

  // Keep the fields in step with the choice in force (a reset on open, criterion 72, lands as
  // a shortcut), so reopening "…" never shows a stale period.
  React.useEffect(() => {
    setFrom(custom?.from ?? "");
    setTo(custom?.to ?? "");
    if (custom) setExpanded(true);
    else setInvalid(false);
  }, [custom]);

  // No season on offer tonight (the lead's call): the season lookup is not at hand on this shell.
  const shortcuts = presencePeriodShortcuts(null);
  const isDefault = isDefaultChoice(choice, defaultPeriod);

  const applyCustom = () => {
    const period = customPresencePeriod(from, to);
    if (!period) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChoose({ kind: "custom", ...period });
  };

  return (
    <View testID="presences-period" className="gap-2 rounded-xl border border-border bg-card px-3 py-3">
      <View className="flex-row items-center gap-2">
        <Ionicons name="calendar-outline" size={16} color={lightTheme.primary} />
        <Text className="text-xs text-muted-foreground">{t("presences.period.label")}</Text>
        {label === null ? (
          <Skeleton className="h-4 w-36" />
        ) : (
          // The echoed bounds, in the a11y value too, so a screen reader and Maestro read the
          // same days the coach does.
          <Text
            testID="presences-period-label"
            accessibilityValue={{ text: label }}
            className="text-sm font-sans-bold"
          >
            {label}
          </Text>
        )}
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        {shortcuts.map((shortcut) => {
          const active = choice.kind === "shortcut" && choice.shortcut === shortcut;
          return (
            <Button
              key={shortcut}
              size="sm"
              variant={active ? "default" : "outline"}
              accessibilityState={{ selected: active }}
              testID={`presences-period-${shortcut}`}
              onPress={() => {
                setExpanded(false);
                setInvalid(false);
                onChoose(shortcutChoice(shortcut));
              }}
              className="min-w-12"
            >
              <Text>{t(`presences.period.${shortcut}`)}</Text>
              {shortcut === defaultPeriod ? (
                <Ionicons
                  name="star"
                  size={12}
                  color={active ? lightTheme.primaryForeground : lightTheme.primary}
                  accessibilityLabel={t("presences.period.isDefault")}
                />
              ) : null}
            </Button>
          );
        })}
        <Button
          size="sm"
          variant={custom ? "default" : "outline"}
          accessibilityState={{ selected: custom !== null, expanded }}
          accessibilityLabel={t("presences.period.customAria")}
          testID="presences-period-custom"
          onPress={() => setExpanded((open) => !open)}
          className="min-w-12"
        >
          <Text>{t("presences.period.custom")}</Text>
        </Button>
      </View>

      {expanded ? (
        <View testID="presences-period-fields" className="gap-3 rounded-md border border-border bg-muted p-3">
          <DatePickerInput
            testID="presences-period-from"
            label={t("presences.period.from")}
            value={from}
            onChange={setFrom}
          />
          <DatePickerInput
            testID="presences-period-to"
            label={t("presences.period.to")}
            value={to}
            onChange={setTo}
          />
          <Button size="sm" testID="presences-period-apply" onPress={applyCustom}>
            <Text>{t("presences.period.apply")}</Text>
          </Button>
          {invalid ? (
            <Text testID="presences-period-invalid" role="alert" className="text-xs text-destructive">
              {t("presences.period.invalid")}
            </Text>
          ) : null}
        </View>
      ) : null}

      {choice.kind === "shortcut" ? (
        isDefault ? (
          <Text testID="presences-period-default-note" className="text-[11px] text-muted-foreground">
            {t("presences.period.isDefaultNote")}
          </Text>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            testID="presences-period-make-default"
            disabled={savingDefault}
            onPress={() => onMakeDefault(choice.shortcut)}
            className={cn("self-start", savingDefault && "opacity-50")}
          >
            <Ionicons name="star-outline" size={14} color={lightTheme.primary} />
            <Text className="text-xs">{t("presences.period.makeDefault")}</Text>
          </Button>
        )
      ) : null}
    </View>
  );
}
