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

/** Rule 13 (phase 2): the longest edited message. */
export const MESSAGE_OVERRIDE_MAX = 1000;

type Preview = { text: string; recipients: number; template?: string };

/**
 * Rule 13: the edited message is a list of plain text and placeholder tokens. A token is only ever removed
 * whole; the text between tokens is what the coach types. Text always starts, ends and separates tokens.
 */
export type MessagePart = { kind: "text"; text: string } | { kind: "token"; name: string };

const TOKEN = /\{(name|level|weekday|time|day|type|date|court|duration|club|class|when|reason)\}/g;

export function splitMessage(message: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let last = 0;
  for (const match of message.matchAll(TOKEN)) {
    parts.push({ kind: "text", text: message.slice(last, match.index) });
    parts.push({ kind: "token", name: match[1] });
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push({ kind: "text", text: message.slice(last) });
  return parts;
}

export function joinMessage(parts: MessagePart[]): string {
  return parts.map((part) => (part.kind === "token" ? `{${part.name}}` : part.text)).join("");
}

/** The token at ``index`` goes whole and the text around it joins. */
export function removeMessageToken(parts: MessagePart[], index: number): MessagePart[] {
  if (parts[index]?.kind !== "token") return parts;
  const before = parts[index - 1] as { kind: "text"; text: string };
  const after = parts[index + 1] as { kind: "text"; text: string };
  return [
    ...parts.slice(0, index - 1),
    { kind: "text", text: before.text + after.text },
    ...parts.slice(index + 2),
  ];
}

export function setMessageText(parts: MessagePart[], index: number, text: string): MessagePart[] {
  if (parts[index]?.kind !== "text") return parts;
  return parts.map((part, i) => (i === index ? { kind: "text", text } : part));
}

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
  // Rule 13: null while the coach has not touched the message; then the template's own parts are shown.
  const [template, setTemplate] = useState<string | null>(null);
  const [edit, setEdit] = useState<MessagePart[] | null>(null);
  const hasReason = reason.trim() !== "";
  const sendReason = hasReason && send;

  useEffect(() => {
    if (!open) return;
    setReasonState("");
    setSend(false);
    setPreview(null);
    setTemplate(null);
    setEdit(null);
  }, [open]);

  const setReason = (text: string) => {
    const next = text.slice(0, CANCEL_REASON_MAX);
    // Ticked as soon as a reason is written; the coach may untick it and keep writing.
    if (!hasReason && next.trim() !== "") setSend(true);
    setReasonState(next);
  };

  const parts = edit ?? (template === null ? null : splitMessage(template));
  const messageOverride = edit !== null && joinMessage(edit) !== template ? joinMessage(edit) : undefined;
  const editMessage = (next: MessagePart[]) => {
    // An emptied editor is the template again, so what is sent is what is shown.
    const text = joinMessage(next);
    if (text.length > MESSAGE_OVERRIDE_MAX) return;
    setEdit(text.trim() === "" ? null : next);
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
          if (typeof answer?.template === "string") setTemplate((current) => current ?? answer!.template!);
        }
      }
      inFlight.current = false;
    };
    const timer = setTimeout(() => {
      wanted.current = {
        event,
        cancel: { reason: reason.trim(), sendReason, ...(messageOverride === undefined ? {} : { messageOverride }) },
      };
      void ask();
    }, CANCEL_PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
    // The event's identity changes on every calendar refetch; the class it names does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.model, event?.originalId, event?.date, reason, sendReason, messageOverride]);

  return {
    reason,
    setReason,
    hasReason,
    sendReason,
    setSend,
    preview,
    /** Nobody is enrolled, so nobody would be told. */
    nobody: preview?.recipients === 0,
    /** Rule 13: the message as editable parts; null until the server has answered with the template. */
    messageParts: parts,
    messageEdited: messageOverride !== undefined,
    editMessage,
    /** "Repor mensagem original": the template's own text again. */
    restoreMessage: () => setEdit(null),
    /** What the removal sends: nothing at all without a reason or an edited message (rules 9, 13). */
    cancel:
      hasReason || messageOverride !== undefined
        ? {
            ...(hasReason ? { reason: reason.trim(), sendReason } : {}),
            ...(messageOverride === undefined ? {} : { messageOverride }),
          }
        : undefined,
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
