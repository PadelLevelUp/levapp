import { adminApi } from "@levelup/api";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";

/**
 * auth.coach-approval rule 7 — the LevApp admin's list of coaches waiting for
 * approval, mirroring web's AdminSection. Shown only to a superadmin
 * (settings-sections.ts); the endpoints are superadmin-only server-side.
 */
export function AdminSection() {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState<adminApi.PendingCoach[]>([]);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [rejecting, setRejecting] = React.useState<adminApi.PendingCoach | null>(null);
  const [reason, setReason] = React.useState("");
  // auth.coach-approval rule 9 (PAD-279): the approval gate is an app setting.
  const [settings, setSettings] = React.useState<adminApi.AdminSettings | null>(null);
  const [savingSetting, setSavingSetting] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const [rows, current] = await Promise.all([
        adminApi.listPendingCoaches(),
        adminApi.getAdminSettings(),
      ]);
      setPending(rows);
      setSettings(current);
    } catch {
      toast.error(t("settings.admin.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const toggleApproval = async (value: boolean) => {
    if (savingSetting) return;
    setSavingSetting(true);
    try {
      setSettings(await adminApi.updateAdminSettings({ coachApprovalRequired: value }));
      toast.success(t("settings.admin.coachApprovalSaved"));
    } catch {
      toast.error(t("settings.admin.actionFailed"));
    } finally {
      setSavingSetting(false);
    }
  };

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const approve = async (coach: adminApi.PendingCoach) => {
    setBusyId(coach.coachId);
    try {
      await adminApi.approveCoach(coach.coachId);
      toast.success(t("settings.admin.approved", { name: coach.name }));
      await refresh();
    } catch {
      toast.error(t("settings.admin.actionFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    setBusyId(rejecting.coachId);
    try {
      await adminApi.rejectCoach(rejecting.coachId, reason.trim() || undefined);
      toast.success(t("settings.admin.rejected", { name: rejecting.name }));
      setRejecting(null);
      setReason("");
      await refresh();
    } catch {
      toast.error(t("settings.admin.actionFailed"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card testID="admin-coach-approvals">
      <CardHeader>
        <CardTitle>{t("settings.admin.pendingCoaches")}</CardTitle>
        <CardDescription>{t("settings.admin.pendingCoachesDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        {settings ? (
          <View
            className="flex-row items-center justify-between gap-3 rounded-lg border border-border p-3"
            testID="admin-coach-approval-required"
          >
            <View className="flex-1 gap-0.5">
              <Text className="font-medium">{t("settings.admin.coachApprovalRequired")}</Text>
              <Text className="text-xs text-muted-foreground">
                {t("settings.admin.coachApprovalRequiredDescription")}
              </Text>
              {settings.source === "environment" ? (
                <Text className="text-xs text-muted-foreground" testID="admin-coach-approval-source-env">
                  {t("settings.admin.coachApprovalFromEnvironment")}
                </Text>
              ) : null}
              {/* Maestro reads the state off these ids; the switch itself has no text. */}
              <View
                testID={
                  settings.coachApprovalRequired
                    ? "admin-coach-approval-required-on"
                    : "admin-coach-approval-required-off"
                }
              />
            </View>
            <Switch
              testID="admin-coach-approval-required-switch"
              accessibilityLabel={t("settings.admin.coachApprovalRequired")}
              checked={settings.coachApprovalRequired}
              onCheckedChange={(val: boolean) => void toggleApproval(val)}
            />
          </View>
        ) : null}
        {loading ? (
          <Spinner />
        ) : pending.length === 0 ? (
          <Text className="text-sm text-muted-foreground" testID="admin-no-pending">
            {t("settings.admin.noPending")}
          </Text>
        ) : (
          pending.map((coach) => (
            <View
              key={coach.coachId}
              testID={`admin-pending-${coach.username}`}
              className="gap-2 rounded-lg border border-border p-3"
            >
              <Text className="font-medium">{coach.name}</Text>
              <Text className="text-xs text-muted-foreground">
                @{coach.username}
                {coach.email ? ` · ${coach.email}` : ""}
                {" · "}
                {new Date(coach.requestedAt).toLocaleDateString(i18n.language)}
              </Text>
              {/* auth.email-verification rule 10: nobody can reach this coach yet. */}
              {coach.email && coach.emailVerified === false ? (
                <Text className="text-xs text-destructive" testID={`admin-email-unverified-${coach.username}`}>
                  {t("settings.admin.emailUnverified")}
                </Text>
              ) : null}
              <View className="flex-row gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  testID={`admin-approve-${coach.username}`}
                  disabled={busyId === coach.coachId}
                  onPress={() => void approve(coach)}
                >
                  <Text>{t("settings.admin.approve")}</Text>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  testID={`admin-reject-${coach.username}`}
                  disabled={busyId === coach.coachId}
                  onPress={() => setRejecting(coach)}
                >
                  <Text>{t("settings.admin.reject")}</Text>
                </Button>
              </View>
            </View>
          ))
        )}
      </CardContent>

      <Dialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.admin.rejectDialogTitle", { name: rejecting?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("settings.admin.rejectDialogDescription")}</DialogDescription>
          </DialogHeader>
          <View className="gap-1.5">
            <Label>{t("settings.admin.reason")}</Label>
            <Input
              value={reason}
              onChangeText={setReason}
              placeholder={t("settings.admin.reasonPlaceholder")}
              testID="admin-reject-reason"
            />
          </View>
          <View className="mt-3 flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={() => setRejecting(null)}>
              <Text>{t("common.cancel")}</Text>
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              testID="admin-reject-confirm"
              disabled={busyId !== null}
              onPress={() => void reject()}
            >
              <Text>{t("settings.admin.reject")}</Text>
            </Button>
          </View>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
