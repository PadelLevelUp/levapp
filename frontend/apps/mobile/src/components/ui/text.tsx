import * as Slot from "@rn-primitives/slot";
import * as React from "react";
import { Text as RNText } from "react-native";
import { resolveFontClass } from "@/lib/font-class";
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
      // what almost the whole app renders text through (it holds the only
      // `Text` import from react-native in the app).
      //
      // resolveFontClass is what makes weight utilities work at all (R-025,
      // PAD-156): RN synthesizes no weights for a custom family, so a bare
      // `font-semibold` sets fontWeight against a family that has exactly one
      // face and renders Regular. It collapses whatever the caller wrote into
      // the single registered face that matches. It runs AFTER cn(), because
      // twMerge does not know the custom `font-sans-*` utilities and would
      // otherwise leave both the base family and the override in the string,
      // resolved only by NativeWind's last-wins ordering.
      className={resolveFontClass(
        cn("font-sans text-base text-foreground", textClass, className)
      )}
      {...props}
    />
  );
}

export { Text, TextClassContext };
export type { TextProps };
