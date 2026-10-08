import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { adminApi, ApiError, type CapabilityRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** Capabilities whose switch-off has consequences beyond the app (#585 review): one more confirm. */
const CONFIRM_BEFORE_OFF = new Set(["terms-acceptance"]);

/**
 * admin.clubs-and-switches rules 5–6 (PAD-533): every client capability, on or off, with what
 * switching it off does. Only the owner flips one (decision 2026-10-07); switching off needs a reason.
 */
export function SwitchesPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const owner = session?.role === "owner";
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "capabilities"], queryFn: adminApi.capabilities });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const flip = useMutation({
    mutationFn: (row: CapabilityRow) =>
      adminApi.setCapability(row.capability, !row.off, row.off ? null : (reasons[row.capability] ?? "").trim()),
    onSuccess: () => {
      setProblem(null);
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) =>
      setProblem(err instanceof ApiError && err.code === "REASON_REQUIRED" ? t("admin.switches.reasonRequired") : t("admin.common.error")),
  });

  return (
    <div>
      <PageHeader title={t("admin.switches.title")} lead={t("admin.switches.lead")} />
      {problem ? <p className="mb-3 text-sm text-destructive" data-testid="switches-problem">{problem}</p> : null}
      {list.isLoading ? <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p> : null}
      <div className="space-y-3">
        {(list.data?.items ?? []).map((row) => (
          <Card key={row.capability} data-testid={`switch-${row.capability}`}>
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-sm font-semibold">{row.capability}</code>
              <Badge tone={row.off ? "destructive" : "success"}>{row.off ? t("admin.switches.off") : t("admin.switches.on")}</Badge>
              <Badge tone={row.kind === "feature" ? "primary" : "warning"}>{t(`admin.switches.kind.${row.kind}`)}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t(`admin.switches.effect.${row.capability}`)}</p>
            {row.off && row.reason ? <p className="mt-1 text-sm">{t("admin.switches.reasonShown", { reason: row.reason })}</p> : null}
            {row.changedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">{t("admin.switches.changed", { at: row.changedAt, by: row.changedBy })}</p>
            ) : null}
            {owner ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!row.off ? (
                  <Input
                    data-testid={`switch-reason-${row.capability}`}
                    className="max-w-sm"
                    placeholder={t("admin.switches.reasonPlaceholder")}
                    value={reasons[row.capability] ?? ""}
                    onChange={(e) => setReasons((prev) => ({ ...prev, [row.capability]: e.target.value }))}
                  />
                ) : null}
                <Button
                  variant={row.off ? "primary" : "destructive"}
                  data-testid={`switch-toggle-${row.capability}`}
                  disabled={flip.isPending}
                  onClick={() => {
                    if (!row.off && CONFIRM_BEFORE_OFF.has(row.capability)
                        && !window.confirm(t(`admin.switches.confirmOff.${row.capability}`))) return;
                    flip.mutate(row);
                  }}
                >
                  {row.off ? t("admin.switches.turnOn") : t("admin.switches.turnOff")}
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground" data-testid={`switch-owner-only-${row.capability}`}>{t("admin.switches.ownerOnly")}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
