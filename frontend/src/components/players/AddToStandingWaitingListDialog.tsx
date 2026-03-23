import { useState } from "react";
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
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "2 months", days: 60 },
];

export function AddToStandingWaitingListDialog({ open, onClose, playerId, playerName, onAdded }: Props) {
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

  const firstName = playerName?.split(" ")[0] ?? "This student";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListX className="w-4 h-4" />
            Add to waiting list
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <p className="text-sm text-muted-foreground">
            {firstName} will be added to the waiting list for all upcoming classes.
          </p>

          {/* Duration */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Duration</p>
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
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Credits */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Max classes to fill</p>
            <p className="text-xs text-muted-foreground">
              Automatically removed after accepting this many spots.
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
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            Add to waiting list
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
