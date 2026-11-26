import * as React from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LevAppMark } from "@/components/brand/LevAppMark";
import { Text } from "@/components/ui/text";
import { keyboardAvoidingBehavior } from "@/lib/keyboard-avoiding";

/**
 * The pre-auth screens' navy shell and the invite screens' band, kept apart from the account forms so the join
 * screen can use them without the forms' country and terms pickers.
 */

export function PreAuthShell({
  children,
  testID,
}: {
  children: React.ReactNode;
  testID: string;
}) {
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-sidebar"
      behavior={keyboardAvoidingBehavior()}
    >
      <StatusBar style="light" />
      <ScrollView
        testID={testID}
        contentContainerClassName="flex-grow justify-center p-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="mb-8 items-center">
          <LevAppMark size={40} />
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * auth.invite-welcome (UI idea 8): the navy band of the join and invitation screens. Already on navy, so the state's
 * title (a level-3 heading, as the card's title was) and description stand outside the card, above it; on the join
 * screen the coach's name in the display face and the club's name come first. Only the three invite screens ask for it.
 */
export function WelcomeBand({
  title,
  description,
  names,
}: {
  title: string;
  description?: string;
  names?: { coach: string; club: string };
}) {
  return (
    <View testID="invite-band" className="mb-5 items-center gap-2 px-2">
      {names ? (
        <View className="items-center">
          <Text className="text-center font-display text-3xl text-sidebar-foreground">{names.coach}</Text>
          <Text className="text-center text-base text-sidebar-foreground/80">{names.club}</Text>
        </View>
      ) : null}
      <Text role="heading" aria-level={3} className="text-center text-2xl font-sans-bold text-sidebar-foreground">
        {title}
      </Text>
      {description ? <Text className="text-center text-sm text-sidebar-foreground/80">{description}</Text> : null}
    </View>
  );
}

