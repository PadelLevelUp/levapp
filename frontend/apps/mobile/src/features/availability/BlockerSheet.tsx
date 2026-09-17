import * as React from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { PortalHost } from "@rn-primitives/portal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  blockerDraftError,
  blockerDraftToInput,
  blockerToDraft,
  emptyBlockerDraft,
  type BlockerDraft,
  type BlockerDraftInput,
  type BlockerMode,
  lightTheme,
} from "@levelup/config";
import type { AvailabilityBlocker } from "@levelup/api/src/resources/availability";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { TimePickerInput } from "@/components/ui/time-picker-input";
import { keyboardAvoidingBehavior } from "@/lib/keyboard-avoiding";

// Monday-first order; labels come from availability.dayInitials.<n> and
// availability.days.<n>, both keyed by JS getDay().
const DAYS_OF_WEEK = [1, 2, 3, 4, 5, 6, 0];

/** The iOS picker dialogs render here, inside the sheet's Modal, not behind it. */
const SHEET_PORTAL_HOST = "blocker-sheet";

interface BlockerSheetProps {
  open: boolean;
  /** When set, the sheet edits this blocker; otherwise it creates a new one. */
  initial?: AvailabilityBlocker | null;
  saving?: boolean;
  /** A save error from the request, shown above the buttons. */
  error?: string | null;
  onSubmit: (payload: BlockerDraftInput) => void;
  onClose: () => void;
}

/**
 * The student's Criar bloqueio sheet (calendar.student-blockers rules 15–16,
 * PAD-356). Mirrors web's sheet: single or recurring, an optional reason (the
 * blocker's `title`), and the validation and payload from `@levelup/config`'s
 * blocker draft, so the two shells cannot accept different blocks.
 *
 * A native `Modal` (a page sheet on iOS, a full-screen slide on Android, where
 * back closes it through `onRequestClose`) rather than a portal dialog: the
 * sheet is a form with its own pickers, and those pickers' iOS dialogs need a
 * PortalHost inside the modal to draw on top of it.
 */
export function BlockerSheet({ open, initial, saving = false, error, onSubmit, onClose }: BlockerSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = React.useState<BlockerDraft>(() =>
    initial ? blockerToDraft(initial) : emptyBlockerDraft()
  );
  const [draftError, setDraftError] = React.useState<ReturnType<typeof blockerDraftError>>(null);

  // Each opening starts from the blocker being edited, or a blank draft.
  React.useEffect(() => {
    if (!open) return;
    setDraft(initial ? blockerToDraft(initial) : emptyBlockerDraft());
    setDraftError(null);
  }, [open, initial]);

  const set = <K extends keyof BlockerDraft>(key: K, value: BlockerDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDraftError(null);
  };

  const toggleDay = (day: number) =>
    set(
      "daysOfWeek",
      draft.daysOfWeek.includes(day) ? draft.daysOfWeek.filter((d) => d !== day) : [...draft.daysOfWeek, day]
    );

  const handleSave = () => {
    const problem = blockerDraftError(draft);
    if (problem) {
      setDraftError(problem);
      return;
    }
    onSubmit(blockerDraftToInput(draft));
  };

  const recurring = draft.mode === "recurring";

  const modeButton = (mode: BlockerMode) => {
    const selected = draft.mode === mode;
    return (
      <Pressable
        key={mode}
        testID={`blocker-mode-${mode}`}
        role="button"
        accessibilityLabel={t(`availability.mode.${mode}`)}
        accessibilityState={{ selected }}
        onPress={() => set("mode", mode)}
        // Selection is a style, not a className swap. The first simulator run
        // crashed the sheet with "Couldn't find a navigation context" when these
        // buttons swapped `bg-background shadow-sm` for `active:opacity-70`;
        // with styles the flow passes. The mechanism is UNIDENTIFIED: a plain
        // class swap is not enough, since Save's `opacity-50` (disabled while
        // saving) changes inside the same Modal without crashing. What differed
        // here was an interaction variant (`active:`) and a shadow coming and
        // going — a candidate, not a finding (Session A's #340 review).
        className="flex-1 items-center justify-center rounded-md py-2"
        style={{ backgroundColor: selected ? lightTheme.card : "transparent" }}
      >
        <Text
          className="text-sm font-medium"
          style={{ color: selected ? lightTheme.foreground : lightTheme.mutedForeground }}
        >
          {t(`availability.mode.${mode}`)}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : undefined}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView className="flex-1 bg-background" behavior={keyboardAvoidingBehavior()}>
        <ScrollView
          testID="blocker-sheet"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            padding: 16,
            paddingTop: Platform.OS === "ios" ? 20 : insets.top + 16,
            paddingBottom: insets.bottom + 32,
            gap: 20,
          }}
        >
          <Text className="text-lg font-semibold">
            {initial ? t("availability.sheet.editTitle") : t("availability.sheet.newTitle")}
          </Text>
          <Text className="-mt-3 text-sm text-muted-foreground">{t("availability.formDescription")}</Text>

          <View className="flex-row gap-1 rounded-lg bg-muted p-1">
            {modeButton("single")}
            {modeButton("recurring")}
          </View>

          {recurring ? (
            <View className="gap-2">
              <Label>{t("availability.daysOfWeek")}</Label>
              <View className="flex-row gap-1.5">
                {DAYS_OF_WEEK.map((value) => {
                  const selected = draft.daysOfWeek.includes(value);
                  return (
                    <Pressable
                      key={value}
                      testID={`blocker-day-${value}`}
                      role="button"
                      accessibilityLabel={t("availability.toggleDayAria", { day: t(`availability.days.${value}`) })}
                      accessibilityState={{ selected }}
                      onPress={() => toggleDay(value)}
                      className="h-9 w-9 items-center justify-center rounded-full"
                      style={{ backgroundColor: selected ? lightTheme.primary : lightTheme.muted }}
                    >
                      <Text
                        className="text-sm font-medium"
                        style={{ color: selected ? lightTheme.primaryForeground : lightTheme.foreground }}
                      >
                        {t(`availability.dayInitials.${value}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <DatePickerInput
            testID="blocker-date"
            label={recurring ? t("availability.startDate") : t("availability.date")}
            value={draft.date}
            onChange={(v) => set("date", v)}
            portalHost={SHEET_PORTAL_HOST}
          />

          {recurring ? (
            <DatePickerInput
              testID="blocker-end-date"
              label={t("availability.endDate")}
              value={draft.endDate}
              onChange={(v) => set("endDate", v)}
              portalHost={SHEET_PORTAL_HOST}
            />
          ) : null}

          <View className="flex-row gap-3">
            <View className="flex-1">
              <TimePickerInput
                testID="blocker-start-time"
                label={t("availability.startTime")}
                value={draft.startTime}
                onChange={(v) => set("startTime", v)}
                portalHost={SHEET_PORTAL_HOST}
              />
            </View>
            <View className="flex-1">
              <TimePickerInput
                testID="blocker-end-time"
                label={t("availability.endTime")}
                value={draft.endTime}
                onChange={(v) => set("endTime", v)}
                portalHost={SHEET_PORTAL_HOST}
              />
            </View>
          </View>

          <View className="gap-2">
            <Label>{t("availability.reasonLabel")}</Label>
            <Input
              testID="blocker-reason"
              accessibilityLabel={t("availability.reasonLabel")}
              placeholder={t("availability.reasonPlaceholder")}
              value={draft.title}
              onChangeText={(v) => set("title", v)}
            />
          </View>

          {draftError ? (
            <Text
              testID={`blocker-error-${draftError}`}
              className="text-sm text-destructive"
              accessibilityLiveRegion="polite"
            >
              {t(`availability.validation.${draftError}`)}
            </Text>
          ) : null}
          {error ? <Text className="text-sm text-destructive">{error}</Text> : null}

          <View className="gap-2">
            <Button
              testID="blocker-save"
              accessibilityLabel={t("availability.saveBlockerAria")}
              disabled={saving}
              onPress={handleSave}
            >
              {saving ? <Spinner size="small" color="white" /> : null}
              <Text>{saving ? t("availability.saving") : t("common.save")}</Text>
            </Button>
            <Button
              testID="blocker-cancel"
              variant="outline"
              accessibilityLabel={t("availability.cancelFormAria")}
              disabled={saving}
              onPress={onClose}
            >
              <Text>{t("common.cancel")}</Text>
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <PortalHost name={SHEET_PORTAL_HOST} />
    </Modal>
  );
}
