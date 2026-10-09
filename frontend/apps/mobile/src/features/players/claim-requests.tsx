import { playerClaimsApi } from "@levelup/api";
import { describeMergePlan } from "@levelup/config";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { coachPlayersKey } from "@/features/players/hooks";
import { useAuth } from "@/auth/AuthContext";

export const myClaimRequestsKey = ["my-claim-requests"] as const;

/**
 * players.claim rule 4 — the student's pending link requests on iOS, as a
 * dashboard banner or a Settings → Account list. Twin of web's
 * ClaimRequestsList: same data, same two actions.
 */
export function ClaimRequests({ variant }: { variant: "banner" | "list" }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const { data, isPending } = useQuery({
    queryKey: myClaimRequestsKey,
    queryFn: playerClaimsApi.listMyClaimRequests,
  });
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const decide = async (req: playerClaimsApi.PlayerClaimRequest, accept: boolean) => {
    setBusyId(req.id);
    try {
      if (accept) {
        await playerClaimsApi.acceptClaimRequest(req.id);
        // players.join-token rule 8a (PAD-444): the claim linked a coach, so re-read /me.
        void refreshUser().catch(() => null);
        toast.success(t("players.claim.accepted"));
      } else {
        await playerClaimsApi.rejectClaimRequest(req.id);
        toast.success(t("players.claim.rejected"));
      }
      queryClient.setQueryData<playerClaimsApi.PlayerClaimRequest[]>(myClaimRequestsKey, (prev) =>
        (prev ?? []).filter((r) => r.id !== req.id)
      );
      if (accept) {
        // players.claim rule 6: every payload that pointed at the placeholder
        // now points at this account — re-read what is on screen.
        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
        void queryClient.invalidateQueries({ queryKey: coachPlayersKey });
      }
    } catch {
      toast.error(t("players.claim.actionFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const describe = (req: playerClaimsApi.PlayerClaimRequest) =>
    req.clubName
      ? t("players.claim.bannerText", {
          coachName: req.coachName,
          clubName: req.clubName,
          placeholderName: req.placeholderName,
        })
      : t("players.claim.bannerTextNoClub", {
          coachName: req.coachName,
          placeholderName: req.placeholderName,
        });

  const rows = (data ?? []).map((req) => (
    <View
      key={req.id}
      className="gap-2 rounded-lg border border-border bg-background p-3"
      testID={`claim-request-${req.id}`}
    >
      <Text className="text-sm">{describe(req)}</Text>
      <MergePreviewLines requestId={req.id} />
      <View className="flex-row gap-2">
        <Button
          size="sm"
          testID={`claim-accept-${req.id}`}
          disabled={busyId === req.id}
          onPress={() => void decide(req, true)}
        >
          <Text>{busyId === req.id ? t("players.claim.working") : t("players.claim.accept")}</Text>
        </Button>
        <Button
          size="sm"
          variant="outline"
          testID={`claim-reject-${req.id}`}
          disabled={busyId === req.id}
          onPress={() => void decide(req, false)}
        >
          <Text>{t("players.claim.reject")}</Text>
        </Button>
      </View>
    </View>
  ));

  if (variant === "banner") {
    if (!data || data.length === 0) return null;
    return (
      <View className="gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4" testID="claim-request-banner">
        <Text className="text-sm font-semibold">{t("players.claim.bannerTitle")}</Text>
        <Text className="text-xs text-muted-foreground">{t("players.claim.bannerHint")}</Text>
        {rows}
      </View>
    );
  }

  return (
    <Card testID="settings-claim-requests">
      <CardHeader>
        <CardTitle>{t("players.claim.settingsTitle")}</CardTitle>
        <CardDescription>{t("players.claim.settingsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-2">
        {isPending ? null : (data ?? []).length === 0 ? (
          <Text className="text-sm text-muted-foreground" testID="settings-claim-requests-empty">
            {t("players.claim.settingsEmpty")}
          </Text>
        ) : (
          rows
        )}
      </CardContent>
    </Card>
  );
}

/**
 * players.claim rule 5j (PAD-528): the dry run of this request, in words, above the
 * accept button. Silent while loading or on failure — the banner's hint still describes
 * the merge. Twin of web's MergePreviewLines.
 */
function MergePreviewLines({ requestId }: { requestId: string }) {
  const { t } = useTranslation();
  const [plan, setPlan] = React.useState<playerClaimsApi.MergePreview | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => playerClaimsApi.previewClaimRequest(requestId))
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [requestId]);
  if (!plan) return null;
  const described = describeMergePlan(plan, t, "yours");
  return (
    <View testID={`claim-preview-${requestId}`}>
      <Text className="text-xs text-muted-foreground">{described.moves ?? t("players.claim.previewNothing")}</Text>
      {described.kept ? <Text className="text-xs text-muted-foreground">{described.kept}</Text> : null}
      <Text className="text-xs font-semibold">{t("players.claim.previewIrreversible")}</Text>
    </View>
  );
}
