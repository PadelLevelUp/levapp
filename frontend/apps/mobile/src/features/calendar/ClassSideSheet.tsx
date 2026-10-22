import { Ionicons } from "@expo/vector-icons";
import {
  SIDE_CHOICE_ORDER,
  canSendSide,
  lightTheme,
  openSideWordKeys,
  preselectedSide,
  sideFullOf,
  sideHintKey,
  sideLabelKey,
  sideWordKey,
  type SideFull,
} from "@levelup/config";
import { joinClassWaitingList } from "@levelup/api/src/resources/academyClasses";
import * as classJoinRequestsApi from "@levelup/api/src/resources/classJoinRequests";
import type { ClassJoinRequest, PlayerSide } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";

/**
 * PAD-672 slice 1 (`classes.join-requests` rule 20, `classes.academy-class-booking` rule 6), the
 * phone's half of web's ClassSideChoice: a bottom sheet in a native `Modal` that asks "Em que lado
 * queres jogar nesta aula?" before a join request or a waiting-list join.
 *
 * Pre-selected: the profile side, tagged "Habitual" (Q1; a `both` student is asked too); with no
 * profile side nothing is pre-selected and "Enviar pedido" stays disabled (Q6). The server's
 * `409 side_full` swaps the body for the two-way choice (play both / join that side's list).
 * In a Modal pressed and selected visuals are inline `style`, never pressed-variant classes (memory
 * native-modal-sheet-traps-ios); nothing here opens a picker, so no PortalHost is needed.
 */
interface ClassSideSheetProps {
  open: boolean;
  onClose: () => void;
  mode: "request" | "waiting";
  event: { model: string; originalId: number | string; date?: string | null };
  profileSide?: PlayerSide | null;
  note?: string;
  onRequestSent?: (request: ClassJoinRequest, side: PlayerSide) => void;
  onWaitingListJoined?: (side: PlayerSide) => void;
  onFailed?: (error: unknown, mode: "request" | "waiting") => void;
}

// The waiting-list theme (the owner's PAD-673 mock): the app's warning token, a soft amber fill.
const WAITING_FILL = "#FDF1E1";

export function ClassSideSheet({
  open,
  onClose,
  mode,
  event,
  profileSide,
  note,
  onRequestSent,
  onWaitingListJoined,
  onFailed,
}: ClassSideSheetProps) {
  const { t } = useTranslation();
  const [chosen, setChosen] = React.useState<PlayerSide | null>(preselectedSide(profileSide));
  const [full, setFull] = React.useState<SideFull | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Each opening starts from the profile side again.
  React.useEffect(() => {
    if (open) {
      setChosen(preselectedSide(profileSide));
      setFull(null);
      setBusy(false);
    }
  }, [open, profileSide]);

  const waiting = mode === "waiting";
  const habitual = preselectedSide(profileSide);
  const accent = waiting ? lightTheme.warning : lightTheme.primary;
  const fill = waiting ? WAITING_FILL : lightTheme.secondary;
  const word = (side: PlayerSide) => t(sideWordKey(side));

  const sendRequest = async (side: PlayerSide) => {
    setBusy(true);
    try {
      const request = await classJoinRequestsApi.createClassJoinRequest(event, note, side);
      onRequestSent?.(request, side);
      onClose();
    } catch (err) {
      const refusal = sideFullOf(err);
      if (refusal) setFull(refusal);
      else {
        onFailed?.(err, "request");
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const joinList = async (side: PlayerSide) => {
    setBusy(true);
    try {
      await joinClassWaitingList(event, side);
      onWaitingListJoined?.(side);
      onClose();
    } catch (err) {
      onFailed?.(err, "waiting");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const button = (
    testID: string,
    label: string,
    onPress: () => void,
    kind: "primary" | "outline" | "ghost",
    disabled = false
  ) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 48,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        backgroundColor: kind === "primary" ? lightTheme.primary : "transparent",
        borderWidth: kind === "outline" ? 1 : 0,
        borderColor: lightTheme.border,
      })}
    >
      <Text
        className="font-semibold"
        style={{ fontSize: 15, color: kind === "primary" ? lightTheme.primaryForeground : lightTheme.foreground }}
      >
        {label}
      </Text>
    </Pressable>
  );

  const badge = (label: string, tone: "neutral" | "info" | "warning", testID?: string) => (
    <View
      testID={testID}
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: tone === "neutral" ? lightTheme.muted : tone === "warning" ? WAITING_FILL : lightTheme.secondary,
      }}
    >
      <Text
        className="font-semibold"
        style={{
          fontSize: 11,
          color: tone === "neutral" ? lightTheme.mutedForeground : tone === "warning" ? lightTheme.warning : lightTheme.primary,
        }}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("calendar.sidePick.cancel")}
          onPress={onClose}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(11,21,36,0.45)" }}
        />
        <View
          testID="class-side-sheet"
          className="bg-background"
          style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 }}
        >
          {full ? (
            <>
              <Text testID="class-side-full-title" className="font-bold" style={{ fontSize: 18 }}>
                {t("calendar.sidePick.fullTitle", { requested: word(full.requestedSide) })}
              </Text>
              <Text testID="class-side-full-body" className="text-muted-foreground" style={{ fontSize: 14 }}>
                {t("calendar.sidePick.fullBody", {
                  open: openSideWordKeys(full)
                    .map((k) => t(k))
                    .join(t("calendar.sidePick.fullOpenJoiner")),
                  requested: word(full.requestedSide),
                })}
              </Text>
              {button("class-side-play-both", t("calendar.sidePick.playBoth"), () => void sendRequest("both"), "primary", busy)}
              {button(
                "class-side-stay-waiting",
                t("calendar.sidePick.stayWaiting", { requested: word(full.requestedSide) }),
                () => void joinList(full.requestedSide),
                "outline",
                busy
              )}
            </>
          ) : (
            <>
              <Text className="font-bold" style={{ fontSize: 18 }}>
                {t("calendar.sidePick.title")}
              </Text>
              <Text className="text-muted-foreground" style={{ fontSize: 13 }}>
                {t(waiting ? "calendar.sidePick.waitingSub" : "calendar.sidePick.sub")}
              </Text>
              <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
                {SIDE_CHOICE_ORDER.map((side) => {
                  const selected = chosen === side;
                  return (
                    <Pressable
                      key={side}
                      testID={`class-side-${side}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => setChosen(side)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: selected ? 1.5 : 1,
                        borderColor: selected ? accent : lightTheme.border,
                        backgroundColor: selected ? fill : lightTheme.card,
                      }}
                    >
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: selected ? accent : lightTheme.border,
                          backgroundColor: selected ? accent : "transparent",
                        }}
                      >
                        {selected ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <Text className="font-semibold" style={{ fontSize: 15 }}>
                            {t(sideLabelKey(side))}
                          </Text>
                          {habitual === side ? badge(t("calendar.sidePick.usual"), "neutral", `class-side-usual-${side}`) : null}
                          {side === "both" ? badge(t("calendar.sidePick.moreChances"), waiting ? "warning" : "info") : null}
                        </View>
                        <Text className="text-muted-foreground" style={{ fontSize: 12 }}>
                          {t(sideHintKey(side, mode))}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                {button("class-side-cancel", t("calendar.sidePick.cancel"), onClose, "ghost")}
                {button(
                  "class-side-send",
                  t(waiting ? "classRequests.academy.joinWaitlist" : "calendar.sidePick.send"),
                  () => chosen && void (waiting ? joinList(chosen) : sendRequest(chosen)),
                  "primary",
                  busy || !canSendSide(chosen)
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
