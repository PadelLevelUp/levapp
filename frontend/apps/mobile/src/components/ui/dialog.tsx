import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as DialogPrimitive from "@rn-primitives/dialog";
import { PortalHost } from "@rn-primitives/portal";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { resolveFontClass } from "@/lib/font-class";
import { useAndroidBack } from "@/lib/android-back";
import { dialogEntering, dialogExiting } from "@/lib/dialog-motion";
import { dialogMaxHeight } from "@/lib/dialog-size";
import { cn } from "@/lib/utils";

type ViewProps = React.ComponentProps<typeof View>;

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

function DialogOverlay({
  className,
  children,
  after,
  ...props
}: DialogPrimitive.OverlayProps & { after?: React.ReactNode }) {
  return (
    <DialogPrimitive.Overlay
      style={StyleSheet.absoluteFill}
      className={cn(
        "z-50 items-center justify-center bg-black/80 p-2",
        className
      )}
      {...props}
    >
      {/*
       * The overlay centers its child on both axes (items-center), which
       * overrides flexbox's default cross-axis "stretch" and makes this
       * Animated.View shrink-wrap to its content's intrinsic width. That
       * leaves DialogContent's `w-full` with nothing to resolve against, so
       * short content (e.g. a single stepper row, a short hint sentence)
       * collapses the whole dialog to fit-content sizing.
       *
       * Fix: `alignSelf: "stretch"` (plain style, not a NativeWind
       * className) makes this node fill the overlay's full width via
       * native flexbox — resolved once by Yoga, independent of content
       * size. A `className="w-full"` percentage class was tried instead
       * and fixed the populated case, but NativeWind's measure-based
       * className interop for percentage widths on an animated
       * (entering/exiting) component thrashed against the very short
       * empty-state content and threw "Maximum update depth exceeded".
       * `alignSelf: "stretch"` sidesteps that interop path entirely.
       */}
      <Animated.View
        style={{ alignSelf: "stretch" }}
        entering={dialogEntering()}
        exiting={dialogExiting()}
      >
        <>{children}</>
      </Animated.View>
      {after}
    </DialogPrimitive.Overlay>
  );
}

type DialogContentProps = DialogPrimitive.ContentProps & {
  /** Portal host name; defaults to the root <PortalHost /> in app/_layout.tsx. */
  portalHost?: string;
  /**
   * B-295: a PortalHost of this name inside the dialog's full-screen overlay, above the panel.
   * A Select or picker opened inside the dialog must render here — through the root host it draws
   * BEHIND the dialog on iOS. Pass the same name as their `portalHost`.
   */
  innerPortalHost?: string;
};

function DialogContent({
  className,
  children,
  portalHost,
  innerPortalHost,
  ...props
}: DialogContentProps) {
  const { t } = useTranslation();
  // Android back closes the dialog (mobile.android-runtime rule 3).
  const { open, onOpenChange } = DialogPrimitive.useRootContext();
  useAndroidBack(open, () => onOpenChange(false));
  // PAD-496: never taller than the visible window. A plain style, not a className: see the
  // note on the Animated.View above about measured classes on this subtree. A dialog whose
  // list may shrink (`flexShrink: 1`) then keeps its header and footer on a short screen.
  const { height: windowHeight } = useWindowDimensions();
  const maxHeight = dialogMaxHeight(windowHeight, useSafeAreaInsets());
  return (
    <DialogPortal hostName={portalHost}>
      <DialogOverlay after={innerPortalHost ? <PortalHost name={innerPortalHost} /> : null}>
        <DialogPrimitive.Content
          className={cn(
            "z-50 w-full max-w-lg gap-4 rounded-lg border border-border bg-background p-6 shadow-lg shadow-black/20",
            className
          )}
          {...props}
          style={[{ maxHeight }, props.style]}
        >
          {children}
          <DialogPrimitive.Close
            testID="dialog-close"
            className="absolute right-4 top-4 rounded-sm p-0.5 opacity-70 active:opacity-100"
            hitSlop={12}
            aria-label={t("ui.dialog.close")}
          >
            <Ionicons
              name="close"
              size={18}
              color={lightTheme.mutedForeground}
            />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogOverlay>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: ViewProps) {
  return <View className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

function DialogFooter({ className, ...props }: ViewProps) {
  return (
    <View className={cn("flex flex-col-reverse gap-2", className)} {...props} />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.TitleProps) {
  return (
    <DialogPrimitive.Title
      // @rn-primitives Title renders a native Text directly — R-025.
      className={resolveFontClass(
        cn("text-lg font-semibold text-foreground", className)
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.DescriptionProps) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
