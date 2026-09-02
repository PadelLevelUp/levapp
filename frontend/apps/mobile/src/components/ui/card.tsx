import * as React from "react";
import { View } from "react-native";
import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type ViewProps = React.ComponentProps<typeof View>;
type TextProps = React.ComponentProps<typeof Text>;

function Card({ className, ...props }: ViewProps) {
  return (
    <TextClassContext.Provider value="text-card-foreground">
      <View
        className={cn(
          "rounded-lg border border-border bg-card shadow-sm",
          className
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function CardHeader({ className, ...props }: ViewProps) {
  return <View className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

function CardTitle({ className, ...props }: TextProps) {
  return (
    <Text
      role="heading"
      aria-level={3}
      className={cn("text-2xl font-semibold text-card-foreground", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: TextProps) {
  return (
    <Text className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

function CardContent({ className, ...props }: ViewProps) {
  return <View className={cn("p-6 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: ViewProps) {
  return (
    <View className={cn("flex-row items-center p-6 pt-0", className)} {...props} />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
