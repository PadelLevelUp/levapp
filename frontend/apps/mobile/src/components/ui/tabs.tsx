import * as TabsPrimitive from "@rn-primitives/tabs";
import * as React from "react";
import { TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

function TabsList({ className, ...props }: TabsPrimitive.ListProps) {
  return (
    <TabsPrimitive.List
      className={cn(
        "h-12 flex-row items-center justify-center rounded-md bg-muted p-1",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.TriggerProps) {
  const { value } = TabsPrimitive.useRootContext();
  const isActive = value === props.value;
  return (
    <TextClassContext.Provider
      value={cn(
        "text-sm font-medium text-muted-foreground",
        isActive && "text-foreground"
      )}
    >
      {/* No shadow-* classes here: they set CSS variables, and adding them
          dynamically on the active tab forces a css-interop "upgrade" after
          the initial render — its DEV warning JSON.stringifies the props and
          crashes on React Navigation's throwing context getters (RedBox:
          "Couldn't find a navigation context"). */}
      <TabsPrimitive.Trigger
        className={cn(
          "flex-1 items-center justify-center rounded-sm px-3 py-1.5",
          props.disabled && "opacity-50",
          isActive && "bg-background",
          className
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.ContentProps) {
  return <TabsPrimitive.Content className={cn(className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
