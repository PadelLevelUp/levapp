import * as React from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

export interface MessageTextareaProps
  extends Omit<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    "onChange" | "value"
  > {
  value: string;
  onValueChange: (value: string) => void;
  onSend?: () => void;
  maxHeightPx?: number;
  enterBehavior?: "send" | "newline";
  isMobile?: boolean;
}

export const MessageTextarea = React.forwardRef<
  HTMLTextAreaElement,
  MessageTextareaProps
>(
  (
    {
      value,
      onValueChange,
      onSend,
      maxHeightPx = 160,
      className,
      onKeyDown,
      onPointerDown,
      style,
      enterBehavior,
      isMobile,
      ...props
    },
    ref
  ) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    // merge forwarded ref + inner ref
    React.useImperativeHandle(
      ref,
      () => innerRef.current as HTMLTextAreaElement
    );

    const autosize = React.useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "0px";
      el.style.height = Math.min(el.scrollHeight, maxHeightPx) + "px";
    }, [maxHeightPx]);

    React.useEffect(() => {
      autosize();
    }, [value, autosize]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const behavior = enterBehavior ?? "newline";

      if (behavior === "send") {
        // Enter sends, Shift+Enter = newline
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSend?.();
          return;
        }
      } else {
        // Enter = newline; Cmd/Ctrl+Enter sends
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onSend?.();
          return;
        }
      }

      onKeyDown?.(e);
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLTextAreaElement>) => {
      // iOS Safari sometimes scrolls the page to reveal focused inputs.
      // Prevent default and focus manually to avoid the jump-to-top glitch.
      if (isMobile) {
        e.preventDefault();
        try {
          innerRef.current?.focus({ preventScroll: true } as any);
        } catch {
          innerRef.current?.focus();
        }
      }

      onPointerDown?.(e);
    };

    return (
      <Textarea
        ref={(node) => {
          innerRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref)
            (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current =
              node;
        }}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        rows={1}
        style={{ maxHeight: maxHeightPx, ...style }}
        className={cn(
          "text-base leading-5",
          "min-h-[40px] resize-none overflow-auto",
          className
        )}
        {...props}
      />
    );
  }
);

MessageTextarea.displayName = "MessageTextarea";
