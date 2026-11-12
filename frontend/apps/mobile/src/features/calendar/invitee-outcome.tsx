/**
 * PAD-548 / PAD-920 (calendar.event-detail rules 16–17, ND1–ND3): the outcome column of an invitee
 * row on the class screen, and the open-spots line above the list. Labels, tones, notes, the tier
 * text and the pending count all come from the shared `invitation-outcome` helpers, never per shell.
 */
import {
  INVITATION_OUTCOME_KEY,
  INVITATION_OUTCOME_TONE,
  inviteeNotes,
  inviteeTierText,
  pendingInviteCount,
} from "@levelup/config";
import type { ClassInvitation } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";

// The Badge has no "muted" variant; the quiet outcomes (withdrawn, expired, …) read as secondary.
export const inviteeBadgeVariant = (outcome: ClassInvitation["outcome"]) => {
  const tone = INVITATION_OUTCOME_TONE[outcome];
  return tone === "muted" ? "secondary" : tone;
};

/** One outcome word, decided by the server, its notes, and (new engine) where the invitation came from. */
export function InviteeOutcome({ inv }: { inv: ClassInvitation }) {
  const { t } = useTranslation();
  // PAD-920 (ND1): null for an old-engine row, so it renders exactly as before.
  const tier = inviteeTierText(inv);
  return (
    <View className="items-end">
      <Badge variant={inviteeBadgeVariant(inv.outcome)}>
        <Text testID={`invitee-outcome-${inv.playerId}-${inv.outcome}`}>
          {t(INVITATION_OUTCOME_KEY[inv.outcome])}
        </Text>
      </Badge>
      {inviteeNotes(inv).map((note) => (
        <Text
          key={note.id}
          testID={`invitee-${note.id}-${inv.playerId}`}
          className="text-[10px] text-muted-foreground"
        >
          {t(note.key)}
        </Text>
      ))}
      {tier ? (
        <Text testID={`invitee-tier-${inv.playerId}`} className="text-[10px] text-muted-foreground">
          {t(tier.key, tier.params)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * PAD-920 (ND2): the open spots and, beside them, "N pending" — counting invitations only
 * (`pendingInviteCount`, never `not_counting`). Shown to the coach whenever spots are open, as web's
 * line is: iOS gains the line it lacked (ND2), for every session.
 */
export function OpenSpotsLine({
  openSpots,
  invitations,
}: {
  openSpots: number;
  invitations: ClassInvitation[];
}) {
  const { t } = useTranslation();
  if (openSpots <= 0) return null;
  const pending = pendingInviteCount(invitations);
  return (
    <Text testID="class-open-spots" className="text-xs text-muted-foreground">
      {pending > 0
        ? t("calendar.detail.openSpotsPending", { count: openSpots, pending })
        : t("calendar.detail.openSpots", { count: openSpots })}
    </Text>
  );
}
