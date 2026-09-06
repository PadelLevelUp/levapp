import { useTranslation } from "react-i18next";
import { Linking, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/lib/config";

/**
 * Privacy Policy · Terms of Service, for the pre-auth screens (PAD-164).
 *
 * Web shows this pair under the sign-in card (`AuthPage`) and under the
 * activation form (`RegisterPage`). Mobile only had them inside Settings —
 * behind a sign-in, which is precisely where someone who has not got an account
 * yet cannot reach them. That is both a parity gap and an App Store 5.1.1
 * awkwardness: the reviewer meets the login screen first.
 *
 * `Linking.openURL` (react-native), not `expo-web-browser`: the in-app browser
 * module is not a dependency of `apps/mobile`, and adding a native module — and
 * with it a prebuild — for two links is not worth it. Settings already opens
 * the same two URLs exactly this way, so the behaviour is consistent across the
 * app: the system browser, with the app left running behind it.
 */
export function LegalLinks({ testID = "legal-links" }: { testID?: string }) {
  const { t } = useTranslation();

  const privacy = t("auth.legal.privacyPolicy");
  const terms = t("auth.legal.terms");

  return (
    <View
      testID={testID}
      className="mt-6 flex-row items-center justify-center gap-2"
    >
      <Pressable
        testID={`${testID}-privacy`}
        accessibilityRole="link"
        accessibilityLabel={privacy}
        onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        hitSlop={8}
      >
        <Text className="text-xs text-sidebar-foreground underline opacity-70">
          {privacy}
        </Text>
      </Pressable>

      <Text className="text-xs text-sidebar-foreground opacity-70">
        {t("auth.legal.separator")}
      </Text>

      <Pressable
        testID={`${testID}-terms`}
        accessibilityRole="link"
        accessibilityLabel={terms}
        onPress={() => void Linking.openURL(TERMS_URL)}
        hitSlop={8}
      >
        <Text className="text-xs text-sidebar-foreground underline opacity-70">
          {terms}
        </Text>
      </Pressable>
    </View>
  );
}
