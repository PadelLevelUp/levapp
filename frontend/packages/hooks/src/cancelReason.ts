import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CalendarEvent } from "@levelup/types";
import {
  getClassCancellations,
  previewClassCancellation,
  type CancelReason,
} from "@levelup/api/src/resources/classes";

import { queryKeys } from "./queryKeys";

/** classes.delete rule 9 (PAD-840): the longest cancellation reason. */
export const CANCEL_REASON_MAX = 200;
/** Rule 12: how long after the last change the preview is asked for. */
export const CANCEL_PREVIEW_DELAY_MS = 300;

type Preview = { text: string; recipients: number };

/**
 * classes.delete rule 12 (PAD-840): the cancel dialog's reason, its "send to the students" checkbox and
 * the message preview, the same on web and iOS. It starts over each time the dialog opens. The server
 * renders the preview, debounced and with at most one request in flight; when it cannot answer there
 * is no preview, and the class can still be cancelled.
 */
export function useCancelReason(event: CalendarEvent | null | undefined, open: boolean) {
  const [reason, setReasonState] = useState("");
  const [send, setSend] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const hasReason = reason.trim() !== "";
  const sendReason = hasReason && send;

  useEffect(() => {
    if (!open) return;
    setReasonState("");
    setSend(false);
    setPreview(null);
  }, [open]);

  const setReason = (text: string) => {
    const next = text.slice(0, CANCEL_REASON_MAX);
    // Ticked as soon as a reason is written; the coach may untick it and keep writing.
    if (!hasReason && next.trim() !== "") setSend(true);
    setReasonState(next);
  };

  const wanted = useRef<{ event: CalendarEvent; cancel: CancelReason } | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!open || !event) {
      wanted.current = null;
      return;
    }
    const ask = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      while (wanted.current) {
        const asked = wanted.current;
        let answer: Preview | null = null;
        try {
          answer = await previewClassCancellation(asked.event, asked.cancel);
        } catch {
          // No preview; nothing here stops the cancellation.
        }
        if (wanted.current === asked) {
          wanted.current = null;
          setPreview(answer);
        }
      }
      inFlight.current = false;
    };
    const timer = setTimeout(() => {
      wanted.current = { event, cancel: { reason: reason.trim(), sendReason } };
      void ask();
    }, CANCEL_PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
    // The event's identity changes on every calendar refetch; the class it names does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.model, event?.originalId, event?.date, reason, sendReason]);

  return {
    reason,
    setReason,
    hasReason,
    sendReason,
    setSend,
    preview,
    /** Nobody is enrolled, so nobody would be told. */
    nobody: preview?.recipients === 0,
    /** What the removal sends: nothing at all without a reason (rule 9). */
    cancel: hasReason ? { reason: reason.trim(), sendReason } : undefined,
  };
}

export type CancelReasonState = ReturnType<typeof useCancelReason>;

/** classes.delete rule 14 (PAD-840): the class's kept cancellations, for its own coach. */
export function useClassCancellations(lessonId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.classCancellations(lessonId ?? ""),
    queryFn: () => getClassCancellations(lessonId as string),
    enabled: enabled && !!lessonId,
  });
}
