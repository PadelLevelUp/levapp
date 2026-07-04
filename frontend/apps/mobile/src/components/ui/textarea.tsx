import * as React from "react";
import { TextInput } from "react-native";
import { cn } from "@/lib/utils";

type TextareaProps = React.ComponentProps<typeof TextInput>;

function Textarea({
  className,
  multiline = true,
  numberOfLines = 4,
  ...props
}: TextareaProps) {
  return (
    <TextInput
      className={cn(
        "min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-base text-foreground",
        props.editable === false && "opacity-50",
        className
      )}
      placeholderTextColor="hsl(220 10% 45%)"
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical="top"
      {...props}
    />
  );
}

export { Textarea };
export type { TextareaProps };
