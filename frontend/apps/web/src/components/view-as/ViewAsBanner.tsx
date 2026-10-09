import { Eye, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/auth/AuthContext";
import { endViewAs, isViewingAs } from "@/lib/viewAs";

// admin.approvals-and-users rule 9: the one visible product change the staff console brings.
// It carries no staff action: it says "read-only" and closes the view (discarding the token).
export function ViewAsBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!isViewingAs()) return null;

  const close = () => {
    endViewAs();
    window.close();
    // A tab the script did not open may refuse to close: leave the user's app instead.
    window.location.replace("/auth");
  };

  return (
    <div
      role="status"
      data-testid="view-as-banner"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-warning px-4 py-2 text-sm font-medium text-warning-foreground shadow"
    >
      <Eye className="h-4 w-4" aria-hidden />
      <span>{t("viewAs.banner", { name: user?.name ?? "…" })}</span>
      <button
        type="button"
        onClick={close}
        data-testid="view-as-close"
        className="ml-2 inline-flex items-center gap-1 rounded-md border border-current px-2 py-0.5 text-xs"
      >
        <X className="h-3 w-3" aria-hidden />
        {t("viewAs.close")}
      </button>
    </div>
  );
}
