import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ScrollTable } from "@/components/ScrollTable";
import { Badge, Button } from "@/components/ui";
import { ApiError, adminApi, type FinanceImportPreview } from "@/lib/api";

const TEMPLATE = "category,vendor,description,currency,amount,amountEur,recurrence,startsOn,endsOn,gcpInvoice,notes";

// admin.finance rule 5c: paste a table or pick a CSV, check every line (dry run), then create them all.
export function CostImport({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<FinanceImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const failed = (err: unknown) => {
    const code = err instanceof ApiError ? err.code : "generic";
    setError(t(`admin.finance.import.errors.${code}`, { field: err instanceof ApiError ? err.field : "", defaultValue: t("admin.finance.errors.generic") }));
  };
  const check = useMutation({
    mutationFn: () => adminApi.previewFinanceImport(text),
    onMutate: () => setError(null),
    onSuccess: setPreview,
    onError: (err) => {
      setPreview(null);
      failed(err);
    },
  });
  const create = useMutation({
    mutationFn: () => adminApi.importFinanceCosts(text),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "finance"] });
      onDone();
    },
    onError: (err) => {
      failed(err);
      check.mutate();
    },
  });
  const edit = (value: string) => {
    setText(value);
    setPreview(null);
  };
  const ready = preview !== null && preview.invalid === 0 && preview.lines.length > 0;
  return (
    <div className="mb-4 space-y-3 rounded-md border p-3" data-testid="finance-import">
      <p className="text-sm">{t("admin.finance.import.lead")}</p>
      <code className="block overflow-x-auto whitespace-nowrap rounded bg-muted p-2 text-xs" data-testid="finance-import-template">
        {TEMPLATE}
      </code>
      <textarea
        value={text}
        onChange={(e) => edit(e.target.value)}
        rows={6}
        placeholder={t("admin.finance.import.placeholder")}
        className="block w-full rounded-md border border-input bg-card p-2 font-mono text-xs"
        data-testid="finance-import-text"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground">
          {t("admin.finance.import.file")}
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            className="block max-w-full text-xs"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) edit(await file.text());
            }}
            data-testid="finance-import-file"
          />
        </label>
        <Button variant="secondary" disabled={!text.trim() || check.isPending} onClick={() => check.mutate()} data-testid="finance-import-check">
          {t("admin.finance.import.check")}
        </Button>
        <Button disabled={!ready || create.isPending} onClick={() => create.mutate()} data-testid="finance-import-confirm">
          {preview ? t("admin.finance.import.confirm", { count: preview.lines.length }) : t("admin.finance.import.confirmNone")}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t("admin.common.cancel")}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive" data-testid="finance-import-error">{error}</p> : null}
      {preview ? (
        <>
          <p className="text-sm" data-testid="finance-import-summary">
            {t("admin.finance.import.summary", { ok: preview.lines.length - preview.invalid, invalid: preview.invalid })}
          </p>
          <ScrollTable testId="finance-import-preview">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">{t("admin.finance.import.line")}</th>
                <th className="py-2 pr-4">{t("admin.finance.columns.startsOn")}</th>
                <th className="py-2 pr-4">{t("admin.finance.columns.vendor")}</th>
                <th className="py-2 pr-4">{t("admin.finance.columns.recurrence")}</th>
                <th className="py-2 pr-4 text-right">{t("admin.finance.columns.amount")}</th>
                <th className="py-2 pr-4 text-right">{t("admin.finance.columns.amountEur")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map((line) => (
                <tr key={line.line} className="border-t align-top" data-testid={`finance-import-line-${line.line}`}>
                  <td className="py-2 pr-4 tabular-nums">{line.line}</td>
                  {line.ok ? (
                    <>
                      <td className="py-2 pr-4 whitespace-nowrap">{line.cost.startsOn}</td>
                      <td className="py-2 pr-4">
                        <div className="font-medium">{line.cost.vendor}</div>
                        <div className="text-xs text-muted-foreground">
                          {t(`admin.finance.categories.${line.cost.category}`)} · {line.cost.description}
                        </div>
                      </td>
                      <td className="py-2 pr-4">{t(`admin.finance.recurrences.${line.cost.recurrence}`)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {line.cost.amount} {line.cost.currency}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{line.cost.amountEur}</td>
                    </>
                  ) : (
                    <td colSpan={5} className="py-2 pr-4">
                      <Badge tone="destructive">
                        {t(`admin.finance.import.errors.${line.error}`, { field: line.field ?? "", defaultValue: line.error })}
                      </Badge>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        </>
      ) : null}
    </div>
  );
}
