import { useTranslation } from "react-i18next";
import { Linking, Pressable, View } from "react-native";
import { Checkbox } from "@/components/ui/checkbox";
import { Text } from "@/components/ui/text";
import { PRIVACY_POLICY_URL, TERMS_URL, legalUrl } from "@/lib/config";

/**
 * auth.register rules 19 and 19b (PAD-485, PAD-637): "I have read and accept the Privacy Policy and the
 * Terms of Service", each document a tap away. Sign-up, the two invite screens, activation and the
 * next-login catch-up use this one field. Mirrors web's `TermsAcceptField`.
 *
 * Test ids: `testID` on the box, `${testID}-privacy` / `${testID}-terms` on the links, and the error line
 * at `errorTestID` (default `${testID}-error`).
 */
export function TermsAcceptField({
  testID,
  checked,
  onToggle,
  error,
  errorTestID,
  disabled,
  onLayout,
}: {
  testID: string;
  checked: boolean;
  onToggle: () => void;
  error?: string;
  errorTestID?: string;
  disabled?: boolean;
  onLayout?: React.ComponentProps<typeof View>["onLayout"];
}) {
  const { t, i18n } = useTranslation();
  return (
    <View className="gap-1" onLayout={onLayout}>
      <View className="flex-row items-start gap-2">
        <Pressable
          testID={testID}
          role="checkbox"
          accessibilityState={{ checked, disabled }}
          accessibilityLabel={`${t("auth.signup.termsAcceptPrefix")} ${t("auth.legal.privacyPolicy")} ${t("auth.signup.termsAcceptJoin")} ${t("auth.legal.terms")}`}
          disabled={disabled}
          hitSlop={8}
          onPress={onToggle}
        >
          {/* One owner of the toggle (#517 review): the box only shows the state; the Pressable
              around it takes the tap, so a tap can never toggle twice and cancel itself. */}
          <View pointerEvents="none">
            <Checkbox
              checked={checked}
              onCheckedChange={() => undefined}
              disabled={disabled}
              className={error ? "border-destructive" : undefined}
            />
          </View>
        </Pressable>
        <View className="flex-1 flex-row flex-wrap items-center gap-x-1">
          <Text className="text-sm">{t("auth.signup.termsAcceptPrefix")}</Text>
          <Pressable accessibilityRole="link" testID={`${testID}-privacy`} onPress={() => void Linking.openURL(legalUrl(PRIVACY_POLICY_URL, i18n.language))}>
            <Text className="text-sm text-primary underline">{t("auth.legal.privacyPolicy")}</Text>
          </Pressable>
          <Text className="text-sm">{t("auth.signup.termsAcceptJoin")}</Text>
          <Pressable accessibilityRole="link" testID={`${testID}-terms`} onPress={() => void Linking.openURL(legalUrl(TERMS_URL, i18n.language))}>
            <Text className="text-sm text-primary underline">{t("auth.legal.terms")}</Text>
          </Pressable>
        </View>
      </View>
      {error ? (
        <Text className="text-sm text-destructive" testID={errorTestID ?? `${testID}-error`} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
