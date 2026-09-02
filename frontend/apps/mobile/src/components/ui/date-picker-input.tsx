import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { format, parseISO } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: string): Date {
  return DATE_RE.test(value) ? parseISO(value) : new Date();
}

export interface DatePickerInputProps {
  /** ISO date (YYYY-MM-DD) or "" when unset — same contract as the free-text Input it replaces. */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  testID: string;
}

/**
 * Pressable field styled like `Input` that opens the native date picker.
 * Android shows the platform dialog imperatively (DateTimePickerAndroid);
 * iOS opens a spinner inside a Dialog with Cancel/Done, since iOS has no
 * built-in confirm step.
 *
 * Displays the raw ISO value for now — locale-pretty formatting can come
 * with i18n later.
 */
export function DatePickerInput({
  value,
  onChange,
  label,
  placeholder,
  error,
  disabled,
  testID,
}: DatePickerInputProps) {
  const { t } = useTranslation();
  // Resolved in the body, not the parameter list, so it follows the active
  // language; callers that pass a placeholder still win.
  const resolvedPlaceholder =
    placeholder ?? t("ui.datePicker.placeholder");
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Date>(() => toDate(value));

  const openPicker = () => {
    if (disabled) return;
    const initial = toDate(value);

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initial,
        mode: "date",
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type === "set" && selected) {
            onChange(format(selected, "yyyy-MM-dd"));
          }
        },
      });
      return;
    }

    setDraft(initial);
    setOpen(true);
  };

  const confirm = () => {
    onChange(format(draft, "yyyy-MM-dd"));
    setOpen(false);
  };

  return (
    <View className="gap-2">
      {label ? <Label>{label}</Label> : null}
      <Pressable
        testID={testID}
        accessibilityLabel={label ?? t("ui.datePicker.fieldLabel")}
        accessibilityValue={{ text: value || resolvedPlaceholder }}
        role="button"
        disabled={disabled}
        onPress={openPicker}
        className={cn(
          "h-12 flex-row items-center gap-2 rounded-md border border-input bg-background px-3",
          disabled && "opacity-50"
        )}
      >
        <Ionicons
          name="calendar-outline"
          size={18}
          color={lightTheme.mutedForeground}
        />
        <Text
          className={cn(
            "text-base",
            value ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {value || resolvedPlaceholder}
        </Text>
      </Pressable>
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}

      {/* Android renders via the imperative dialog above; no modal needed here. */}
      {Platform.OS === "ios" ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent testID={`${testID}-dialog`}>
            <DialogHeader>
              <DialogTitle>{label ?? t("ui.datePicker.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <DateTimePicker
              value={draft}
              mode="date"
              display="spinner"
              onChange={(_event, selected) => {
                if (selected) setDraft(selected);
              }}
            />
            <DialogFooter>
              <Button
                testID={`${testID}-cancel`}
                variant="outline"
                onPress={() => setOpen(false)}
              >
                <Text>{t("common.cancel")}</Text>
              </Button>
              <Button testID={`${testID}-confirm`} onPress={confirm}>
                <Text>{t("common.done")}</Text>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </View>
  );
}
