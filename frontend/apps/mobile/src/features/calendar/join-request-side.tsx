import { requestedSideChipKey, sideWordKey, suggestedProfileSideOf } from "@levelup/config";
import { setPlayerProfileSide } from "@levelup/api/src/resources/players";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";

/**
 * PAD-672 slice 1 (`classes.join-requests` rule 20, Q6), the phone's half of web's JoinRequestSide:
 * on a coach's join-request row, the side the student asked for as a small chip and — when the
 * student has no profile side and asked for left/right — "Usar <lado> no perfil", which saves it
 * through the existing `edit_player` call.
 */
interface Props {
  request: {
    coachId: string | number;
    playerId: string | number;
    side?: string | null;
    suggestedProfileSide?: string | null;
  };
}

export function JoinRequestSide({ request }: Props) {
  const { t } = useTranslation();
  const [saved, setSaved] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const chipKey = requestedSideChipKey(request.side);
  const suggested = saved ? null : suggestedProfileSideOf(request.suggestedProfileSide);
  if (!chipKey) return null;

  const useInProfile = async () => {
    if (!suggested) return;
    setBusy(true);
    try {
      await setPlayerProfileSide(request.coachId, request.playerId, suggested);
      setSaved(true);
      toast.success(t("calendar.sidePick.coach.profileSaved"));
    } catch {
      toast.error(t("calendar.sidePick.coach.profileFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-row flex-wrap items-center gap-2" testID="class-join-request-side">
      <Badge variant="secondary" testID="class-join-request-side-chip">
        <Text>{t(chipKey)}</Text>
      </Badge>
      {suggested ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void useInProfile()}
          testID="class-join-request-use-side"
        >
          <Text className="text-xs text-primary underline">
            {t("calendar.sidePick.coach.useInProfile", { side: t(sideWordKey(suggested)) })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
