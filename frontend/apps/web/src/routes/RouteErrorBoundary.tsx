import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/**
 * client.route-loading rule 9 (PAD-866): above the routes. When a page chunk fails twice within
 * 10 s, `lazyWithReload` rethrows (rule 4); without a boundary React unmounts the whole app to a
 * blank page. This shows a screen whose button reloads, which fetches the current `index.html`.
 */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route failed to render", error, info.componentStack);
  }

  render() {
    return this.state.failed ? <RouteErrorScreen /> : this.props.children;
  }
}

function RouteErrorScreen() {
  const { t } = useTranslation();
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center"
      data-testid="route-error"
      role="alert"
    >
      <h1 className="font-display text-xl font-bold">{t("common.routeError.title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("common.routeError.body")}</p>
      <Button data-testid="route-error-reload" onClick={() => window.location.reload()}>
        {t("common.routeError.reload")}
      </Button>
    </div>
  );
}
