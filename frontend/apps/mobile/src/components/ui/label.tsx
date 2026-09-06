import * as LabelPrimitive from "@rn-primitives/label";
import * as React from "react";
import { resolveFontClass } from "@/lib/font-class";
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
        // Renders through @rn-primitives, not our Text wrapper, so the
        // weight has to be resolved to a real face here too (R-025).
        className={resolveFontClass(
          cn("text-sm font-medium text-foreground", className)
        )}
        {...props}
      />
    </LabelPrimitive.Root>
  );
}

export { Label };
