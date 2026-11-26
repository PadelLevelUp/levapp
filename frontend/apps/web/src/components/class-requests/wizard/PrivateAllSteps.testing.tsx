/**
 * Test harness for classes.class-requests rule 21: the three private steps and the foot drawn at once over one draft,
 * so a test that drives people, dates and time together (criteria 45, 46, 54, 55, 56, rules 13b and 14a) mounts what it
 * did before the split. The wizard's own flow, with one step at a time, is `ClassRequestWizard.steps.test.tsx`.
 */
import { usePrivateRequestDraft } from "@levelup/hooks";
import { PrivateFoot, PrivatePeopleStep, PrivateTimeStep, PrivateWhenStep, usePrivateSend } from "./PrivateSteps";

export function PrivateAllSteps({ coachId, onDone }: { coachId: string; onDone: () => void }) {
  const draft = usePrivateRequestDraft(coachId);
  const send = usePrivateSend(draft, coachId, onDone);
  return (
    <div>
      <PrivatePeopleStep draft={draft} />
      <PrivateWhenStep draft={draft} />
      <PrivateTimeStep draft={draft} coachId={coachId} onChangeWhen={() => undefined} />
      <PrivateFoot step="time" answered={draft.stepAnswered("time")} sending={draft.sending} onContinue={() => undefined} onSend={() => void send()} />
    </div>
  );
}
