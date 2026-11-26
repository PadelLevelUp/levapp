/**
 * Test host for classes.class-requests rule 21: mounts ONE real private step (people, when or time; time also
 * draws the foot) over a draft built with the real `usePrivateRequestDraft`. The test drives answers through the
 * draft's setters (handed out by `onDraft`) and may switch `step` between two renders: the hook lives here, so the
 * draft survives the switch. The screen's own flow is `private-class-steps.test.tsx`.
 */
import * as React from "react";
import { usePrivateRequestDraft, type PrivateRequestDraft } from "@levelup/hooks";
import {
  PrivateFoot, PrivatePeopleStep, PrivateTimeStep, PrivateWhenStep, usePrivateSend,
} from "@/features/class-requests/wizard/PrivateSteps";

export type PrivateStepName = "people" | "when" | "time";

export function PrivateStepHost({
  step, coachId, onDraft, onDone,
}: { step: PrivateStepName; coachId: string; onDraft?: (draft: PrivateRequestDraft) => void; onDone: () => void }) {
  const draft = usePrivateRequestDraft(coachId);
  const send = usePrivateSend(draft, coachId, onDone);
  onDraft?.(draft);
  if (step === "people") return <PrivatePeopleStep draft={draft} />;
  if (step === "when") return <PrivateWhenStep draft={draft} />;
  return (
    <>
      <PrivateTimeStep draft={draft} coachId={coachId} onChangeWhen={() => undefined} />
      <PrivateFoot step="time" answered={draft.stepAnswered("time")} sending={draft.sending} onContinue={() => undefined} onSend={() => void send()} />
    </>
  );
}
