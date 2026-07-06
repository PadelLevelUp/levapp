import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ListX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { addToStandingWaitingList } from "@/api/notificationEngine";
import type { StandingWaitingListEntry } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  playerId: number;
  playerName: string | null;
  onAdded?: (entry: StandingWaitingListEntry) => void;
}

const DURATION_OPTIONS = [
  { labelKey: "players.duration1Week", days: 7 },
  { labelKey: "players.duration2Weeks", days: 14 },
  { labelKey: "players.duration1Month", days: 30 },
  { labelKey: "players.duration2Months", days: 60 },
];

export function AddToStandingWaitingListDialog({ open, onClose, playerId, playerName, onAdded }: Props) {
  const { t } = useTranslation();
  const [durationDays, setDurationDays] = useState(30);
  const [credits, setCredits] = useState(3);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const entry = await addToStandingWaitingList(playerId, credits, durationDays);
      onAdded?.(entry);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const firstName = playerName?.split(" ")[0] ?? t("players.waitingListDefaultName");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListX className="w-4 h-4" />
            {t("players.addToWaitingList")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <p className="text-sm text-muted-foreground">
            {t("players.waitingListDescription", { name: firstName })}
          </p>

          {/* Duration */}
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("players.duration")}</p>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setDurationDays(opt.days)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    durationDays === opt.days
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Credits */}
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("players.maxClassesToFill")}</p>
            <p className="text-xs text-muted-foreground">
              {t("players.maxClassesToFillHint")}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCredits((c) => Math.max(1, c - 1))}
                className="w-8 h-8 rounded-md border border-border hover:bg-muted flex items-center justify-center text-lg leading-none"
              >
                −
              </button>
              <span className="text-sm font-medium w-4 text-center">{credits}</span>
              <button
                type="button"
                onClick={() => setCredits((c) => Math.min(20, c + 1))}
                className="w-8 h-8 rounded-md border border-border hover:bg-muted flex items-center justify-center text-lg leading-none"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>{t("common.cancel")}</Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            {t("players.addToWaitingList")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
