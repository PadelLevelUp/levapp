def serialize_message(message, last_read_at):
    return {
        "id": message.id,
        "senderId": message.sender_id,
        "content": message.text,
        "timestamp": message.sent_at.isoformat(),
        "conversationId": message.conversation_id,
        "isRead": (
            last_read_at
            and message.sent_at <= last_read_at
        ),
    }