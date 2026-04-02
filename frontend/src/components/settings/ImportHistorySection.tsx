import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { History, Undo2, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getImportHistory,
  revertImport,
  type ImportHistoryEntry,
} from "@/api/import";
import { invalidateCoachPlayersCache } from "@/api/players";

const TABLE_LABELS: Record<string, string> = {
  Players: "players",
  Classes: "classes",
  "Players in Classes": "class enrollments",
  Presences: "attendance records",
  Evaluations: "evaluations",
  Strengths: "strengths",
  Weaknesses: "weaknesses",
  "Coach Levels": "levels",
  "Evaluation Categories": "evaluation categories",
};

function formatSummary(summary: Record<string, number>): string {
  return Object.entries(summary)
    .map(([key, count]) => `${count} ${TABLE_LABELS[key] || key.toLowerCase()}`)
    .join(", ");
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ImportHistorySection() {
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [revertingId, setRevertingId] = useState<number | null>(null);
  const [confirmEntry, setConfirmEntry] = useState<ImportHistoryEntry | null>(null);
  const [revertedMessage, setRevertedMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getImportHistory();
      setHistory(data);
    } catch {
      // Silently fail — section just won't show
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRevert = async (entry: ImportHistoryEntry) => {
    setConfirmEntry(null);
    setRevertingId(entry.id);
    try {
      await revertImport(entry.id);
      invalidateCoachPlayersCache();
      setRevertedMessage("Successfully reverted import");
      toast({
        title: "Import reverted",
        description: `Removed ${formatSummary(entry.summary)}`,
      });
      await fetchHistory();
    } catch {
      toast({
        title: "Revert failed",
        description: "Could not revert this import. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRevertingId(null);
      setTimeout(() => setRevertedMessage(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading import history...
      </div>
    );
  }

  if (history.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="w-5 h-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold">Import History</h3>
      </div>

      {revertedMessage && (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4" />
          {revertedMessage}
        </div>
      )}

      <div className="space-y-3">
        {history.map((entry) => (
          <div
            key={entry.id}
            data-testid="import-history-entry"
            className="flex items-center justify-between rounded-lg border p-4"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {formatDate(entry.created_at)}
                </span>
                {entry.filename && (
                  <span className="text-xs text-muted-foreground">
                    {entry.filename}
                  </span>
                )}
                <Badge
                  variant={entry.status === "active" ? "default" : "secondary"}
                >
                  {entry.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatSummary(entry.summary)}
              </p>
            </div>

            {entry.status === "active" && (
              <Button
                variant="destructive"
                size="sm"
                disabled={revertingId === entry.id}
                onClick={() => setConfirmEntry(entry)}
              >
                {revertingId === entry.id ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Undo2 className="w-4 h-4 mr-1" />
                )}
                Revert
              </Button>
            )}
          </div>
        ))}
      </div>

      <AlertDialog
        open={!!confirmEntry}
        onOpenChange={(open) => !open && setConfirmEntry(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all items from this import:
              <span className="block mt-2 font-medium text-foreground">
                {confirmEntry && formatSummary(confirmEntry.summary)}
              </span>
              <span className="block mt-2">
                This action cannot be undone. Only items from this specific
                import will be removed — your other data will remain intact.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmEntry && handleRevert(confirmEntry)}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
