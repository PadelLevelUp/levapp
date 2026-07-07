import * as LabelPrimitive from "@rn-primitives/label";
import * as React from "react";
import { cn } from "@/lib/utils";

type LabelProps = React.ComponentProps<typeof LabelPrimitive.Text>;

function Label({ className, onPress, onLongPress, onPressIn, onPressOut, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <LabelPrimitive.Text
        className={cn("text-sm font-medium text-foreground", className)}
        {...props}
      />
    </LabelPrimitive.Root>
  );
}

export { Label };
