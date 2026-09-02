import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";

export default function Index() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="app-loading"
      >
        <ActivityIndicator size="large" color="hsl(152 60% 42%)" />
      </View>
    );
  }

  return isAuthenticated ? (
    <Redirect href="/(tabs)/dashboard" />
  ) : (
    <Redirect href="/login" />
  );
}
