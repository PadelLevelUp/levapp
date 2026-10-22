import { Ionicons } from "@expo/vector-icons";
import {
  DEFAULT_STANDING_PRESET,
  STANDING_PRESETS,
  isStandingEndAllowed,
  lightTheme,
  standingEndFor,
  standingPresetOf,
} from "@levelup/config";
import { useCoachDisplayName } from "@levelup/hooks";
import type { StandingWaitingListEntry } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import * as notificationEngineApi from "@levelup/api/src/resources/notificationEngine";
import type { StandingEligibilityClass } from "@levelup/api/src/resources/notificationEngine";
import { useAddToStandingWaitingList, useRenewStandingWaitingList } from "./hooks";

const DEFAULT_CREDITS = 3;
const MIN_CREDITS = 1;
const MAX_CREDITS = 20;
/** B-295: the date picker's dialog renders inside this dialog's overlay, above it (through the
 * root host it draws behind). */
const DIALOG_PORTAL_HOST = "waiting-list-dialog-host";

interface WaitingListDialogProps {
  open: boolean;
  onClose: () => void;
  playerId: number;
  playerName: string | null;
  /** PAD-507: renew this entry — only its end date changes; credits stay. */
  renewing?: StandingWaitingListEntry | null;
}

/** Mobile port of web's AddToStandingWaitingListDialog.tsx (notifications.waiting-list rule 2,
 * PAD-507). The end date: a preset chip fills it, or the date field takes any date today
 * through 12 months ahead ("Outra data"). Credits use a −/value/+ stepper mirroring web's; a
 * renewal keeps them and moves the end date only. */
export function WaitingListDialog({
  open,
  onClose,
  playerId,
  playerName,
  renewing,
}: WaitingListDialogProps) {
  const { t } = useTranslation();
  // PAD-660: the coach reads the student under the nickname they gave them.
  const displayName = useCoachDisplayName();
  const [today, setToday] = React.useState(() => new Date());
  const [expiresOn, setExpiresOn] = React.useState(() =>
    standingEndFor(DEFAULT_STANDING_PRESET, new Date())
  );
  const [credits, setCredits] = React.useState(DEFAULT_CREDITS);
  const addToWaitingList = useAddToStandingWaitingList();
  const renew = useRenewStandingWaitingList();
  // PAD-724 (PAD-669 R5, waiting-list rule 2a): the classes in reach whose bar the student fails,
  // shown before the add (submit path only); null until checked.
  const [warnClasses, setWarnClasses] = React.useState<StandingEligibilityClass[] | null>(null);
  const [checking, setChecking] = React.useState(false);
  const pending = addToWaitingList.isPending || renew.isPending || checking;

  React.useEffect(() => {
    if (!open) return;
    const now = new Date();
    setToday(now);
    setExpiresOn(standingEndFor(DEFAULT_STANDING_PRESET, now));
    setCredits(DEFAULT_CREDITS);
  }, [open]);
  React.useEffect(() => setWarnClasses(null), [open, expiresOn]);

  const valid = isStandingEndAllowed(expiresOn, today);
  const preset = standingPresetOf(expiresOn, today);

  const handleClose = () => {
    if (pending) return;
    onClose();
  };

  const shownName = playerName == null ? null : displayName(playerId, playerName);
  const name = shownName ?? t("players.waitingListDefaultName");

  const handleConfirm = async () => {
    if (!valid) return;
    if (!renewing && warnClasses === null) {
      setChecking(true);
      const { classes } = await notificationEngineApi
        .checkStandingEligibility(playerId, expiresOn)
        .catch(() => ({ classes: [] as StandingEligibilityClass[] }));
      setChecking(false);
      if (classes.length > 0) {
        setWarnClasses(classes);
        return;
      }
    }
    try {
      if (renewing) {
        await renew.mutateAsync({ entryId: renewing.id, expiresOn });
        toast.success(t("players.waitingListRenewed", { name }));
      } else {
        await addToWaitingList.mutateAsync({ playerId, credits, expiresOn });
        toast.success(t("players.addedToWaitingList", { name }));
      }
      onClose();
    } catch {
      toast.error(t("common.somethingWentWrong"));
    }
  };

  // A nickname is already the short form the coach uses; only the real name is cut to its first word.
  const firstName =
    shownName == null
      ? t("players.waitingListDefaultName")
      : shownName === playerName
        ? shownName.split(" ")[0]
        : shownName;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent testID="waiting-list-dialog" innerPortalHost={DIALOG_PORTAL_HOST}>
        <DialogHeader>
          <DialogTitle>
            {renewing ? t("players.renewWaitingListTitle") : t("players.addToWaitingList")}
          </DialogTitle>
        </DialogHeader>

        <View className="gap-5 py-1">
          <Text className="text-sm text-muted-foreground">
            {renewing
              ? t("players.renewWaitingListDescription", { name: firstName })
              : t("players.waitingListDescription", { name: firstName })}
          </Text>

          <View className="gap-2">
            <Text className="text-sm font-medium">{t("players.endDate")}</Text>
            {/* Presets as chips, as web's pills: a Select inside a Dialog is unreachable on iOS (B-295). */}
            <View
              className="flex-row flex-wrap gap-2"
              accessibilityLabel={t("players.waitingListDurationAria")}
            >
              {STANDING_PRESETS.map((opt) => {
                const chosen = preset === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    testID={`waiting-list-preset-${opt.key}`}
                    role="button"
                    accessibilityState={{ selected: chosen }}
                    onPress={() => setExpiresOn(standingEndFor(opt.key, today))}
                    className="rounded-md border px-3 py-1.5"
                    style={{
                      backgroundColor: chosen ? lightTheme.primary : "transparent",
                      borderColor: chosen ? lightTheme.primary : lightTheme.border,
                    }}
                  >
                    <Text
                      className="text-sm"
                      style={{ color: chosen ? lightTheme.primaryForeground : lightTheme.foreground }}
                    >
                      {t(opt.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <DatePickerInput
              testID="waiting-list-end-date"
              value={expiresOn}
              onChange={setExpiresOn}
              portalHost={DIALOG_PORTAL_HOST}
              error={valid ? undefined : t("players.endDateInvalid")}
            />
            {valid ? (
              <Text className="text-xs text-muted-foreground">
                {t("players.endDateHint")}
              </Text>
            ) : null}
          </View>

          {renewing ? null : (
            <View className="gap-2">
              <Text className="text-sm font-medium">
                {t("players.maxClassesToFill")}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {t("players.maxClassesToFillHint")}
              </Text>
              <View
                testID="waiting-list-credits"
                className="flex-row items-center gap-3"
              >
                <Pressable
                  accessibilityLabel={t("players.decreaseMaxClassesAria")}
                  role="button"
                  hitSlop={8}
                  disabled={credits <= MIN_CREDITS}
                  onPress={() =>
                    setCredits((c) => Math.max(MIN_CREDITS, c - 1))
                  }
                  className="h-8 w-8 items-center justify-center rounded-full bg-muted"
                >
                  <Ionicons
                    name="remove"
                    size={16}
                    color={lightTheme.foreground}
                  />
                </Pressable>
                <Text className="w-6 text-center text-sm font-semibold tabular-nums">
                  {credits}
                </Text>
                <Pressable
                  accessibilityLabel={t("players.increaseMaxClassesAria")}
                  role="button"
                  hitSlop={8}
                  disabled={credits >= MAX_CREDITS}
                  onPress={() =>
                    setCredits((c) => Math.min(MAX_CREDITS, c + 1))
                  }
                  className="h-8 w-8 items-center justify-center rounded-full bg-muted"
                >
                  <Ionicons name="add" size={16} color={lightTheme.foreground} />
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {warnClasses && warnClasses.length > 0 ? (
          <View testID="standing-wl-eligibility-warning" className="rounded-md border border-warning/40 bg-warning/10 p-3">
            <Text className="text-sm font-medium">{t("calendar.eligibilityConfirm.waitingListTitle")}</Text>
            <Text className="mt-1 text-xs text-muted-foreground">{t("calendar.eligibilityConfirm.standingClasses")}</Text>
            {warnClasses.map((c) => (
              <Text key={c.lessonInstanceId} className="mt-1 text-xs text-muted-foreground">
                • {c.title ?? ""} · {c.startDatetime.slice(8, 10)}/{c.startDatetime.slice(5, 7)} {c.startDatetime.slice(11, 16)}
              </Text>
            ))}
            <Text className="mt-1 text-xs text-muted-foreground">{t("calendar.eligibilityConfirm.waitingListBody")}</Text>
          </View>
        ) : null}
        <DialogFooter className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            accessibilityLabel={t("players.cancelWaitingListAria")}
            onPress={handleClose}
            disabled={pending}
          >
            <Text>{t("common.cancel")}</Text>
          </Button>
          <Button
            testID="waiting-list-save"
            accessibilityLabel={t("players.confirmWaitingListAria")}
            className="flex-1"
            disabled={pending || !valid}
            onPress={() => void handleConfirm()}
          >
            {pending ? (
              <Spinner size="small" color={lightTheme.primaryForeground} />
            ) : null}
            <Text>
              {renewing
                ? t("players.renewWaitingList")
                : warnClasses && warnClasses.length > 0
                  ? t("calendar.eligibilityConfirm.confirm")
                  : t("players.addToWaitingList")}
            </Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
