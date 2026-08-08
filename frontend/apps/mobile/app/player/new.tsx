import * as React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { useCoachLevels } from "@levelup/hooks";
import { useRouter } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAddPlayer } from "@/features/players/hooks";
import { PlayerForm, type PlayerFormValues } from "@/features/players/PlayerForm";

export default function NewPlayerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { data: levels } = useCoachLevels();
  const addPlayer = useAddPlayer();
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (values: PlayerFormValues) => {
    setError(null);
    try {
      // Payload mirrors the web AddPlayerSheet: coach_id + isActive required.
      await addPlayer.mutateAsync({
        coachId: user?.coachId,
        name: values.name,
        isActive: true,
        email: values.email || undefined,
        phone: values.phone || undefined,
        levelId: values.levelId,
        side: values.side,
        notes: values.notes || undefined,
      });
      router.back();
    } catch {
      setError(t("players.createFailed"));
    }
  };

  return (
    <Screen edges={["top"]} testID="screen-player-new">
      <View className="flex-row items-center gap-1 border-b border-border px-2 py-2">
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel={t("common.goBack")}
          onPress={() => router.back()}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={lightTheme.foreground}
          />
        </Button>
        <Text role="heading" aria-level={1} className="text-xl font-bold">
          {t("players.newPlayer")}
        </Text>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        <PlayerForm
          levels={levels ?? []}
          coachId={user?.coachId}
          submitLabel={t("players.createPlayer")}
          saving={addPlayer.isPending}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
        />
        {error ? (
          <Text className="mt-3 text-sm text-destructive">{error}</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
