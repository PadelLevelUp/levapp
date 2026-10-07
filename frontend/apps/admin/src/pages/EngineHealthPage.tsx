import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { adminApi, type DeployIdentity, type EngineHealth, type IncidentKind } from "@/lib/api";

const KINDS: IncidentKind[] = ["email_failed", "push_failed", "reminder_skipped_past_due"];

function Stat({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return (
    <div className="min-w-28">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold" data-testid={testId}>{value}</p>
    </div>
  );
}

function useAge() {
  const { t } = useTranslation();
  return (seconds: number | null) => {
    if (seconds == null) return "—";
    if (seconds < 3600) return t("admin.engineHealth.minutes", { n: Math.floor(seconds / 60) });
    if (seconds < 86400) return t("admin.engineHealth.hours", { n: Math.floor(seconds / 3600) });
    return t("admin.engineHealth.days", { n: Math.floor(seconds / 86400) });
  };
}

function Identity({ id, testId }: { id: DeployIdentity | string; testId: string }) {
  const { t } = useTranslation();
  if (typeof id === "string") {
    const notConfigured = id.includes("not configured");
    return <Badge tone={notConfigured ? "muted" : "warning"}>{t(`admin.engineHealth.deploy.${notConfigured ? "notConfigured" : "unreachable"}`)}</Badge>;
  }
  return (
    <dl className="text-sm" data-testid={testId}>
      <dt className="text-xs text-muted-foreground">{t("admin.engineHealth.deploy.sha")}</dt>
      <dd className="font-mono">{id.gitSha.slice(0, 12)}</dd>
      <dt className="mt-1 text-xs text-muted-foreground">{t("admin.engineHealth.deploy.head")}</dt>
      <dd className="font-mono">{id.alembicHead ?? "—"}</dd>
    </dl>
  );
}

function Summary({ data }: { data: EngineHealth }) {
  const { t, i18n } = useTranslation();
  const age = useAge();
  const sched = data.scheduler;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card data-testid="admin-eh-vacancies">
        <h2 className="mb-3 font-semibold">{t("admin.engineHealth.vacancies.title")}</h2>
        <div className="flex flex-wrap gap-6">
          <Stat label={t("admin.engineHealth.vacancies.open")} value={data.vacancies.open} testId="admin-eh-vacancies-open" />
          <Stat label={t("admin.engineHealth.vacancies.pending")} value={data.vacancies.pendingApproval} />
          <Stat label={t("admin.engineHealth.vacancies.oldest")} value={age(data.vacancies.oldestOpenAgeSeconds)} />
        </div>
        <ul className="mt-3 text-sm">
          {data.vacancies.byRoundAndBatch.map((r) => (
            <li key={`${r.round}-${r.batch}`}>
              {t("admin.engineHealth.vacancies.round", { round: r.round, batch: r.batch })}: <strong>{r.count}</strong>
            </li>
          ))}
        </ul>
      </Card>
      <Card data-testid="admin-eh-invitations">
        <h2 className="mb-3 font-semibold">{t("admin.engineHealth.invitations.title")}</h2>
        <Stat label={t("admin.engineHealth.invitations.live")} value={data.invitations.live} testId="admin-eh-invitations-live" />
        <ul className="mt-3 text-sm">
          {data.invitations.byRound.map((r) => (
            <li key={String(r.round)}>
              {r.round === 0 ? t("admin.engineHealth.invitations.waitingList") : t("admin.engineHealth.invitations.round", { round: r.round ?? "—" })}: <strong>{r.count}</strong>
            </li>
          ))}
        </ul>
      </Card>
      <Card data-testid="admin-eh-scheduler">
        <h2 className="mb-3 font-semibold">{t("admin.engineHealth.scheduler.title")}</h2>
        {!sched.available ? (
          <p className="text-sm text-muted-foreground">{t("admin.engineHealth.scheduler.unavailable")}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-6">
              <Stat label={t("admin.engineHealth.scheduler.total")} value={sched.total} />
              <Stat label={t("admin.engineHealth.scheduler.overdue")} value={sched.overdue} testId="admin-eh-scheduler-overdue" />
            </div>
            <ul className="mt-3 text-sm">
              {Object.entries(sched.singletons).map(([name, present]) => (
                <li key={name} className="flex items-center gap-2">
                  <code className="text-xs">{name}</code>
                  <Badge tone={present ? "success" : "destructive"}>{t(`admin.engineHealth.scheduler.${present ? "present" : "missing"}`)}</Badge>
                </li>
              ))}
              {Object.entries(sched.byFamily).map(([family, n]) => (
                <li key={family}><code className="text-xs">{family}</code>: <strong>{n}</strong></li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card data-testid="admin-eh-accounts">
        <h2 className="mb-3 font-semibold">{t("admin.engineHealth.accounts.title")}</h2>
        <div className="flex flex-wrap gap-6">
          <Stat label={t("admin.engineHealth.accounts.users")} value={Object.values(data.accounts.users).reduce((a, b) => a + b, 0)} />
          <Stat label={t("admin.engineHealth.accounts.coaches")} value={Object.values(data.accounts.coaches).reduce((a, b) => a + b, 0)} />
          <Stat label={t("admin.engineHealth.accounts.players")} value={data.accounts.players} />
          <Stat label={t("admin.engineHealth.accounts.new7d")} value={data.accounts.createdLast7d} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {Object.entries(data.accounts.coaches).map(([k, n]) => `${k} ${n}`).join(" · ")}
        </p>
      </Card>
      <Card className="md:col-span-2" data-testid="admin-eh-incidents">
        <h2 className="mb-3 font-semibold">{t("admin.engineHealth.incidents.title")}</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="py-1 pr-4" /><th className="py-1 pr-4">{t("admin.engineHealth.incidents.last24h")}</th><th className="py-1">{t("admin.engineHealth.incidents.last7d")}</th></tr>
          </thead>
          <tbody>
            {KINDS.map((k) => (
              <tr key={k} className="border-t">
                <td className="py-1 pr-4">{t(`admin.engineHealth.incidents.kind.${k}`)}</td>
                <td className="py-1 pr-4" data-testid={`admin-eh-incidents-24h-${k}`}>{data.incidents.last24h[k]}</td>
                <td className="py-1">{data.incidents.last7d[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="mt-4 text-xs font-medium text-muted-foreground">{t("admin.engineHealth.incidents.recent")}</h3>
        {data.incidents.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.engineHealth.incidents.none")}</p>
        ) : (
          <ul className="mt-1 text-xs">
            {data.incidents.recent.map((r) => (
              <li key={r.id} className="border-t py-1 font-mono">
                {new Date(r.createdAt).toLocaleString(i18n.language)} · {r.kind} · {r.channel}
                {r.subjectType ? ` · ${r.subjectType} ${r.subjectId ?? ""}` : ""}
                {r.errorClass ? ` · ${r.errorClass}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="md:col-span-2" data-testid="admin-eh-deploy">
        <h2 className="mb-3 font-semibold">{t("admin.engineHealth.deploy.title")}</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div><p className="mb-1 text-xs font-medium">{t("admin.engineHealth.deploy.this")}</p><Identity id={data.deploy.this} testId="admin-eh-deploy-this" /></div>
          <div><p className="mb-1 text-xs font-medium">{t("admin.engineHealth.deploy.other")}</p><Identity id={data.deploy.other} testId="admin-eh-deploy-other" /></div>
        </div>
      </Card>
    </div>
  );
}

function CoachView() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [coachId, setCoachId] = useState<number | null>(null);
  const list = useQuery({ queryKey: ["admin", "engine-health", "coaches", q], queryFn: () => adminApi.engineHealthCoaches(q), enabled: q.length >= 2 });
  const detail = useQuery({ queryKey: ["admin", "engine-health", "coach", coachId], queryFn: () => adminApi.engineHealthCoach(coachId as number), enabled: coachId != null });
  return (
    <Card className="mt-6" data-testid="admin-eh-coaches">
      <h2 className="mb-3 font-semibold">{t("admin.engineHealth.coaches.title")}</h2>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQ(draft.trim()); setCoachId(null); }}>
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("admin.engineHealth.coaches.search")} data-testid="admin-eh-coach-search" className="w-72" />
        <Button type="submit" variant="secondary">{t("admin.engineHealth.coaches.search")}</Button>
      </form>
      {list.data && list.data.coaches.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("admin.engineHealth.coaches.none")}</p> : null}
      <ul className="mt-2 text-sm">
        {list.data?.coaches.map((c) => (
          <li key={c.coachId}>
            <button type="button" className="underline" onClick={() => setCoachId(c.coachId)} data-testid={`admin-eh-coach-${c.coachId}`}>{c.name}</button>
          </li>
        ))}
      </ul>
      {detail.data ? (
        <div className="mt-4 text-sm" data-testid="admin-eh-coach-detail">
          <div className="flex flex-wrap gap-6">
            <Stat label={t("admin.engineHealth.coaches.openVacancies")} value={detail.data.openVacancies} />
            <Stat label={t("admin.engineHealth.coaches.liveInvitations")} value={detail.data.liveInvitations} />
            <Stat label={t("admin.engineHealth.coaches.jobs")} value={detail.data.scheduledJobs.length} />
          </div>
          <p className="mt-3 text-xs font-medium text-muted-foreground">{t("admin.engineHealth.coaches.settings")}</p>
          <code className="block whitespace-pre-wrap break-words text-xs">{JSON.stringify(detail.data.settings, null, 2)}</code>
        </div>
      ) : null}
    </Card>
  );
}

export function EngineHealthPage() {
  const { t, i18n } = useTranslation();
  // Rule 7: refreshed only on demand, never polled.
  const query = useQuery({
    queryKey: ["admin", "engine-health"],
    queryFn: adminApi.engineHealth,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
  return (
    <div>
      <PageHeader title={t("admin.engineHealth.title")} lead={t("admin.engineHealth.lead")} />
      <div className="mb-4 flex items-center gap-3">
        <Button onClick={() => void query.refetch()} disabled={query.isFetching} data-testid="admin-eh-refresh">{t("admin.engineHealth.refresh")}</Button>
        {query.data ? <span className="text-xs text-muted-foreground">{t("admin.engineHealth.computedAt", { when: new Date(query.data.computedAt).toLocaleString(i18n.language) })}</span> : null}
      </div>
      {query.isLoading ? <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p> : null}
      {query.isError ? <p className="text-sm text-destructive">{t("admin.common.error")}</p> : null}
      {query.data ? <Summary data={query.data} /> : null}
      <CoachView />
    </div>
  );
}
