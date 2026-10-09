import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge, Card, PageHeader } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function SettingsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const operator = can("operator");
  const qc = useQueryClient();
  const [failed, setFailed] = useState(false);
  const setting = useQuery({ queryKey: ["admin", "settings", "coach-approval"], queryFn: adminApi.coachApprovalSetting });
  const save = useMutation({
    mutationFn: (value: boolean) => adminApi.setCoachApprovalSetting(value),
    onSuccess: (data) => {
      setFailed(false);
      qc.setQueryData(["admin", "settings", "coach-approval"], data);
    },
    onError: () => setFailed(true),
  });
  const on = setting.data?.coachApprovalRequired ?? false;

  return (
    <div>
      <PageHeader title={t("admin.settings.title")} lead={t("admin.settings.lead")} />
      <Card>
        <h2 className="mb-3 text-sm font-semibold">{t("admin.settings.approvalTitle")}</h2>
        {setting.isLoading ? <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p> : null}
        {setting.isError ? <p className="text-sm text-destructive">{t("admin.common.error")}</p> : null}
        {setting.data ? (
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                role="switch"
                checked={on}
                disabled={!operator || save.isPending}
                onChange={(e) => save.mutate(e.target.checked)}
                className="h-5 w-5"
                data-testid="admin-approval-switch"
              />
              {t("admin.settings.approvalLabel")}
            </label>
            <p className="text-sm" data-testid="admin-approval-state">
              {t(on ? "admin.settings.approvalOn" : "admin.settings.approvalOff")}
            </p>
            <p className="text-xs text-muted-foreground">
              <Badge>{t(`admin.settings.source.${setting.data.source}`)}</Badge>
            </p>
            <p className="text-xs text-muted-foreground">{t("admin.settings.note")}</p>
            {failed ? (
              <p className="text-sm text-destructive" role="alert" data-testid="admin-settings-error">
                {t("admin.settings.error")}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
