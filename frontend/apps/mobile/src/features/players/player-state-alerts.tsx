/**
 * players.profile rules 9 and 11 (PAD-834): the two alerts above the player screen's blocks — the
 * web twin is `PlayerStateAlerts.tsx`, with the same ids and i18n keys. Pending registration comes
 * first; needs-configuring holds no selects, only the way into Block 1.
 */
import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { lightTheme, missingSetup, missingSetupKey, pendingAgeDays } from "@levelup/config";
import type { CoachPlayer } from "@levelup/types";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { PENDING_TONE } from "./players-list-alerts";

/**
 * expo-clipboard is a native module; load it lazily so a binary built before it was linked fails at
 * the tap with a toast, not at route load (the verify-email and conversation screens do the same).
 */
async function copyToClipboard(text: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const clipboard: typeof import("expo-clipboard") = require("expo-clipboard");
  await clipboard.setStringAsync(text);
}

export function PlayerStateAlerts({
  player,
  inviteLink,
  onComplete,
  completeDisabled = false,
  claimAction,
  copyText = copyToClipboard,
  now,
}: {
  player: CoachPlayer;
  /** The activation link (`/register/<userId>?t=<token>`, assumption Q6). */
  inviteLink: string;
  /** Opens Block 1 in the "Completar informação" session. */
  onComplete: () => void;
  /** True while the header form or Block 1 is in edit mode (rule 8). */
  completeDisabled?: boolean;
  /** players.claim rule 4: linking records, rendered inside the pending alert. */
  claimAction?: React.ReactNode;
  copyText?: (text: string) => Promise<void>;
  now?: Date;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = React.useState(false);
  const pending = player.pendingRegistration === true;
  const missing = missingSetup(player);
  const missingKey = missingSetupKey(missing);
  const age = pending ? pendingAgeDays(player.addedAt, now) : null;

  const handleCopy = async () => {
    try {
      await copyText(inviteLink);
      setCopied(true);
      toast.success(t("players.card.linkCopied"));
    } catch {
      toast.error(t("players.linkCopyFailed"));
    }
  };

  if (!pending && !missingKey) return null;

  return (
    <View className="gap-3">
      {pending ? (
        <View
          className="gap-3 rounded-lg border border-violet-300 bg-violet-50 p-3"
          testID="player-pending-alert"
        >
          <View className="flex-row gap-2">
            <Ionicons name="person-add-outline" size={16} color={PENDING_TONE} />
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-sm font-semibold">{t("players.card.pendingTitle")}</Text>
              {age !== null ? (
                <Text className="text-sm text-muted-foreground" testID="player-pending-age">
                  {age === 0 ? t("players.card.addedToday") : t("players.card.addedAgo", { count: age })}
                </Text>
              ) : null}
              <Text className="text-sm text-muted-foreground">{t("players.card.pendingBody")}</Text>
            </View>
          </View>
          <Button
            variant="outline"
            size="sm"
            testID="player-copy-invite-link"
            accessibilityLabel={t("players.card.copyInviteLink")}
            onPress={() => void handleCopy()}
          >
            <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color={lightTheme.foreground} />
            <Text>{copied ? t("players.card.linkCopied") : t("players.card.copyInviteLink")}</Text>
          </Button>
          {claimAction}
        </View>
      ) : null}

      {missingKey ? (
        <View
          className="gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3"
          testID="player-needs-config-alert"
          accessibilityHint={missing.join(",")}
        >
          <View className="flex-row gap-2">
            <Ionicons name="warning-outline" size={16} color={lightTheme.warning} />
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-semibold">{t("players.card.needsConfigTitle")}</Text>
              <Text className="text-sm text-warning-strong" testID="player-needs-config-missing">
                {t(missingKey)}
              </Text>
            </View>
          </View>
          <Button
            size="sm"
            testID="player-needs-config-complete"
            accessibilityLabel={t("players.card.completeInfo")}
            disabled={completeDisabled}
            onPress={onComplete}
          >
            <Text>{t("players.card.completeInfo")}</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
