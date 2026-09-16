import * as AlertDialogPrimitive from "@rn-primitives/alert-dialog";
import * as React from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { buttonTextVariants, buttonVariants } from "@/components/ui/button";
import { TextClassContext } from "@/components/ui/text";
import { resolveFontClass } from "@/lib/font-class";
import { useAndroidBack } from "@/lib/android-back";
import { dialogEntering, dialogExiting } from "@/lib/dialog-motion";
import { cn } from "@/lib/utils";
import { b089 } from "@/lib/b089-trace";
import { runOnJS } from "react-native-reanimated";

type ViewProps = React.ComponentProps<typeof View>;

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;

// PROBE ONLY: the entering animation reports whether it finished.
function tracedEntering(id: string) {
  const base = dialogEntering();
  if (!base) return undefined;
  return base.withCallback((finished: boolean) => {
    "worklet";
    runOnJS(b089)("entering-done", { id, finished });
  });
}

function AlertDialogOverlay({
  className,
  children,
  ...props
}: AlertDialogPrimitive.OverlayProps) {
  const traceId = React.useId();
  React.useEffect(() => {
    b089("overlay-mount", { id: traceId });
    return () => b089("overlay-unmount", { id: traceId });
  }, [traceId]);
  return (
    <AlertDialogPrimitive.Overlay
      onLayout={(e) => b089("overlay-layout", { id: traceId, ...e.nativeEvent.layout })}
      style={StyleSheet.absoluteFill}
      className={cn(
        "z-50 items-center justify-center bg-black/80 p-2",
        className
      )}
      {...props}
    >
      {/* Same width-collapse fix as dialog.tsx's DialogOverlay — see PAD-102. */}
      <Animated.View
        style={{ alignSelf: "stretch" }}
        entering={tracedEntering(traceId)}
        exiting={dialogExiting()}
        onLayout={(e) => b089("animated-layout", { id: traceId, ...e.nativeEvent.layout })}
      >
        <>{children}</>
      </Animated.View>
    </AlertDialogPrimitive.Overlay>
  );
}

type AlertDialogContentProps = AlertDialogPrimitive.ContentProps & {
  /** Portal host name; defaults to the root <PortalHost /> in app/_layout.tsx. */
  portalHost?: string;
};

function AlertDialogContent({
  className,
  portalHost,
  ...props
}: AlertDialogContentProps) {
  // Android back closes the dialog (mobile.android-runtime rule 3).
  const { open, onOpenChange } = AlertDialogPrimitive.useRootContext();
  useAndroidBack(open, () => onOpenChange(false));
  b089("content-render", { open });
  return (
    <AlertDialogPortal hostName={portalHost}>
      <AlertDialogOverlay>
        <AlertDialogPrimitive.Content
          onLayout={(e) => b089("content-layout", e.nativeEvent.layout)}
          className={cn(
            "z-50 w-full max-w-lg gap-4 rounded-lg border border-border bg-background p-6 shadow-lg shadow-black/20",
            className
          )}
          {...props}
        />
      </AlertDialogOverlay>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: ViewProps) {
  return <View className={cn("flex flex-col gap-2", className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: ViewProps) {
  return (
    <View className={cn("flex flex-col-reverse gap-2", className)} {...props} />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: AlertDialogPrimitive.TitleProps) {
  return (
    <AlertDialogPrimitive.Title
      // @rn-primitives Title renders a native Text directly — R-025.
      className={resolveFontClass(
        cn("text-lg font-semibold text-foreground", className)
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.DescriptionProps) {
  return (
    <AlertDialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ...props
}: AlertDialogPrimitive.ActionProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({})}>
      <AlertDialogPrimitive.Action
        className={cn(buttonVariants(), className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function AlertDialogCancel({
  className,
  ...props
}: AlertDialogPrimitive.CancelProps) {
  return (
    <TextClassContext.Provider
      value={buttonTextVariants({ variant: "outline" })}
    >
      <AlertDialogPrimitive.Cancel
        className={cn(buttonVariants({ variant: "outline" }), className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
