import type { Message } from "@levelup/types";

/**
 * messaging.sse-realtime rule 18 (PAD-563, ledger B-402): what a `message_edited` payload may
 * change on the message already in an open conversation — the text, the edited flag AS SENT (a
 * metadata-only edit is not "edited"), and the metadata (a retired or withdrawn invitation, a
 * superseded reminder, an answer the coach recorded). Never `isRead` or `status`: the payload is
 * serialised without a viewer and does not know them. One function for both shells: before it,
 * each merged only `content` and forced `edited: true`, so no bubble changed live until a refetch.
 */
export function mergeEditedMessage(cached: Message, edited: Message): Message {
  return {
    ...cached,
    content: edited.content,
    edited: edited.edited ?? cached.edited,
    metadata: edited.metadata ?? cached.metadata,
  };
}
