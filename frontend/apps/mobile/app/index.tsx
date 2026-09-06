import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { postLoginRoute } from "@/auth/postLoginRoute";

export default function Index() {
  const { loading, isAuthenticated, user } = useAuth();

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

  // auth.register rule 11: a coach still waiting for approval, or with no
  // club yet, is held on the matching screen instead of the tabs.
  return isAuthenticated ? (
    <Redirect href={postLoginRoute(user)} />
  ) : (
    <Redirect href="/login" />
  );
}
