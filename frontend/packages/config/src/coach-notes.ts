/**
 * players.notes rule 3 (PAD-889): a coach's strength or weakness note holds at most this many
 * characters, the server's column length (`coach_player_notes.text`, String(500)). Web and iOS cap
 * their note fields with it.
 */
export const COACH_NOTE_MAX_LENGTH = 500;
