import * as Slot from "@rn-primitives/slot";
import * as React from "react";
import { Text as RNText } from "react-native";
import { cn } from "@/lib/utils";

const TextClassContext = React.createContext<string | undefined>(undefined);

type TextProps = React.ComponentProps<typeof RNText> & {
  asChild?: boolean;
};

function Text({ className, asChild = false, ...props }: TextProps) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      // RN Text does not inherit a family, and React 19 removed
      // Text.defaultProps, so the base face is applied here — this wrapper is
      // what almost the whole app renders text through.
      className={cn("font-sans text-base text-foreground", textClass, className)}
      {...props}
    />
  );
}

export { Text, TextClassContext };
export type { TextProps };
