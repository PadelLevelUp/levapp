import * as React from "react";
import { TextInput } from "react-native";
import { cn } from "@/lib/utils";

type InputProps = React.ComponentProps<typeof TextInput>;

function Input({ className, ...props }: InputProps) {
  return (
    <TextInput
      className={cn(
        "h-12 rounded-md border border-input bg-background px-3 text-base text-foreground",
        props.editable === false && "opacity-50",
        className
      )}
      placeholderTextColor="hsl(220 10% 45%)"
      {...props}
    />
  );
}

export { Input };
export type { InputProps };
