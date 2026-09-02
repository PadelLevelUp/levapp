import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type Option,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { useAddToStandingWaitingList } from "./hooks";

const DURATION_OPTIONS = [
  { labelKey: "players.duration1Week", days: 7 },
  { labelKey: "players.duration2Weeks", days: 14 },
  { labelKey: "players.duration1Month", days: 30 },
  { labelKey: "players.duration2Months", days: 60 },
] as const;

const DEFAULT_DURATION_DAYS = 30;
const DEFAULT_CREDITS = 3;
const MIN_CREDITS = 1;
const MAX_CREDITS = 20;

interface WaitingListDialogProps {
  open: boolean;
  onClose: () => void;
  playerId: number;
  playerName: string | null;
}

/** Mobile port of web's AddToStandingWaitingListDialog.tsx. Duration uses the
 * mobile Select (web's pill buttons don't map to a single testID); credits
 * uses a −/value/+ stepper mirroring web's own stepper for the same field. */
export function WaitingListDialog({
  open,
  onClose,
  playerId,
  playerName,
}: WaitingListDialogProps) {
  const { t } = useTranslation();
  const [durationOption, setDurationOption] = React.useState<Option>({
    value: String(DEFAULT_DURATION_DAYS),
    label: t("players.duration1Month"),
  });
  const [credits, setCredits] = React.useState(DEFAULT_CREDITS);
  const addToWaitingList = useAddToStandingWaitingList();

  React.useEffect(() => {
    if (!open) return;
    setDurationOption({
      value: String(DEFAULT_DURATION_DAYS),
      label: t("players.duration1Month"),
    });
    setCredits(DEFAULT_CREDITS);
  }, [open, t]);

  const handleClose = () => {
    if (addToWaitingList.isPending) return;
    onClose();
  };

  const handleConfirm = async () => {
    const durationDays = Number(durationOption?.value ?? DEFAULT_DURATION_DAYS);
    try {
      await addToWaitingList.mutateAsync({ playerId, credits, durationDays });
      toast.success(
        t("players.addedToWaitingList", {
          name: playerName ?? t("players.waitingListDefaultName"),
        })
      );
      onClose();
    } catch {
      toast.error(t("common.somethingWentWrong"));
    }
  };

  const firstName =
    playerName?.split(" ")[0] ?? t("players.waitingListDefaultName");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent testID="waiting-list-dialog">
        <DialogHeader>
          <DialogTitle>{t("players.addToWaitingList")}</DialogTitle>
        </DialogHeader>

        <View className="gap-5 py-1">
          <Text className="text-sm text-muted-foreground">
            {t("players.waitingListDescription", { name: firstName })}
          </Text>

          <View className="gap-2">
            <Text className="text-sm font-medium">{t("players.duration")}</Text>
            <Select value={durationOption} onValueChange={setDurationOption}>
              <SelectTrigger
                testID="waiting-list-duration"
                accessibilityLabel={t("players.waitingListDurationAria")}
              >
                <SelectValue placeholder={t("players.duration")} />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.days}
                    value={String(opt.days)}
                    label={t(opt.labelKey)}
                  />
                ))}
              </SelectContent>
            </Select>
          </View>

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
        </View>

        <DialogFooter className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            accessibilityLabel={t("players.cancelWaitingListAria")}
            onPress={handleClose}
            disabled={addToWaitingList.isPending}
          >
            <Text>{t("common.cancel")}</Text>
          </Button>
          <Button
            testID="waiting-list-save"
            accessibilityLabel={t("players.confirmWaitingListAria")}
            className="flex-1"
            disabled={addToWaitingList.isPending}
            onPress={() => void handleConfirm()}
          >
            {addToWaitingList.isPending ? (
              <Spinner size="small" color={lightTheme.primaryForeground} />
            ) : null}
            <Text>{t("players.addToWaitingList")}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
