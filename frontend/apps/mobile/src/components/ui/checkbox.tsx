import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as CheckboxPrimitive from "@rn-primitives/checkbox";
import * as React from "react";
import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: CheckboxPrimitive.RootProps) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-primary",
        props.checked && "bg-primary",
        props.disabled && "opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="h-full w-full items-center justify-center">
        <Ionicons
          name="checkmark"
          size={13}
          color={lightTheme.primaryForeground}
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
