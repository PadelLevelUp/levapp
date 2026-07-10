import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as React from "react";
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

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toDate(value: string): Date {
  const date = new Date();
  if (TIME_RE.test(value)) {
    const [hours, minutes] = value.split(":").map(Number);
    date.setHours(hours, minutes, 0, 0);
  }
  return date;
}

function toTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

export interface TimePickerInputProps {
  /** "HH:MM" (24h) or "" when unset — same contract as the free-text Input it replaces. */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  testID: string;
}

/**
 * Pressable field styled like `Input` that opens the native time picker.
 * Android shows the platform dialog imperatively (DateTimePickerAndroid);
 * iOS opens a spinner inside a Dialog with Cancel/Done, since iOS has no
 * built-in confirm step.
 *
 * Displays the raw "HH:MM" value for now — locale-pretty (12h/24h) display
 * can come with i18n later.
 */
export function TimePickerInput({
  value,
  onChange,
  label,
  placeholder = "Select a time",
  error,
  disabled,
  testID,
}: TimePickerInputProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Date>(() => toDate(value));

  const openPicker = () => {
    if (disabled) return;
    const initial = toDate(value);

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initial,
        mode: "time",
        is24Hour: true,
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type === "set" && selected) {
            onChange(toTimeString(selected));
          }
        },
      });
      return;
    }

    setDraft(initial);
    setOpen(true);
  };

  const confirm = () => {
    onChange(toTimeString(draft));
    setOpen(false);
  };

  return (
    <View className="gap-2">
      {label ? <Label>{label}</Label> : null}
      <Pressable
        testID={testID}
        accessibilityLabel={label ?? "Time"}
        accessibilityValue={{ text: value || placeholder }}
        role="button"
        disabled={disabled}
        onPress={openPicker}
        className={cn(
          "h-12 flex-row items-center gap-2 rounded-md border border-input bg-background px-3",
          disabled && "opacity-50"
        )}
      >
        <Ionicons
          name="time-outline"
          size={18}
          color={lightTheme.mutedForeground}
        />
        <Text
          className={cn(
            "text-base",
            value ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {value || placeholder}
        </Text>
      </Pressable>
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}

      {/* Android renders via the imperative dialog above; no modal needed here. */}
      {Platform.OS === "ios" ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent testID={`${testID}-dialog`}>
            <DialogHeader>
              <DialogTitle>{label ?? "Select time"}</DialogTitle>
            </DialogHeader>
            <DateTimePicker
              value={draft}
              mode="time"
              is24Hour
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
                <Text>Cancel</Text>
              </Button>
              <Button testID={`${testID}-confirm`} onPress={confirm}>
                <Text>Done</Text>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </View>
  );
}
