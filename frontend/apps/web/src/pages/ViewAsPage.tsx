import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { startViewAs, tokenFromFragment } from "@/lib/viewAs";

// admin.approvals-and-users rule 9: the entry point the staff console opens in a new tab.
// The token arrives in the fragment (never sent to a server, never in a log), is kept for this
// tab, the fragment is wiped from history, and the app reloads at its home page as that user.
export default function ViewAsPage() {
  const { t } = useTranslation();
  const token = tokenFromFragment(window.location.hash);

  useEffect(() => {
    if (!token) return;
    startViewAs(token);
    window.history.replaceState(null, "", "/view-as");
    window.location.replace("/");
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground" data-testid="view-as-entry">
      {token ? t("viewAs.opening") : t("viewAs.invalid")}
    </div>
  );
}
