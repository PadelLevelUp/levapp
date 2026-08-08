import { lightTheme } from "@levelup/config";
import { Stack } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { ExercisesTab } from "@/features/training/exercises-tab";
import { GroupsTab } from "@/features/training/groups-tab";

/**
 * Training hub (coach only): Exercises and Groups as tabs on a single screen
 * — the mobile equivalent of the web /training, /training/exercises and
 * /training/groups pages.
 */
export default function TrainingScreen() {
  const [tab, setTab] = React.useState("exercises");

  return (
    <View className="flex-1 bg-background" testID="screen-training">
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: "minimal",
          title: "Training",
          headerStyle: { backgroundColor: lightTheme.sidebarBackground },
          headerTintColor: lightTheme.sidebarForeground,
          headerTitleStyle: { fontWeight: "700" },
        }}
      />

      <Tabs value={tab} onValueChange={setTab} className="flex-1 px-4 pt-3">
        <TabsList>
          <TabsTrigger
            value="exercises"
            testID="training-exercises-tab"
            accessibilityLabel="Exercises tab"
          >
            <Text>Exercises</Text>
          </TabsTrigger>
          <TabsTrigger
            value="groups"
            testID="training-groups-tab"
            accessibilityLabel="Groups tab"
          >
            <Text>Groups</Text>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="exercises" className="flex-1">
          <ExercisesTab />
        </TabsContent>
        <TabsContent value="groups" className="flex-1">
          <GroupsTab />
        </TabsContent>
      </Tabs>
    </View>
  );
}
