import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import {
  PARTICIPANT_GROUP_DOT,
  PARTICIPANT_GROUP_TITLE_KEYS,
  groupParticipants,
  participantInitials,
  sideLongKeyOf,
  sideShortKeyOf,
  type ParticipantRowModel,
} from "@levelup/config";
import type { CoachPlayer, Player, Presence } from "@levelup/types";
import { Text } from "@/components/ui/text";

/**
 * PAD-659 (`calendar.event-detail` rule 22), the phone's half: the coach's participant list in
 * three groups (Vão, Por responder, Não vão), each ordered by side then name. The grouping and
 * the order are `@levelup/config`'s; this file only draws them. No level and no state word on a
 * row: the group title says the state, and the level lives in the pop-up (rule 23).
 * A testID cannot repeat per group on the phone, so the containers are `participant-group-<key>`.
 */

export type ParticipantGroupRow = ParticipantRowModel<Player, Presence, CoachPlayer>;

interface ParticipantGroupsProps {
  participants: Player[];
  presences: Presence[] | undefined;
  roster: CoachPlayer[] | undefined;
  onOpen: (row: ParticipantGroupRow) => void;
}

export function ParticipantGroups({ participants, presences, roster, onOpen }: ParticipantGroupsProps) {
  const { t } = useTranslation();
  const groups = groupParticipants({ participants, presences, roster });

  return (
    <View className="gap-3">
      {groups.map((group) => (
        <View key={group.key} testID={`participant-group-${group.key}`} className="gap-1.5">
          <View className="flex-row items-center gap-2 px-1" style={{ minHeight: 18 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PARTICIPANT_GROUP_DOT[group.key] }} />
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {t(PARTICIPANT_GROUP_TITLE_KEYS[group.key], { count: group.rows.length })}
            </Text>
          </View>
          <View className="overflow-hidden rounded-xl border border-border bg-card">
            {group.rows.map((row, index) => (
              <View
                key={row.playerId}
                testID={`participant-row-${row.playerId}`}
                className="flex-row items-center gap-2.5 px-3"
                style={{
                  minHeight: 44,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: "rgba(133,146,168,0.25)",
                }}
              >
                <Pressable
                  testID={`participant-open-${row.playerId}`}
                  accessibilityRole="button"
                  accessibilityLabel={t("calendar.participants.openProfile", { name: row.name })}
                  onPress={() => onOpen(row)}
                  className="flex-1 flex-row items-center gap-2.5"
                  style={({ pressed }) => ({ minHeight: 44, opacity: pressed ? 0.6 : 1 })}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: "#E8F1FF",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text className="font-bold" style={{ fontSize: 10, color: "#1355DC" }}>{participantInitials(row.name)}</Text>
                  </View>
                  <Text className="flex-1 text-sm font-semibold" numberOfLines={1}>
                    {row.name}
                  </Text>
                </Pressable>
                {row.side ? (
                  <View
                    testID="participant-side"
                    // PAD-551: the side in this occurrence, and whether the coach set it here.
                    accessibilityValue={{ text: `${row.side}${row.presence?.sideOverride ? " override" : ""}` }}
                    accessible
                    accessibilityLabel={t(sideLongKeyOf(row.side, row.assignedSide))}
                    className="items-center justify-center rounded-md bg-muted"
                    style={{ height: 22, minWidth: 38, paddingHorizontal: 6 }}
                  >
                    <Text className="text-[11px] font-semibold text-muted-foreground">{t(sideShortKeyOf(row.side, row.assignedSide))}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
