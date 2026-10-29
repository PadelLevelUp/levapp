import * as React from "react";
import { useTranslation } from "react-i18next";

import { toast } from "@/components/ui/toast";
import { runRefresh } from "@/lib/pull-refresh";

/**
 * PAD-786 (client.pull-to-refresh): the state behind a list's `RefreshControl`.
 *
 * `refreshing` is this hook's own state, never a query's `isRefetching`: it turns on with the
 * pull and off when `runRefresh` settles, so it cannot be left on by a fetch that never ends
 * (rule 3), and a background refetch (SSE, foreground) never shows the pull spinner. A second
 * pull while one is running is ignored. A refresh that fails or runs past the bound says so with
 * a toast, and the list keeps what it was showing (rule 4).
 */
export function usePullToRefresh(refresh: () => Promise<unknown>): {
  refreshing: boolean;
  onRefresh: () => void;
} {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = React.useState(false);
  const running = React.useRef(false);
  const mounted = React.useRef(true);
  const latest = React.useRef(refresh);
  latest.current = refresh;

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onRefresh = React.useCallback(() => {
    if (running.current) return;
    running.current = true;
    setRefreshing(true);
    void runRefresh(() => latest.current()).then((outcome) => {
      running.current = false;
      if (!mounted.current) return;
      setRefreshing(false);
      if (outcome !== "ok") {
        toast.error(t("common.refreshFailed"), t("common.refreshFailedBody"));
      }
    });
  }, [t]);

  return { refreshing, onRefresh };
}
