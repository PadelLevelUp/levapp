/**
 * Test host for classes.class-requests rule 21: ONE real private step over a draft the test owns. The draft is the real
 * `usePrivateRequestDraft`; the test reads it through `onDraft` and drives its answers with the hook's setters inside
 * `act()`. Only the requested step is drawn (the time step also draws its foot), as the product does. Changing `step`
 * between two renders of the same host keeps the same draft instance.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePrivateRequestDraft, type PrivateRequestDraft, type PrivateStep } from "@levelup/hooks";
import { PrivateFoot, PrivatePeopleStep, PrivateTimeStep, PrivateWhenStep, usePrivateSend } from "@/components/class-requests/wizard/PrivateSteps";

export function PrivateStepHost({
  step,
  coachId,
  onDraft,
  onDone,
}: {
  step: PrivateStep;
  coachId: string;
  onDraft?: (draft: PrivateRequestDraft) => void;
  onDone?: () => void;
}) {
  const draft = usePrivateRequestDraft(coachId);
  const send = usePrivateSend(draft, coachId, onDone ?? (() => undefined));
  onDraft?.(draft);
  if (step === "people") return <PrivatePeopleStep draft={draft} />;
  if (step === "when") return <PrivateWhenStep draft={draft} />;
  return (
    <div>
      <PrivateTimeStep draft={draft} coachId={coachId} onChangeWhen={() => undefined} />
      <PrivateFoot step="time" answered={draft.stepAnswered("time")} sending={draft.sending} onContinue={() => undefined} onSend={() => void send()} />
    </div>
  );
}

/** Mounts the host; `show(step)` switches the drawn step over the same draft, `draft()` is its latest value. */
export function renderPrivateStep(step: PrivateStep, { coachId = "ana-id", onDone }: { coachId?: string; onDone?: () => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  let current: PrivateRequestDraft | null = null;
  const ui = (s: PrivateStep) => (
    <QueryClientProvider client={client}>
      <PrivateStepHost step={s} coachId={coachId} onDraft={(d) => (current = d)} onDone={onDone} />
    </QueryClientProvider>
  );
  const view = render(ui(step));
  return {
    show: (s: PrivateStep) => view.rerender(ui(s)),
    draft: () => current as unknown as PrivateRequestDraft,
  };
}
