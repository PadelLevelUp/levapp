import * as SwitchPrimitive from "@rn-primitives/switch";
import * as React from "react";
import { cn } from "@/lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.RootProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "h-8 w-[46px] shrink-0 flex-row items-center rounded-full border-2 border-transparent",
        props.checked ? "bg-primary" : "bg-input",
        props.disabled && "opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "h-7 w-7 rounded-full bg-background shadow-md shadow-black/25",
          props.checked ? "translate-x-[18px]" : "translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
