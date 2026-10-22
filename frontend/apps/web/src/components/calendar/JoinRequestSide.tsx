/**
 * PAD-672 slice 1 (classes.join-requests rule 20, Q6): on a coach's join-request row, the side the
 * student asked for as a small chip and — when the student has no profile side and asked for
 * left/right — "Usar <lado> no perfil", which saves it through the existing `edit_player` call.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { requestedSideChipKey, sideWordKey, suggestedProfileSideOf } from "@levelup/config";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { setPlayerProfileSide } from "@/api/players";

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
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const chipKey = requestedSideChipKey(request.side);
  const suggested = saved ? null : suggestedProfileSideOf(request.suggestedProfileSide);
  if (!chipKey) return null;

  const useInProfile = async () => {
    if (!suggested) return;
    setBusy(true);
    try {
      await setPlayerProfileSide(request.coachId, request.playerId, suggested);
      setSaved(true);
      toast({ title: t("calendar.sidePick.coach.profileSaved") });
    } catch {
      toast({ title: t("calendar.sidePick.coach.profileFailed"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="class-join-request-side">
      <Badge variant="secondary" data-testid="class-join-request-side-chip" data-side={request.side}>
        {t(chipKey)}
      </Badge>
      {suggested && (
        <button
          type="button"
          className="text-xs text-primary underline underline-offset-2 disabled:opacity-50"
          disabled={busy}
          onClick={() => void useInProfile()}
          data-testid="class-join-request-use-side"
        >
          {t("calendar.sidePick.coach.useInProfile", { side: t(sideWordKey(suggested)) })}
        </button>
      )}
    </div>
  );
}
