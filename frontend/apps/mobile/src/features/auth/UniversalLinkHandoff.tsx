import * as Linking from "expo-linking";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { WEB_APP_URL } from "@/lib/config";
import {
  webUrlForUniversalLink,
  type UniversalLinkTarget,
} from "@/lib/universalLinks";

type Props = {
  /** Parsed target, or null when the incoming path did not parse (bad token). */
  target: UniversalLinkTarget | null;
};

/**
 * Placeholder landing for the three universal-link routes (PAD-184).
 *
 * The native register / coach-invite / player-invite screens are PAD-164's job.
 * Until they exist, the link's whole value is that it *lands in the right
 * place*: this screen takes the token it was handed, rebuilds the equivalent web
 * URL and opens it, so the flow completes on the web app instead of dead-ending.
 *
 * `expo-web-browser` is not a dependency of apps/mobile, and adding a native
 * module for a placeholder that PAD-164 deletes is not worth a prebuild, so this
 * uses `Linking.openURL` (Safari) rather than an in-app browser sheet. When
 * PAD-164 lands, this component and the three route bodies get replaced by the
 * real screens; the parser and the entitlement stay.
 *
 * The hand-off is attempted once on mount. The button below is not decoration:
 * `openURL` can reject (no handler, user-cancelled), and a link that opened the
 * app must never leave the user staring at a blank screen.
 */
export function UniversalLinkHandoff({ target }: Props) {
  const { t } = useTranslation();
  const [failed, setFailed] = React.useState(false);
  const attempted = React.useRef(false);

  const webUrl = target ? webUrlForUniversalLink(target, WEB_APP_URL) : null;

  const openWeb = React.useCallback(() => {
    if (!webUrl) return;
    setFailed(false);
    Linking.openURL(webUrl).catch((error: unknown) => {
      console.warn("[universal-link] openURL failed", error);
      setFailed(true);
    });
  }, [webUrl]);

  React.useEffect(() => {
    if (!webUrl || attempted.current) return;
    attempted.current = true;
    openWeb();
  }, [openWeb, webUrl]);

  const goHome = React.useCallback(() => {
    router.replace("/");
  }, []);

  if (!target) {
    return (
      <Screen edges={["top", "bottom"]} testID="universal-link-invalid">
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text className="text-center text-xl font-bold text-foreground">
            {t("auth.universalLink.invalidTitle")}
          </Text>
          <Text className="text-center text-base text-muted-foreground">
            {t("auth.universalLink.invalidDescription")}
          </Text>
          <Button className="mt-4 w-full" onPress={goHome}>
            <Text>{t("auth.universalLink.continueInApp")}</Text>
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]} testID="universal-link-handoff">
      <View className="flex-1 items-center justify-center gap-3 px-8">
        {failed ? null : <Spinner />}
        <Text className="text-center text-xl font-bold text-foreground">
          {t("auth.universalLink.title")}
        </Text>
        <Text className="text-center text-base text-muted-foreground">
          {failed
            ? t("auth.universalLink.failedDescription")
            : t("auth.universalLink.description")}
        </Text>
        <Button
          className="mt-4 w-full"
          onPress={openWeb}
          testID="universal-link-open-web"
        >
          <Text>{t("auth.universalLink.openInBrowser")}</Text>
        </Button>
        <Button variant="ghost" className="w-full" onPress={goHome}>
          <Text>{t("auth.universalLink.continueInApp")}</Text>
        </Button>
      </View>
    </Screen>
  );
}
