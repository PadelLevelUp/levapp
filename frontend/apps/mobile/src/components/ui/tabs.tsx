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
      <TabsPrimitive.Trigger
        className={cn(
          "flex-1 items-center justify-center rounded-sm px-3 py-1.5",
          props.disabled && "opacity-50",
          isActive && "bg-background shadow-sm shadow-black/10",
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
