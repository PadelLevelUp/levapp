import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellOff, Loader2 } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getMe, updateMe } from "@/api/auth";

/**
 * PAD-112 — the student's own notification block preferences.
 *
 * Three INDEPENDENT levels. "Block everything" is a superset in EFFECT, but it
 * is not a master switch over the other two: turning it on leaves them where
 * they were, and turning it off does not turn them off. The student may be
 * blocking automatic invitations for one reason and everything for another.
 *
 * Save discipline: every control edits local state and a single Save button
 * persists the lot. Settings already contains both patterns — a global Save
 * (Profile) and per-control optimistic auto-save (the notification engine) —
 * and mixing them inside one panel is how you get toggles that persist while
 * the reason box silently doesn't. One pattern per panel.
 *
 * The confirmation gate on "block everything" fires when the switch is flipped
 * ON, not at save time: cancelling must leave the switch off, so the student is
 * never looking at a screen that claims a state they declined.
 */
export function StudentNotificationBlocksSection() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);

  const [blockAuto, setBlockAuto] = useState(false);
  const [blockManual, setBlockManual] = useState(false);
  const [blockAll, setBlockAll] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let active = true;
    getMe()
      .then((me) => {
        if (!active) return;
        setBlockAuto(Boolean(me.blockAutoInvitations));
        setBlockManual(Boolean(me.blockManualInvitations));
        setBlockAll(Boolean(me.blockAllNotifications));
        setReason(me.notificationBlockReason ?? "");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMe({
        blockAutoInvitations: blockAuto,
        blockManualInvitations: blockManual,
        blockAllNotifications: blockAll,
        notificationBlockReason: reason.trim(),
      });
      // Only after the server confirms — never an optimistic success toast.
      toast({
        title: t("settings.notificationBlocks.savedTitle"),
        description: t("settings.notificationBlocks.savedDescription"),
      });
    } catch {
      toast({
        variant: "destructive",
        title: t("settings.toast.couldNotSaveTitle"),
        description: t("settings.toast.couldNotSaveDescription"),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin inline-block" />
        </CardContent>
      </Card>
    );
  }

  const anyBlocked = blockAuto || blockManual || blockAll;

  return (
    <Card data-testid="student-notification-blocks">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellOff className="w-4 h-4" />
          {t("settings.notificationBlocks.title")}
        </CardTitle>
        <CardDescription>
          {t("settings.notificationBlocks.description")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <ToggleRow
          testId="student-notif-block-auto"
          title={t("settings.notificationBlocks.autoTitle")}
          description={t("settings.notificationBlocks.autoDescription")}
          checked={blockAuto}
          onCheckedChange={setBlockAuto}
        />

        <ToggleRow
          testId="student-notif-block-manual"
          title={t("settings.notificationBlocks.manualTitle")}
          description={t("settings.notificationBlocks.manualDescription")}
          checked={blockManual}
          onCheckedChange={setBlockManual}
        />

        <ToggleRow
          testId="student-notif-block-all"
          title={t("settings.notificationBlocks.allTitle")}
          description={t("settings.notificationBlocks.allDescription")}
          checked={blockAll}
          onCheckedChange={(val) => {
            // Turning it OFF is harmless and needs no confirmation. Turning it
            // ON has an attendance consequence, so it goes through the dialog.
            if (val) setConfirmAllOpen(true);
            else setBlockAll(false);
          }}
        />

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="notification-block-reason">
            {t("settings.notificationBlocks.reasonLabel")}
          </Label>
          <Textarea
            id="notification-block-reason"
            data-testid="student-notif-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("settings.notificationBlocks.reasonPlaceholder")}
            rows={3}
            maxLength={500}
          />
          {/* Shown always, not only while a toggle is on: the student should
              know the reason is coach-visible BEFORE they type it. */}
          <p className="text-xs text-muted-foreground">
            {t("settings.notificationBlocks.reasonHelp")}
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            data-testid="student-notif-save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {saving
              ? t("settings.notificationBlocks.saving")
              : t("settings.notificationBlocks.save")}
          </Button>
        </div>

        {anyBlocked && (
          <p className="sr-only" data-testid="student-notif-any-blocked">
            blocked
          </p>
        )}
      </CardContent>

      <AlertDialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
        <AlertDialogContent data-testid="student-notif-confirm-all">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.notificationBlocks.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.notificationBlocks.confirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="student-notif-confirm-cancel">
              {t("settings.notificationBlocks.confirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="student-notif-confirm-accept"
              onClick={() => setBlockAll(true)}
            >
              {t("settings.notificationBlocks.confirmAccept")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ToggleRow({
  testId,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  testId: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        data-testid={testId}
        aria-label={title}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
