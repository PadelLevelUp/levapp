import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { router } from "expo-router";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { Text } from "@/components/ui/text";

type MenuEntry = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  testID: string;
  onPress?: () => void;
  destructive?: boolean;
};

function MenuRow({ entry }: { entry: MenuEntry }) {
  return (
    <Pressable
      className="flex-row items-center gap-3 border-b border-border bg-card px-4 py-4 active:bg-accent"
      testID={entry.testID}
      accessibilityLabel={entry.label}
      role="button"
      onPress={entry.onPress}
    >
      <Ionicons
        name={entry.icon}
        size={22}
        color={entry.destructive ? lightTheme.destructive : lightTheme.primary}
      />
      <Text
        className={
          entry.destructive
            ? "flex-1 text-base text-destructive"
            : "flex-1 text-base text-foreground"
        }
      >
        {entry.label}
      </Text>
      {!entry.destructive ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={lightTheme.mutedForeground}
        />
      ) : null}
    </Pressable>
  );
}

export default function MoreScreen() {
  const { user, logout } = useAuth();
  const isCoach = user?.roles?.includes("coach") ?? false;

  const entries: MenuEntry[] = [
    // Training is coach-only; students get Availability as a bottom tab
    // instead (see app/(tabs)/_layout.tsx), so there's no student entry here.
    ...(isCoach
      ? [
          {
            key: "training",
            label: "Training",
            icon: "barbell-outline",
            testID: "more-training",
            onPress: () => router.push("/training"),
          } satisfies MenuEntry,
        ]
      : []),
    {
      key: "settings",
      label: "Settings",
      icon: "settings-outline",
      testID: "more-settings",
      onPress: () => router.push("/settings"),
    },
  ];

  return (
    <ScrollView className="flex-1 bg-background" testID="screen-more">
      <View className="px-4 py-6">
        <Text className="text-lg font-semibold">{user?.name}</Text>
        <Text className="text-sm text-muted-foreground">@{user?.username}</Text>
      </View>

      <View className="border-t border-border">
        {entries.map((entry) => (
          <MenuRow key={entry.key} entry={entry} />
        ))}
        <MenuRow
          entry={{
            key: "logout",
            label: "Log out",
            icon: "log-out-outline",
            testID: "more-logout",
            destructive: true,
            onPress: () => {
              void logout();
            },
          }}
        />
      </View>
    </ScrollView>
  );
}
