import { View } from "react-native";
import { Text } from "@/components/ui/text";

export default function CalendarScreen() {
  return (
    <View
      className="flex-1 items-center justify-center bg-background p-4"
      testID="screen-calendar"
    >
      <Text className="text-2xl font-bold">Calendar</Text>
      <Text className="mt-2 text-muted-foreground">Coming soon</Text>
    </View>
  );
}
