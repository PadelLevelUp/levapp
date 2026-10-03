import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ListX } from "lucide-react";
import {
  DEFAULT_STANDING_PRESET,
  STANDING_PRESETS,
  isStandingEndAllowed,
  standingEndBounds,
  standingEndFor,
  standingPresetOf,
} from "@levelup/config";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addToStandingWaitingList, renewStandingWaitingListEntry } from "@/api/notificationEngine";
import type { StandingWaitingListEntry } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  playerId: number;
  playerName: string | null;
  onAdded?: (entry: StandingWaitingListEntry) => void;
  /** PAD-507: renew this entry — only its end date changes; credits stay. */
  renewing?: StandingWaitingListEntry | null;
}

/**
 * The standing waiting-list dialog (notifications.waiting-list rule 2, PAD-507): the coach picks an
 * end date — a preset fills it, or any date today through 12 months ahead — and, when adding, the
 * number of classes to fill. Renewing moves the end date only.
 */
export function AddToStandingWaitingListDialog({ open, onClose, playerId, playerName, onAdded, renewing }: Props) {
  const { t } = useTranslation();
  const [today, setToday] = useState(() => new Date());
  const [expiresOn, setExpiresOn] = useState(() => standingEndFor(DEFAULT_STANDING_PRESET, new Date()));
  const [credits, setCredits] = useState(3);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setToday(now);
    setExpiresOn(standingEndFor(DEFAULT_STANDING_PRESET, now));
  }, [open]);

  const { min, max } = standingEndBounds(today);
  const valid = isStandingEndAllowed(expiresOn, today);
  const chosenPreset = standingPresetOf(expiresOn, today);

  const handleConfirm = async () => {
    if (!valid) return;
    setLoading(true);
    try {
      const entry = renewing
        ? await renewStandingWaitingListEntry(renewing.id, expiresOn)
        : await addToStandingWaitingList(playerId, credits, expiresOn);
      onAdded?.(entry);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const firstName = playerName?.split(" ")[0] ?? t("players.waitingListDefaultName");
  const title = renewing ? t("players.renewWaitingListTitle") : t("players.addToWaitingList");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" data-testid="standing-wl-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListX className="w-4 h-4" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <p className="text-sm text-muted-foreground">
            {renewing
              ? t("players.renewWaitingListDescription", { name: firstName })
              : t("players.waitingListDescription", { name: firstName })}
          </p>

          {/* End date: a preset fills it; any date today through 12 months ahead. */}
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("players.endDate")}</p>
            <div className="flex flex-wrap gap-2">
              {STANDING_PRESETS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  data-testid={`standing-wl-preset-${opt.key}`}
                  aria-pressed={chosenPreset === opt.key}
                  onClick={() => setExpiresOn(standingEndFor(opt.key, today))}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    chosenPreset === opt.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
            <Input
              type="date"
              data-testid="standing-wl-end-date"
              aria-label={t("players.endDate")}
              aria-invalid={valid ? undefined : true}
              min={min}
              max={max}
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              className="h-9 text-sm"
            />
            <p className={`text-xs ${valid ? "text-muted-foreground" : "text-destructive"}`}>
              {valid ? t("players.endDateHint") : t("players.endDateInvalid")}
            </p>
          </div>

          {/* Credits (adding only: a renewal keeps them) */}
          {!renewing && (
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
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>{t("common.cancel")}</Button>
          <Button onClick={handleConfirm} disabled={loading || !valid} data-testid="standing-wl-confirm">
            {loading && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            {renewing ? t("players.renewWaitingList") : t("players.addToWaitingList")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
