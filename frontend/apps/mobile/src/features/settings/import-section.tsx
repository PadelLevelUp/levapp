import * as React from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { formatImportTimestamp } from "@/features/settings/date-format";
import {
  getImportHistory,
  revertImport,
  type ImportHistoryEntry,
} from "@/features/settings/settings-api";

const STATUS_LABEL_KEYS: Record<string, string> = {
  active: "settings.importHistory.status.active",
  reverted: "settings.importHistory.status.reverted",
};

const TABLE_LABEL_KEYS: Record<string, string> = {
  Players: "settings.importHistory.labels.players",
  Classes: "settings.importHistory.labels.classes",
  "Players in Classes": "settings.importHistory.labels.classEnrollments",
  Presences: "settings.importHistory.labels.attendanceRecords",
  Evaluations: "settings.importHistory.labels.evaluations",
  Strengths: "settings.importHistory.labels.strengths",
  Weaknesses: "settings.importHistory.labels.weaknesses",
  "Coach Levels": "settings.importHistory.labels.levels",
  "Evaluation Categories": "settings.importHistory.labels.evaluationCategories",
};

function formatSummary(summary: Record<string, number>, t: TFunction): string {
  return Object.entries(summary)
    .map(
      ([key, count]) =>
        `${count} ${TABLE_LABEL_KEYS[key] ? t(TABLE_LABEL_KEYS[key]) : key.toLowerCase()}`
    )
    .join(", ");
}

/**
 * Import Data — history and revert only.
 *
 * SCOPE NOTE (reported to the orchestrator, not just buried here): web's
 * DataImportSection is a drag-and-drop spreadsheet uploader driving two SSE
 * streams (/app/import/analyze, /app/import/confirm/stream). Picking a file on
 * iOS needs `expo-document-picker`, a native module — adding it means a pod
 * install and an app rebuild, which this stream was explicitly told not to do.
 * So uploading/analysing stays on the web app and this pane ports the half
 * that is pure REST: reviewing past imports and reverting them.
 *
 * Web's ImportHistorySection returns `null` when there are no entries. Ported
 * verbatim that would give a coach with no imports a completely blank pane —
 * the exact "renders nothing" failure this rebuild exists to avoid — so the
 * empty state is explicit here, and the "upload on the web" line always shows.
 */
export function ImportSection() {
  const { t, i18n } = useTranslation();

  const [history, setHistory] = React.useState<ImportHistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [revertingId, setRevertingId] = React.useState<number | null>(null);
  const [confirmEntry, setConfirmEntry] =
    React.useState<ImportHistoryEntry | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);

  const fetchHistory = React.useCallback(async () => {
    setLoading(true);
    try {
      setHistory(await getImportHistory());
    } catch {
      setStatus(t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const handleRevert = async (entry: ImportHistoryEntry) => {
    setConfirmEntry(null);
    setRevertingId(entry.id);
    try {
      await revertImport(entry.id);
      setStatus(t("settings.importHistory.revertSuccess"));
      await fetchHistory();
    } catch {
      setStatus(t("settings.importHistory.revertFailedDescription"));
    } finally {
      setRevertingId(null);
    }
  };

  return (
    <Card testID="settings-import">
      <CardHeader>
        <CardTitle>{t("settings.import.title")}</CardTitle>
        <CardDescription>{t("settings.mobile.importOnWeb")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        <Text className="text-sm font-semibold">
          {t("settings.importHistory.title")}
        </Text>

        {loading ? (
          <View className="gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </View>
        ) : history.length === 0 ? (
          <Text
            testID="settings-import-history-empty"
            className="py-2 text-center text-sm text-muted-foreground"
          >
            {t("settings.mobile.importHistoryEmpty")}
          </Text>
        ) : (
          history.map((entry) => (
            <View
              key={entry.id}
              testID="import-history-entry"
              className="gap-2 rounded-lg border border-border p-3"
            >
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="text-sm font-medium">
                  {formatImportTimestamp(entry.created_at, i18n.language)}
                </Text>
                <Badge
                  variant={entry.status === "active" ? "default" : "secondary"}
                >
                  <Text>
                    {STATUS_LABEL_KEYS[entry.status]
                      ? t(STATUS_LABEL_KEYS[entry.status])
                      : entry.status}
                  </Text>
                </Badge>
              </View>

              {entry.filename ? (
                <Text className="text-xs text-muted-foreground">
                  {entry.filename}
                </Text>
              ) : null}

              <Text className="text-sm text-muted-foreground">
                {formatSummary(entry.summary, t)}
              </Text>

              {/* Full-width button on its own line — never squeezed beside the
                  summary text the way web's side-by-side row would be. */}
              {entry.status === "active" ? (
                <Button
                  variant="destructive"
                  size="sm"
                  testID={`import-revert-${entry.id}`}
                  accessibilityLabel={t("settings.importHistory.revert")}
                  disabled={revertingId === entry.id}
                  onPress={() => setConfirmEntry(entry)}
                >
                  <View className="flex-row items-center gap-2">
                    {revertingId === entry.id ? (
                      <Spinner size="small" color="white" />
                    ) : null}
                    <Text className="text-destructive-foreground">
                      {t("settings.importHistory.revert")}
                    </Text>
                  </View>
                </Button>
              ) : null}
            </View>
          ))
        )}

        {status ? (
          <Text
            testID="settings-import-status"
            className="text-sm text-muted-foreground"
          >
            {status}
          </Text>
        ) : null}
      </CardContent>

      <AlertDialog
        open={confirmEntry !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setConfirmEntry(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.importHistory.areYouSure")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {`${t("settings.importHistory.confirmIntro")}\n\n${
                confirmEntry ? formatSummary(confirmEntry.summary, t) : ""
              }\n\n${t("settings.importHistory.confirmWarning")}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel accessibilityLabel={t("common.cancel")}>
              <Text>{t("common.cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="import-revert-confirm"
              accessibilityLabel={t("common.confirm")}
              className="bg-destructive"
              onPress={() => {
                if (confirmEntry) void handleRevert(confirmEntry);
              }}
            >
              <Text className="text-destructive-foreground">
                {t("common.confirm")}
              </Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
