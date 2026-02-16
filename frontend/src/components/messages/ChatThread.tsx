import { useState, useRef, useEffect } from "react";
import { Send, MoreVertical, ArrowLeft } from "lucide-react";
import { MessageTextarea } from "@/components/ui/message-textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { enGB } from "date-fns/locale";
import { useLayout } from "@/components/layout/LayoutContext";
import { useVisualViewport } from "@/hooks/useVisualViewportHeight"; // must export {height, offsetTop}

interface ChatThreadProps {
  conversation: Conversation;
  user_id: number;
  onSendMessage: (content: string) => Promise<void>;
  onBack?: () => void;
  isMobile?: boolean;
}

export function ChatThread({
  conversation,
  user_id,
  onSendMessage,
  onBack,
  isMobile,
}: ChatThreadProps) {
  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Measure composer height so last message never sits behind it
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(0);

  // Visual viewport info (iOS keyboard changes this)
  const { height: vvHeight, offsetTop } = useVisualViewport();

  const { bottomNavHidden, setBottomNavHidden } = useLayout();

  const messageCount = conversation?.messages?.length ?? 0;

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      setComposerHeight(el.offsetHeight);
    });

    ro.observe(el);
    setComposerHeight(el.offsetHeight);

    return () => ro.disconnect();
  }, []);

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  const getViewport = () => {
    if (viewportRef.current) return viewportRef.current;

    const root = scrollRef.current;
    if (!root) return null;

    const viewport = root
      .closest("[data-radix-scroll-area-root]")
      ?.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement | null;

    viewportRef.current = viewport;
    return viewport;
  };

  const isNearBottom = () => {
    const viewport = getViewport();
    if (!viewport) return true;

    const threshold = Math.max(140, composerHeight + 24);
    return (
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < threshold
    );
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const formatMessageTime = (timestamp: string) =>
    format(parseISO(timestamp), "HH:mm");

  const formatDateHeader = (timestamp: string) => {
    const date = parseISO(timestamp);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "d 'of' MMMM", { locale: enGB });
  };

  const getMessageGroups = () => {
    if (!conversation?.messages) return [];

    const groups: { date: string; messages: typeof conversation.messages }[] =
      [];
    let currentDate = "";

    conversation.messages.forEach((message) => {
      const messageDate = format(parseISO(message.timestamp), "yyyy-MM-dd");
      if (messageDate !== currentDate) {
        currentDate = messageDate;
        groups.push({ date: message.timestamp, messages: [message] });
      } else {
        groups[groups.length - 1].messages.push(message);
      }
    });

    return groups;
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !conversation) return;

    const content = newMessage;
    setNewMessage("");

    await onSendMessage(content);

    // iOS needs a tick after DOM updates + viewport changes
    requestAnimationFrame(() => {
      scrollToBottom("auto");
      requestAnimationFrame(() => scrollToBottom("smooth"));
    });

    // Keep keyboard open
    try {
      // preventScroll works in modern Safari; cast for TS
      textareaRef.current?.focus({ preventScroll: true } as any);
    } catch {
      textareaRef.current?.focus();
    }
  };

  // When message count changes, auto-scroll only if user was near bottom
  useEffect(() => {
    if (!conversation) return;
    if (isNearBottom()) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageCount]);

  // On thread change, jump to bottom
  useEffect(() => {
    scrollToBottom("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  // Safety: never leave nav hidden when unmounting
  useEffect(() => {
    return () => setBottomNavHidden(false);
  }, [setBottomNavHidden]);

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center text-muted-foreground">
          <p className="text-lg">Select a conversation</p>
          <p className="text-sm mt-1">Choose a chat to start messaging</p>
        </div>
      </div>
    );
  }

  const messageGroups = getMessageGroups();

  // --- Layout sizing ---
  // AppLayout header is h-16 (64px)
  const layoutHeaderPx = 64;

  // Mobile bottom nav is also h-16 (64px) when visible
  const bottomNavPx = isMobile && !bottomNavHidden ? 64 : 0;

  // Height available for the chat sheet on mobile
  const mobileSheetHeight = Math.max(0, vvHeight - bottomNavPx);

  const content = (
    <div className="flex flex-col bg-background min-h-0 h-full">
      {/* Chat Header */}
      <div className="h-16 border-b border-border px-4 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          {isMobile && onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              aria-label="Back"
              className="mr-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}

          <Avatar className="w-10 h-10">
            <AvatarImage src={conversation.participantAvatar} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials(conversation.participantName)}
            </AvatarFallback>
          </Avatar>

          <div>
            <h3 className="font-medium">{conversation.participantName}</h3>
            <p className="text-xs text-muted-foreground">Player</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View profile</DropdownMenuItem>
            <DropdownMenuItem>Mute notifications</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              Delete chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages Area (only scroll region) */}
      <ScrollArea className="flex-1 min-h-0 p-4">
        <div
          className="space-y-6 max-w-3xl mx-auto"
          ref={scrollRef}
          style={{
            overflowAnchor: "none",
          }}
        >
          {messageGroups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {/* Date Header */}
              <div className="flex justify-center mb-4">
                <span className="px-3 py-1 text-xs bg-muted text-muted-foreground rounded-full">
                  {formatDateHeader(group.date)}
                </span>
              </div>

              {/* Messages */}
              <div className="space-y-3">
                {group.messages.map((message) => {
                  const isCurrentUser = message.senderId === user_id;
                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex",
                        isCurrentUser ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] min-w-0 rounded-2xl px-4 py-2.5",
                          isCurrentUser
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted rounded-bl-md"
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap break-all">
                          {message.content}
                        </p>
                        <p
                          className={cn(
                            "text-xs mt-1",
                            isCurrentUser
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                          )}
                        >
                          {formatMessageTime(message.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* IMPORTANT: bottomRef must be inside the scroll content */}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Composer */}
      <div ref={composerRef} className="p-4 border-t border-border bg-card">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <MessageTextarea
            ref={textareaRef}
            isMobile={isMobile}
            value={newMessage}
            onValueChange={setNewMessage}
            onSend={handleSend}
            placeholder="Type a message..."
            enterBehavior={isMobile ? "newline" : "send"}
            onFocus={() => {
              if (isMobile) setBottomNavHidden(true);
            }}
            onBlur={() => {
              if (isMobile) setBottomNavHidden(false);
            }}
          />
          <Button
            onPointerDown={(e) => e.preventDefault()}
            onClick={handleSend}
            disabled={!newMessage.trim()}
            className="shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  // ✅ The important part: on mobile, render as a fixed sheet under the AppLayout header.
  // This prevents iOS Safari from scrolling the whole page to reveal the input.
  if (isMobile) {
    return (
      <div
        className="fixed left-0 right-0 z-40"
        style={{
          height: mobileSheetHeight,
          // offsetTop accounts for Safari UI shifting the visual viewport
          transform: `translateY(${offsetTop}px)`,
        }}
      >
        {content}
      </div>
    );
  }

  // Desktop/tablet: normal layout flow
  return <div className="flex-1 min-h-0">{content}</div>;
}
