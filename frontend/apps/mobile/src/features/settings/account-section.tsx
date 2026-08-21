import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, View } from "react-native";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { DeleteAccountSection } from "@/features/settings/delete-account-section";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/lib/config";

function LegalLinkRow({
  label,
  url,
  testID,
}: {
  label: string;
  url: string;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => void Linking.openURL(url)}
      className="flex-row items-center justify-between rounded-lg border border-border p-3 active:bg-accent"
    >
      <Text className="flex-1 text-base">{label}</Text>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={lightTheme.mutedForeground}
      />
    </Pressable>
  );
}

/**
 * Account pane: the hosted legal pages plus in-app account deletion.
 *
 * Both are App Store 5.1.1 requirements and both were previously loose cards
 * on the flat settings screen. Web keeps legal links inside the Account tab
 * too, so they live here — in ONE place, not duplicated on the section list,
 * and their original testIDs (settings-legal / settings-privacy-policy /
 * settings-terms / settings-account) are preserved on the same elements.
 */
export function AccountSection() {
  const { t } = useTranslation();

  return (
    <View className="gap-4">
      <Card testID="settings-legal">
        <CardHeader>
          <CardTitle>{t("settings.legal.title")}</CardTitle>
        </CardHeader>
        <CardContent className="gap-2">
          <LegalLinkRow
            testID="settings-privacy-policy"
            label={t("settings.legal.privacyPolicy")}
            url={PRIVACY_POLICY_URL}
          />
          <LegalLinkRow
            testID="settings-terms"
            label={t("settings.legal.termsOfService")}
            url={TERMS_URL}
          />
        </CardContent>
      </Card>

      <DeleteAccountSection />
    </View>
  );
}
