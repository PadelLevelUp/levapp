import { Ionicons } from "@expo/vector-icons";
import { asksForEmail, emailPromptSession, lightTheme, type EmailPromptUser } from "@levelup/config";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/**
 * PAD-482 (auth.email-verification rule 14) — the iOS twin of web's `EmailPromptBanner`, same test ids:
 * a coach with no email is asked for one on the coach home. Never a hold: "Agora não" hides it for this
 * session only (nothing is stored), "Adicionar email" opens Settings → Perfil on the email field.
 */
export function EmailPromptBanner({ user }: { user: EmailPromptUser | null | undefined }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = React.useState(() => (user ? emailPromptSession.isDismissed(user.id) : false));

  if (!user || !asksForEmail(user) || dismissed) return null;
  return (
    <View testID="email-prompt" role="status" className="gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
      <View className="flex-row items-start gap-3">
        <Ionicons name="mail-unread-outline" size={20} color={lightTheme.foreground} />
        <Text className="flex-1 text-sm">{t("dashboard.emailPrompt.text")}</Text>
      </View>
      <View className="flex-row gap-2">
        <Button
          size="sm"
          testID="email-prompt-add"
          onPress={() => router.push({ pathname: "/settings", params: { section: "profile", focus: "email" } } as never)}
        >
          <Text>{t("dashboard.emailPrompt.add")}</Text>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          testID="email-prompt-dismiss"
          onPress={() => { emailPromptSession.dismiss(user.id); setDismissed(true); }}
        >
          <Text>{t("dashboard.emailPrompt.dismiss")}</Text>
        </Button>
      </View>
    </View>
  );
}
