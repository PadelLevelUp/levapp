import { CONTACT_EMAIL } from "@levelup/config";
import { authApi } from "@levelup/api";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  GOOGLE_IOS_REDIRECT_URI,
  googleIosClientId,
  isAppleCancel,
  newAppleNonce,
  socialErrorKey,
  socialProvidersEnabled,
} from "@/lib/social-providers";

// Closes the system browser sheet when Google redirects back to the app.
WebBrowser.maybeCompleteAuthSession();

type Props = {
  /** The server's answer: a login body, or `needsProfile`. The screen routes it. */
  onResult: (result: authApi.SocialSignInResponse) => void | Promise<void>;
};

/**
 * auth.social-sign-in rule 7 (PAD-618): "Continuar com Google" and Sign in with Apple, together or
 * not at all (Guideline 4.8), only where the build carries the Google iOS client id. Renders
 * nothing until the device says Apple is available.
 */
export function SocialSignInButtons({ onResult }: Props) {
  const [enabled, setEnabled] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    void socialProvidersEnabled().then((ok) => {
      if (!cancelled) setEnabled(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const clientId = googleIosClientId();
  if (!enabled || !clientId) return null;
  return <Providers clientId={clientId} onResult={onResult} />;
}

function Providers({ clientId, onResult }: Props & { clientId: string }) {
  const { t } = useTranslation();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const handler = React.useRef(onResult);
  handler.current = onResult;

  const fail = React.useCallback(
    (err: unknown) => {
      const { key, shared } = socialErrorKey(err);
      setError(
        shared
          ? t(`auth.social.${key}`, { email: CONTACT_EMAIL })
          : t(`auth.social.native.${key}`),
      );
    },
    [t],
  );

  const exchange = React.useCallback(
    async (payload: authApi.SocialSignInPayload) => {
      setError(null);
      setBusy(true);
      try {
        const res = await authApi.socialSignIn(payload);
        await handler.current(res);
      } catch (err) {
        fail(err);
      } finally {
        setBusy(false);
      }
    },
    [fail],
  );

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: clientId,
    redirectUri: GOOGLE_IOS_REDIRECT_URI,
  });

  const handled = React.useRef<unknown>(null);
  React.useEffect(() => {
    if (!response || handled.current === response) return;
    handled.current = response;
    if (response.type === "success") {
      const idToken = response.params?.id_token;
      if (idToken) void exchange({ provider: "google", idToken });
      else setError(t("auth.social.native.errorInvalid"));
    } else if (response.type === "error") {
      setError(t("auth.social.native.errorInvalid"));
    }
    // "cancel" / "dismiss": the person closed the sheet; no error.
  }, [response, exchange, t]);

  const signInWithApple = async () => {
    setError(null);
    try {
      const { raw, hashed } = await newAppleNonce();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashed,
      });
      if (!credential.identityToken) {
        setError(t("auth.social.native.errorInvalid"));
        return;
      }
      await exchange({ provider: "apple", idToken: credential.identityToken, nonce: raw });
    } catch (err) {
      if (isAppleCancel(err)) return;
      fail(err);
    }
  };

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3" accessibilityElementsHidden>
        <View className="h-px flex-1 bg-border" />
        <Text className="text-xs uppercase text-muted-foreground">{t("auth.social.divider")}</Text>
        <View className="h-px flex-1 bg-border" />
      </View>
      <Button
        variant="outline"
        testID="social-google"
        accessibilityLabel={t("auth.social.native.continueGoogle")}
        disabled={busy || !request}
        onPress={() => {
          setError(null);
          void promptAsync();
        }}
      >
        <Text>{t("auth.social.native.continueGoogle")}</Text>
      </Button>
      <AppleAuthentication.AppleAuthenticationButton
        testID="social-apple"
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={6}
        style={{ height: 48, width: "100%" }}
        onPress={() => {
          if (!busy) void signInWithApple();
        }}
      />
      {error ? (
        <Text className="text-center text-sm text-destructive" testID="social-error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
