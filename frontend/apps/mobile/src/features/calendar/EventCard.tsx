import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import * as React from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type EventCardProps = {
  event: CalendarEvent;
  onPress?: (event: CalendarEvent) => void;
};

/** Single event row in the day list. Classes are tappable; calendar blocks
 * (breaks, holidays, …) render as muted, non-interactive rows. */
export function EventCard({ event, onPress }: EventCardProps) {
  const isClass = event.type === "class";
  const isCanceled = event.status === "canceled";

  return (
    <Pressable
      testID={`calendar-event-${event.id}`}
      accessibilityLabel={event.title || "Class"}
      role="button"
      disabled={!isClass || !onPress}
      onPress={() => onPress?.(event)}
      className={cn(
        "flex-row items-center gap-3 rounded-lg border border-border bg-card p-3",
        isClass && onPress && "active:bg-accent",
        !isClass && "opacity-70",
        isCanceled && "opacity-50"
      )}
    >
      <View
        className="h-10 w-1 rounded-full"
        style={{ backgroundColor: event.color ?? lightTheme.primary }}
      />
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text className="flex-shrink font-medium" numberOfLines={1}>
            {event.title || (isClass ? "Class" : "Event")}
          </Text>
          {event.isRecurring ? (
            <Ionicons
              name="repeat-outline"
              size={14}
              color={lightTheme.mutedForeground}
            />
          ) : null}
          {isCanceled ? (
            <Text className="text-xs text-destructive">Canceled</Text>
          ) : null}
        </View>
        <Text className="text-sm text-muted-foreground">
          {event.startTime} – {event.endTime}
        </Text>
      </View>
      {isClass && event.maxPlayers != null ? (
        <Text className="text-sm text-muted-foreground">
          {event.participantCount ?? 0}/{event.maxPlayers}
        </Text>
      ) : null}
      {isClass ? (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={lightTheme.mutedForeground}
        />
      ) : null}
    </Pressable>
  );
}
