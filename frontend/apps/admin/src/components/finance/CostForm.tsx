import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button, Input, Select } from "@/components/ui";
import {
  ApiError,
  FINANCE_CATEGORIES,
  FINANCE_RECURRENCES,
  adminApi,
  type FinanceCategory,
  type FinanceCost,
  type FinanceCostInput,
  type FinanceRecurrence,
} from "@/lib/api";

interface Draft {
  category: FinanceCategory;
  vendor: string;
  description: string;
  currency: string;
  amount: string;
  amountEur: string;
  recurrence: FinanceRecurrence;
  startsOn: string;
  endsOn: string;
  gcpInvoice: boolean;
  notes: string;
}

const EMPTY: Draft = {
  category: "ai_tools", vendor: "", description: "", currency: "EUR", amount: "", amountEur: "",
  recurrence: "monthly", startsOn: "", endsOn: "", gcpInvoice: false, notes: "",
};

function fromCost(cost: FinanceCost): Draft {
  return {
    category: cost.category, vendor: cost.vendor, description: cost.description, currency: cost.currency,
    amount: cost.amount, amountEur: cost.amountEur, recurrence: cost.recurrence, startsOn: cost.startsOn,
    endsOn: cost.endsOn ?? "", gcpInvoice: cost.gcpInvoice, notes: cost.notes ?? "",
  };
}

function toInput(d: Draft): FinanceCostInput {
  const euro = d.currency === "EUR";
  return {
    category: d.category, vendor: d.vendor, description: d.description, currency: d.currency.toUpperCase(),
    amount: d.amount, amountEur: euro ? d.amount : d.amountEur, recurrence: d.recurrence, startsOn: d.startsOn,
    endsOn: d.recurrence === "once" ? null : d.endsOn || null,
    gcpInvoice: d.recurrence === "once" && d.category === "infrastructure" ? d.gcpInvoice : false,
    notes: d.notes || null,
  };
}

// admin.finance rules 2 and 5: one form for a new cost and an edit; the server names a bad field.
export function CostForm({ cost, onDone }: { cost?: FinanceCost; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(cost ? fromCost(cost) : EMPTY);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const save = useMutation({
    mutationFn: () => (cost ? adminApi.updateFinanceCost(cost.id, toInput(draft)) : adminApi.createFinanceCost(toInput(draft))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "finance"] });
      onDone();
    },
    onError: (err) => setFailure(err instanceof ApiError ? err : new ApiError(0, "NETWORK")),
  });
  const field = failure?.field;
  const label = (key: string, child: ReactNode) => (
    <label className="block text-xs text-muted-foreground">
      {t(`admin.finance.columns.${key}`)}
      {child}
    </label>
  );
  const errorText = failure
    ? ["INVALID_COST", "GCP_MONTH_IMPORTED"].includes(failure.code)
      ? t(`admin.finance.errors.${failure.code}`, { field: field ?? "" })
      : t("admin.finance.errors.generic")
    : null;
  return (
    <form
      role="dialog"
      aria-label={t(cost ? "admin.finance.costs.edit" : "admin.finance.costs.add")}
      className="mb-4 grid gap-3 rounded-md bg-muted p-3 sm:grid-cols-2"
      data-testid="finance-cost-form"
      onKeyDown={(e) => {
        if (e.key === "Escape") onDone();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        setFailure(null);
        save.mutate();
      }}
    >
      {label("category", (
        <Select className="w-full" value={draft.category} onChange={(e) => set("category", e.target.value as FinanceCategory)} data-testid="finance-cost-category">
          {FINANCE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`admin.finance.categories.${c}`)}</option>)}
        </Select>
      ))}
      {label("recurrence", (
        <Select className="w-full" value={draft.recurrence} onChange={(e) => set("recurrence", e.target.value as FinanceRecurrence)} data-testid="finance-cost-recurrence">
          {FINANCE_RECURRENCES.map((r) => <option key={r} value={r}>{t(`admin.finance.recurrences.${r}`)}</option>)}
        </Select>
      ))}
      {label("vendor", <Input value={draft.vendor} maxLength={80} onChange={(e) => set("vendor", e.target.value)} data-testid="finance-cost-vendor" />)}
      {label("description", <Input value={draft.description} maxLength={200} onChange={(e) => set("description", e.target.value)} data-testid="finance-cost-description" />)}
      {label("currency", <Input value={draft.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} data-testid="finance-cost-currency" />)}
      {label("amount", <Input inputMode="decimal" value={draft.amount} onChange={(e) => set("amount", e.target.value)} data-testid="finance-cost-amount" />)}
      {draft.currency !== "EUR"
        ? label("amountEur", <Input inputMode="decimal" value={draft.amountEur} onChange={(e) => set("amountEur", e.target.value)} data-testid="finance-cost-amount-eur" />)
        : null}
      {label("startsOn", <Input type="date" value={draft.startsOn} onChange={(e) => set("startsOn", e.target.value)} data-testid="finance-cost-starts-on" />)}
      {draft.recurrence !== "once"
        ? label("endsOn", <Input type="date" value={draft.endsOn} onChange={(e) => set("endsOn", e.target.value)} data-testid="finance-cost-ends-on" />)
        : null}
      {draft.recurrence === "once" && draft.category === "infrastructure" ? (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={draft.gcpInvoice} onChange={(e) => set("gcpInvoice", e.target.checked)} data-testid="finance-cost-gcp-invoice" />
          {t("admin.finance.costs.gcpInvoice")}
        </label>
      ) : null}
      <div className="sm:col-span-2">
        {label("notes", <Input value={draft.notes} onChange={(e) => set("notes", e.target.value)} data-testid="finance-cost-notes" />)}
      </div>
      {errorText ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-2" data-testid="finance-cost-error">
          {errorText}
        </p>
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={save.isPending} data-testid="finance-cost-save">
          {t("admin.finance.costs.save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("admin.common.cancel")}
        </Button>
      </div>
    </form>
  );
}
