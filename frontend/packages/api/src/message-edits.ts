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

/**
 * messaging.messages rule 3 (PAD-639, B-547): what a deleted message keeps in a client's cache —
 * the same as the server's deleted shape: nothing it said. Text, metadata, reactions, actions,
 * the reply link and the automatic/class flags go; id, sender, conversation, timestamp and read
 * state stay so the placeholder sits where the message was. Both shells call it on their own
 * delete and on a `message_deleted` event; before it each only set `isDeleted` and kept the text
 * in memory, where the web reply quote still printed it.
 */
export function eraseDeletedMessage(cached: Message): Message {
  return {
    id: cached.id,
    senderId: cached.senderId,
    conversationId: cached.conversationId,
    content: "",
    timestamp: cached.timestamp,
    isRead: cached.isRead,
    status: cached.status,
    replyTo: null,
    edited: false,
    isDeleted: true,
    isAutomatic: false,
    classDeleted: false,
    reactions: [],
  };
}
