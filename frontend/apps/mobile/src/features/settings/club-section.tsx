import { Ionicons } from "@expo/vector-icons";
import { clubsApi, invitationsApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { formatInviteExpiry } from "@/features/settings/date-format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";

/**
 * Coach club section, mirroring web's ClubSection.tsx: view the club, invite
 * co-coaches (shareable link, no email field — web doesn't have one either),
 * list/revoke pending invitations.
 *
 * Uses local state + effects (not react-query), same as the web source —
 * this data isn't shared with any other screen so a query cache buys nothing.
 *
 * Note: mobile has no clipboard dependency yet (web's "copy invite link"
 * button uses navigator.clipboard, unavailable in RN). The invite link is
 * rendered as selectable text instead — the OS long-press "Copy" menu covers
 * the same need without adding a new native module mid-task.
 */
export function ClubSection() {
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = React.useState(true);
  const [club, setClub] = React.useState<invitationsApi.CoachClub | null>(
    null
  );
  const [invitations, setInvitations] = React.useState<
    invitationsApi.PendingCoachInvitation[]
  >([]);

  const [creating, setCreating] = React.useState(false);
  const [revokingToken, setRevokingToken] = React.useState<string | null>(
    null
  );
  const [inviteDialogOpen, setInviteDialogOpen] = React.useState(false);
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null);
  // clubs.join-request rule 9: coaches asking to come in (mirrors web).
  const [joinRequests, setJoinRequests] = React.useState<clubsApi.ClubJoinRequest[]>([]);
  const [decidingId, setDecidingId] = React.useState<number | null>(null);

  const refreshJoinRequests = React.useCallback(
    async (clubId: number) => {
      try {
        setJoinRequests(await clubsApi.listClubJoinRequests(clubId));
      } catch {
        toast.error(t("settings.club.joinRequests.loadFailed"));
      }
    },
    [t]
  );

  const handleDecide = async (req: clubsApi.ClubJoinRequest, approve: boolean) => {
    if (!club) return;
    setDecidingId(req.id);
    try {
      if (approve) {
        await clubsApi.approveClubJoinRequest(req.id);
        toast.success(t("settings.club.joinRequests.approved", { name: req.coachName }));
      } else {
        await clubsApi.rejectClubJoinRequest(req.id);
        toast.success(t("settings.club.joinRequests.declined", { name: req.coachName }));
      }
      await refreshJoinRequests(club.id);
    } catch {
      toast.error(t("settings.club.joinRequests.actionFailed"));
    } finally {
      setDecidingId(null);
    }
  };

  const refreshInvitations = React.useCallback(async (clubId: number) => {
    try {
      const data = await invitationsApi.listCoachInvitations(clubId);
      setInvitations(data);
    } catch {
      // Non-fatal — keep the current list
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    invitationsApi
      .getCoachClub()
      .then(async (c) => {
        if (cancelled) return;
        setClub(c);
        if (c) await Promise.all([refreshInvitations(c.id), refreshJoinRequests(c.id)]);
      })
      .catch(() => {
        if (!cancelled) setClub(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshInvitations, refreshJoinRequests]);

  const handleInviteCoach = async () => {
    if (!club) return;
    setCreating(true);
    try {
      const created = await invitationsApi.createCoachInvitation(club.id);
      // Mobile has no window.location — the API returns a relative
      // inviteLink (e.g. "/invite/coach/<token>"); show it as-is, it's
      // meant to be opened on the web app either way.
      setInviteUrl(created.inviteLink);
      setInviteDialogOpen(true);
      await refreshInvitations(club.id);
    } catch {
      toast.error(
        t("settings.club.createInvitationFailed"),
        t("settings.club.createInvitationFailedDescription")
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (token: string) => {
    if (!club) return;
    setRevokingToken(token);
    try {
      await invitationsApi.revokeCoachInvitation(token);
      await refreshInvitations(club.id);
      toast.success(t("settings.club.invitationRevoked"));
    } catch {
      toast.error(t("settings.club.revokeFailed"));
    } finally {
      setRevokingToken(null);
    }
  };

  return (
    <Card testID="settings-club">
      <CardHeader>
        <CardTitle>{t("settings.club.title")}</CardTitle>
        <CardDescription>{t("settings.club.description")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        {loading ? (
          <View className="items-center py-6">
            <Spinner />
          </View>
        ) : !club ? (
          <View className="items-center gap-2 py-6">
            <Ionicons
              name="business-outline"
              size={28}
              color={lightTheme.mutedForeground}
            />
            <Text className="text-sm text-muted-foreground">
              {t("settings.club.noClub")}
            </Text>
          </View>
        ) : (
          <>
            <View className="flex-row items-center justify-between rounded-lg border border-border p-3">
              <View className="flex-1 flex-row items-center gap-3">
                <Ionicons
                  name="business-outline"
                  size={20}
                  color={lightTheme.mutedForeground}
                />
                <View className="flex-1">
                  <Text className="font-medium">{club.name}</Text>
                  <Text className="text-sm text-muted-foreground">
                    {t("settings.club.currentClub")}
                  </Text>
                </View>
              </View>
              <Button
                size="sm"
                testID="club-invite"
                accessibilityLabel={t("settings.club.inviteCoach")}
                disabled={creating}
                onPress={() => void handleInviteCoach()}
              >
                {creating ? (
                  <Spinner size="small" color={lightTheme.primaryForeground} />
                ) : (
                  <Text>{t("settings.club.inviteCoach")}</Text>
                )}
              </Button>
            </View>

            <Separator />

            <View className="gap-2" testID="club-join-requests">
              <Text className="text-sm font-medium">
                {t("settings.club.joinRequests.title")}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {t("settings.club.joinRequests.description")}
              </Text>
              {joinRequests.length === 0 ? (
                <Text className="text-sm text-muted-foreground" testID="club-join-requests-empty">
                  {t("settings.club.joinRequests.empty")}
                </Text>
              ) : (
                joinRequests.map((req) => (
                  <View
                    key={req.id}
                    testID={`club-join-request-${req.id}`}
                    className="gap-2 rounded-lg border border-border p-3"
                  >
                    <Text className="font-medium" numberOfLines={1}>
                      {req.coachName}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {t("settings.club.joinRequests.requestedAt", {
                        date: new Date(req.requestedAt).toLocaleDateString(i18n.language),
                      })}
                    </Text>
                    <View className="flex-row gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        testID={`club-join-approve-${req.id}`}
                        disabled={decidingId === req.id}
                        onPress={() => void handleDecide(req, true)}
                      >
                        {decidingId === req.id ? (
                          <Spinner size="small" color={lightTheme.primaryForeground} />
                        ) : (
                          <Text>{t("settings.club.joinRequests.approve")}</Text>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        testID={`club-join-decline-${req.id}`}
                        disabled={decidingId === req.id}
                        onPress={() => void handleDecide(req, false)}
                      >
                        <Text>{t("settings.club.joinRequests.decline")}</Text>
                      </Button>
                    </View>
                  </View>
                ))
              )}
            </View>

            <Separator />

            <View className="gap-2">
              <Text className="text-sm font-medium">
                {t("settings.club.pendingInvitations")}
              </Text>
              {invitations.length === 0 ? (
                <Text className="text-sm text-muted-foreground">
                  {t("settings.club.noPendingInvitations")}
                </Text>
              ) : (
                invitations.map((inv) => (
                  <View
                    key={inv.token}
                    className="flex-row items-center justify-between rounded-lg border border-border p-3"
                  >
                    <View className="flex-1 pr-2">
                      <Text className="font-medium" numberOfLines={1}>
                        {inv.email || t("settings.club.shareableLink")}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {t("settings.club.expires", {
                          date: formatInviteExpiry(inv.expiresAt, i18n.language),
                        })}
                      </Text>
                    </View>
                    <Button
                      variant="ghost"
                      size="sm"
                      testID={`club-revoke-${inv.token}`}
                      accessibilityLabel={t("settings.club.revokeInvitation")}
                      disabled={revokingToken === inv.token}
                      onPress={() => void handleRevoke(inv.token)}
                    >
                      {revokingToken === inv.token ? (
                        <Spinner size="small" color={lightTheme.destructive} />
                      ) : (
                        <Text className="text-destructive">
                          {t("settings.club.revoke")}
                        </Text>
                      )}
                    </Button>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </CardContent>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.club.inviteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.club.inviteDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <View className="rounded-md border border-input bg-background px-3 py-3">
            <Text selectable className="text-sm text-foreground">
              {inviteUrl ?? ""}
            </Text>
          </View>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
