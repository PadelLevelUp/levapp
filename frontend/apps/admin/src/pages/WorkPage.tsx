/**
 * admin.work-dashboard (PAD-555): what is left to do, what was done and what shipped, from Linear and
 * GitHub through the backend (the tokens never reach the browser). Read-only. Each source shows its
 * own state (rule 1); the page asks the server to refresh only when told (rule 7).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { adminApi, type WorkAnswer, type WorkDeploy, type WorkSource } from "@/lib/api";

const WORK_KEY = ["admin", "work"] as const;

function useWhen() {
  const { i18n } = useTranslation();
  return (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(i18n.language) : "—");
}

function ExternalLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  );
}

/** Rule 1: a source that is not configured or unreachable says so, in place of its sections. */
function SourceState<T>({ name, source, children }: { name: "linear" | "github"; source: WorkSource<T>; children: (ok: T) => ReactNode }) {
  const { t } = useTranslation();
  const when = useWhen();
  if (source.status === "ok") return <>{children(source as unknown as T)}</>;
  return (
    <Card data-testid={`admin-work-${name}-status`}>
      <h2 className="mb-1 font-semibold">{t(`admin.work.${name}`)}</h2>
      {source.status === "not_configured" ? (
        <p className="text-sm text-muted-foreground">{t("admin.work.notConfigured", { setting: source.missing })}</p>
      ) : (
        <p className="text-sm text-destructive">
          {t("admin.work.unavailable")} {source.lastOkAt ? t("admin.work.lastOk", { when: when(source.lastOkAt) }) : null}
        </p>
      )}
    </Card>
  );
}

function Section({ title, testId, empty, children }: { title: string; testId: string; empty: string | null; children?: ReactNode }) {
  return (
    <Card data-testid={testId}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {empty ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className="flex flex-col gap-3">{children}</ul>}
    </Card>
  );
}

function Tickets({ linear }: { linear: Extract<WorkAnswer["linear"], { status: "ok" }> }) {
  const { t } = useTranslation();
  const when = useWhen();
  return (
    <>
      <Section title={t("admin.work.open.title")} testId="admin-work-open" empty={linear.open.length ? null : t("admin.work.open.empty")}>
        {linear.open.map((ticket) => (
          <li key={ticket.id} data-testid={`admin-work-ticket-${ticket.id}`} className="min-w-0 border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <ExternalLink href={ticket.url}><span className="font-mono text-xs">{ticket.id}</span></ExternalLink>
              <span className="font-medium break-words">{ticket.title}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground break-words">{ticket.summary || t("admin.work.open.noSummary")}</p>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              {ticket.state ? <Badge>{ticket.state}</Badge> : null}
              <Badge tone={ticket.priority === 1 ? "destructive" : ticket.priority === 2 ? "warning" : "muted"}>
                {t(`admin.work.priority.${ticket.priority}`, { defaultValue: String(ticket.priority) })}
              </Badge>
              <span className="text-muted-foreground">{ticket.assignee ?? t("admin.work.open.unassigned")}</span>
            </div>
          </li>
        ))}
      </Section>
      <Section title={t("admin.work.done.title")} testId="admin-work-done" empty={linear.done.length ? null : t("admin.work.done.empty")}>
        {linear.done.map((ticket) => (
          <li key={ticket.id} className="flex min-w-0 flex-wrap items-baseline gap-2 text-sm">
            <ExternalLink href={ticket.url}><span className="font-mono text-xs">{ticket.id}</span></ExternalLink>
            <span className="break-words">{ticket.title}</span>
            <span className="text-xs text-muted-foreground">{when(ticket.completedAt)}</span>
          </li>
        ))}
      </Section>
    </>
  );
}

function Deploys({ label, runs, testId }: { label: string; runs: WorkDeploy[]; testId: string }) {
  const { t } = useTranslation();
  const when = useWhen();
  return (
    <div data-testid={testId} className="min-w-0">
      <h3 className="mb-2 text-sm font-medium">{label}</h3>
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("admin.work.deploys.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {runs.map((run, i) => (
            <li key={`${run.sha}-${i}`} className="flex flex-wrap items-center gap-2">
              <Badge tone={run.conclusion === "success" ? "success" : run.conclusion ? "destructive" : "warning"}>
                {t(`admin.work.deploys.${run.conclusion === "success" ? "success" : run.conclusion ? "failure" : "running"}`)}
              </Badge>
              <ExternalLink href={run.url}><span className="font-mono text-xs">{run.sha}</span></ExternalLink>
              <span className="text-xs text-muted-foreground">{when(run.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GitHub({ github }: { github: Extract<WorkAnswer["github"], { status: "ok" }> }) {
  const { t } = useTranslation();
  const when = useWhen();
  return (
    <>
      <Section title={t("admin.work.merged.title")} testId="admin-work-merged" empty={github.merged.length ? null : t("admin.work.merged.empty")}>
        {github.merged.map((pr) => (
          <li key={pr.number} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <span data-testid={`admin-work-merged-${pr.number}-where`}>
              <Badge tone={pr.where === "production" ? "success" : "primary"}>{t(`admin.work.merged.${pr.where}`)}</Badge>
            </span>
            <ExternalLink href={pr.url}>#{pr.number}</ExternalLink>
            <span className="break-words">{pr.title}</span>
            <span className="text-xs text-muted-foreground">{when(pr.mergedAt)}</span>
          </li>
        ))}
      </Section>
      <Section title={t("admin.work.openPrs.title")} testId="admin-work-open-prs" empty={github.open.length ? null : t("admin.work.openPrs.empty")}>
        {github.open.map((pr) => (
          <li key={pr.number} data-testid={`admin-work-open-${pr.number}`} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <Badge tone={pr.checks === "success" ? "success" : pr.checks === "failure" ? "destructive" : pr.checks === "pending" ? "warning" : "muted"}>
              {t(`admin.work.openPrs.checks.${pr.checks ?? "unknown"}`)}
            </Badge>
            {pr.draft ? <Badge>{t("admin.work.openPrs.draft")}</Badge> : null}
            <ExternalLink href={pr.url}>#{pr.number}</ExternalLink>
            <span className="break-words">{pr.title}</span>
          </li>
        ))}
      </Section>
      <Card data-testid="admin-work-deploys">
        <h2 className="mb-3 font-semibold">{t("admin.work.deploys.title")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Deploys label={t("admin.work.deploys.staging")} runs={github.deploys.staging} testId="admin-work-deploys-staging" />
          <Deploys label={t("admin.work.deploys.production")} runs={github.deploys.production} testId="admin-work-deploys-production" />
        </div>
      </Card>
    </>
  );
}

export function WorkPage() {
  const { t } = useTranslation();
  const when = useWhen();
  const queryClient = useQueryClient();
  // Rule 7: the server caches for 5 minutes; the page never polls.
  const query = useQuery({
    queryKey: WORK_KEY,
    queryFn: () => adminApi.work(),
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
  const refresh = async () => {
    const fresh = await adminApi.work(true);
    queryClient.setQueryData(WORK_KEY, fresh);
  };
  return (
    <div>
      <PageHeader title={t("admin.work.title")} lead={t("admin.work.lead")} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => void refresh()} disabled={query.isFetching} data-testid="admin-work-refresh">
          {t("admin.work.refresh")}
        </Button>
        {query.data ? <span className="text-xs text-muted-foreground">{t("admin.work.fetchedAt", { when: when(query.data.fetchedAt) })}</span> : null}
      </div>
      {query.isLoading ? <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p> : null}
      {query.isError ? <p className="text-sm text-destructive">{t("admin.common.error")}</p> : null}
      {query.data ? (
        <div className="flex flex-col gap-4">
          <SourceState name="linear" source={query.data.linear}>
            {(linear) => <Tickets linear={linear as Extract<WorkAnswer["linear"], { status: "ok" }>} />}
          </SourceState>
          <SourceState name="github" source={query.data.github}>
            {(github) => <GitHub github={github as Extract<WorkAnswer["github"], { status: "ok" }>} />}
          </SourceState>
        </div>
      ) : null}
    </div>
  );
}
