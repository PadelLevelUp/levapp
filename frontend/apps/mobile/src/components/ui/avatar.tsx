import * as AvatarPrimitive from "@rn-primitives/avatar";
import * as React from "react";
import { TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

function Avatar({ className, ...props }: AvatarPrimitive.RootProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative h-10 w-10 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: AvatarPrimitive.ImageProps) {
  return (
    <AvatarPrimitive.Image
      className={cn("aspect-square h-full w-full", className)}
      {...props}
    />
  );
}

function AvatarFallback({ className, ...props }: AvatarPrimitive.FallbackProps) {
  return (
    <TextClassContext.Provider value="text-sm font-medium text-muted-foreground">
      <AvatarPrimitive.Fallback
        className={cn(
          "h-full w-full flex-row items-center justify-center rounded-full bg-muted",
          className
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Avatar, AvatarFallback, AvatarImage };
