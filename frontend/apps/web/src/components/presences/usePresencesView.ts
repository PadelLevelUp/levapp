import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  applyLoadedView,
  chooseColumns,
  chooseDefaultPeriod,
  initialPresencesView,
  presencesViewPayload,
  saveFailed,
  saveSucceeded,
  toggleColumn,
  type PresenceColumnKey,
  type PresencePeriodShortcut,
  type PresencesViewState,
} from "@levelup/config";
import { useCoachPresencesView, useSaveCoachPresencesView } from "@levelup/hooks";
import { useToast } from "@/hooks/use-toast";

/**
 * settings.coach-presences-view (PAD-837): the coach's saved Presences view, owned once by the page
 * so the table's columns and the period control's default are one value. Each save sends the whole
 * view (rule 4): a column change carries the default period, "make default" carries the columns.
 */
export function usePresencesView() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const savedView = useCoachPresencesView();
  const saveView = useSaveCoachPresencesView();
  const [state, setState] = useState<PresencesViewState>(initialPresencesView);
  // The latest state for a save that follows a choice in the same tick.
  const latest = useRef(state);
  latest.current = state;

  // Rule 5: the load applies once it answers, field by field, unless the coach already chose; a
  // failed load (no data) leaves the defaults.
  useEffect(() => {
    if (savedView.isSuccess) setState((s) => applyLoadedView(s, savedView.data.presencesView));
  }, [savedView.isSuccess, savedView.data]);

  // Rule 6: a failed save keeps the choice and says so.
  function save(next: PresencesViewState, failTitle: string) {
    latest.current = next;
    setState(next);
    saveView.mutate(presencesViewPayload(next), {
      onSuccess: () => setState((s) => saveSucceeded(s)),
      onError: () => {
        setState((s) => saveFailed(s));
        toast({ title: t(failTitle), description: t("presences.view.notSavedBody"), variant: "destructive" });
      },
    });
  }

  return {
    columns: state.columns,
    defaultPeriod: state.defaultPeriod,
    /** The saved view answered (or failed): the tab now knows the coach's default. */
    settled: savedView.isSuccess || savedView.isError,
    chooseColumn: (key: PresenceColumnKey) =>
      save(chooseColumns(latest.current, toggleColumn(latest.current.columns, key)), "presences.view.notSavedTitle"),
    makeDefault: (period: PresencePeriodShortcut) =>
      save(chooseDefaultPeriod(latest.current, period), "presences.view.defaultNotSavedTitle"),
  };
}
