import { authApi } from "@levelup/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

/**
 * PAD-169 — the student's own notification block preferences on iOS.
 *
 * Port of web's `StudentNotificationBlocksSection.tsx` (PAD-112). The panel
 * shipped web-only, so a student could be opted out of class-vacancy
 * invitations with no way to change it from the phone — the surface most
 * students actually have.
 *
 * Behaviour matches web, and the rules it implements live in
 * `notifications.student-block-preferences`:
 *
 * - Three INDEPENDENT levels (rule 1). "Block everything" is a superset in
 *   EFFECT, but it is not a master switch over the other two: turning it on
 *   leaves them where they were, and turning it off does not turn them off.
 * - Save discipline: every control edits local state and a single Save button
 *   persists the lot. Settings already contains both patterns — a global Save
 *   (Profile) and per-control optimistic auto-save (the auto-invite engine) —
 *   and mixing them inside one panel is how you get toggles that persist while
 *   the reason box silently doesn't. One pattern per panel.
 * - The confirmation gate on "block everything" (rule 12) fires when the
 *   switch is flipped ON, not at save time: cancelling must leave the switch
 *   off, so the student is never looking at a screen that claims a state they
 *   declined.
 *
 * Role gating is NOT repeated here — `visibleSections()` in
 * `settings-sections.ts` is the single source of truth, and this section is
 * `audience: "student"` there.
 */
export function StudentNotificationBlocksSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Shares the ["auth-me"] cache with the Settings screen and the Profile
  // pane, so opening this section costs no extra request.
  const { data: me, isPending } = useQuery({
    queryKey: ["auth-me"],
    queryFn: authApi.getMe,
  });

  const [blockAuto, setBlockAuto] = React.useState(false);
  const [blockManual, setBlockManual] = React.useState(false);
  const [blockAll, setBlockAll] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [confirmAllOpen, setConfirmAllOpen] = React.useState(false);

  // Set on the first edit so a late /auth/me can't wipe what the student
  // just changed (same guard as profile-section.tsx).
  const dirtyRef = React.useRef(false);

  React.useEffect(() => {
    if (!me || dirtyRef.current) return;
    setBlockAuto(Boolean(me.blockAutoInvitations));
    setBlockManual(Boolean(me.blockManualInvitations));
    setBlockAll(Boolean(me.blockAllNotifications));
    setReason(me.notificationBlockReason ?? "");
  }, [me]);

  const edit = (apply: () => void) => {
    dirtyRef.current = true;
    apply();
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await authApi.updateMe({
        blockAutoInvitations: blockAuto,
        blockManualInvitations: blockManual,
        blockAllNotifications: blockAll,
        notificationBlockReason: reason.trim(),
      });
      queryClient.setQueryData(["auth-me"], updated);
      // Re-hydrate from the response so the pane shows exactly what was
      // stored (the server trims the reason).
      setBlockAuto(Boolean(updated.blockAutoInvitations));
      setBlockManual(Boolean(updated.blockManualInvitations));
      setBlockAll(Boolean(updated.blockAllNotifications));
      setReason(updated.notificationBlockReason ?? "");
      dirtyRef.current = false;
      // Only after the server confirms — never an optimistic success toast.
      toast.success(t("settings.notificationBlocks.savedDescription"));
    } catch {
      toast.error(t("settings.toast.couldNotSaveDescription"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isPending) {
    return (
      <Card testID="student-notification-blocks">
        <CardContent className="items-center py-8">
          <Spinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card testID="student-notification-blocks">
      <CardHeader>
        <CardTitle>{t("settings.notificationBlocks.title")}</CardTitle>
        <CardDescription>
          {t("settings.notificationBlocks.description")}
        </CardDescription>
      </CardHeader>

      <CardContent className="gap-5">
        <ToggleRow
          testID="student-notif-block-auto"
          title={t("settings.notificationBlocks.autoTitle")}
          description={t("settings.notificationBlocks.autoDescription")}
          checked={blockAuto}
          onCheckedChange={(v) => edit(() => setBlockAuto(v))}
        />

        <ToggleRow
          testID="student-notif-block-manual"
          title={t("settings.notificationBlocks.manualTitle")}
          description={t("settings.notificationBlocks.manualDescription")}
          checked={blockManual}
          onCheckedChange={(v) => edit(() => setBlockManual(v))}
        />

        <ToggleRow
          testID="student-notif-block-all"
          title={t("settings.notificationBlocks.allTitle")}
          description={t("settings.notificationBlocks.allDescription")}
          checked={blockAll}
          onCheckedChange={(v) => {
            // Turning it OFF is harmless and needs no confirmation. Turning
            // it ON has an attendance consequence, so it goes through the
            // dialog (rule 12).
            if (v) setConfirmAllOpen(true);
            else edit(() => setBlockAll(false));
          }}
        />

        <Separator />

        <View className="gap-1.5">
          <Label>{t("settings.notificationBlocks.reasonLabel")}</Label>
          <Textarea
            testID="student-notif-reason"
            accessibilityLabel={t("settings.notificationBlocks.reasonLabel")}
            value={reason}
            onChangeText={(v) => edit(() => setReason(v))}
            placeholder={t("settings.notificationBlocks.reasonPlaceholder")}
            maxLength={500}
          />
          {/* Shown always, not only while a toggle is on: the student should
              know the reason is coach-visible BEFORE they type it. */}
          <Text className="text-xs text-muted-foreground">
            {t("settings.notificationBlocks.reasonHelp")}
          </Text>
        </View>

        <Button
          testID="student-notif-save"
          accessibilityLabel={t("settings.notificationBlocks.save")}
          disabled={isSaving}
          onPress={() => void handleSave()}
        >
          <Text>
            {isSaving
              ? t("settings.notificationBlocks.saving")
              : t("settings.notificationBlocks.save")}
          </Text>
        </Button>
      </CardContent>

      <AlertDialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
        <AlertDialogContent testID="student-notif-confirm-all">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.notificationBlocks.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.notificationBlocks.confirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              testID="student-notif-confirm-cancel"
              accessibilityLabel={t("settings.notificationBlocks.confirmCancel")}
            >
              <Text>{t("settings.notificationBlocks.confirmCancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="student-notif-confirm-accept"
              accessibilityLabel={t("settings.notificationBlocks.confirmAccept")}
              onPress={() => edit(() => setBlockAll(true))}
            >
              <Text>{t("settings.notificationBlocks.confirmAccept")}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ToggleRow({
  testID,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  testID: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <View className="flex-row items-start justify-between gap-4">
      {/* min-w-0 lets the copy column shrink instead of pushing the switch
          off a 390pt screen. */}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-sm font-medium">{title}</Text>
        <Text className="text-xs text-muted-foreground">{description}</Text>
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={title}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </View>
  );
}
