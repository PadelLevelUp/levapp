import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { lightTheme } from "@levelup/config";
import { Text } from "@/components/ui/text";

/**
 * A player's email and phone on the player screen's info card (PAD-731). Same shape as the web
 * card (apps/web/.../PlayerInfoCard.tsx): an icon, then the value or players.noEmail /
 * players.noPhone. It used to print hard-coded "Email:" / "Phone:" with a "—" fallback, which
 * read as English on a Portuguese screen.
 */
export function PlayerContactRows({ email, phone }: { email?: string | null; phone?: string | null }) {
  const { t } = useTranslation();
  const rows = [
    { id: "email", icon: "mail-outline" as const, value: email, empty: t("players.noEmail") },
    { id: "phone", icon: "call-outline" as const, value: phone, empty: t("players.noPhone") },
  ];
  return (
    <View className="gap-1">
      {rows.map((row) => (
        <View key={row.id} className="flex-row items-center gap-2">
          <Ionicons name={row.icon} size={16} color={lightTheme.mutedForeground} />
          <Text className="text-sm text-muted-foreground" testID={`player-info-${row.id}`}>
            {row.value || row.empty}
          </Text>
        </View>
      ))}
    </View>
  );
}
