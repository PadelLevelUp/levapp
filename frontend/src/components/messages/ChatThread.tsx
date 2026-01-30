import { useState, useRef, useEffect } from 'react';
import { Send, MoreVertical } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { enGB } from 'date-fns/locale'
import { sendMessage } from "@/api/messages";

interface ChatThreadProps {
  conversation?: Conversation;
  user_id?: number;
}

export function ChatThread({ conversation, user_id }: ChatThreadProps) {
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatMessageTime = (timestamp: string) => {
    const date = parseISO(timestamp);
    return format(date, 'HH:mm');
  };

  const formatDateHeader = (timestamp: string) => {
    const date = parseISO(timestamp);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, "d 'of' MMMM", { locale: enGB });
  };

  const getMessageGroups = () => {
    if (!conversation?.messages) return [];

    const groups: { date: string; messages: typeof conversation.messages }[] = [];
    let currentDate = '';

    conversation.messages.forEach((message) => {
      const messageDate = format(parseISO(message.timestamp), 'yyyy-MM-dd');
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

    try {
      await sendMessage({
        conversationId: conversation.id,
        content: newMessage,
      });

      setNewMessage("");
    } catch (err) {
      console.error("Failed to send message", err);
      // later: toast / error UI
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Chat Header */}
      <div className="h-16 border-b border-border px-4 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
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

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>View profile</DropdownMenuItem>
              <DropdownMenuItem>Mute notifications</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Delete chat</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-6 max-w-3xl mx-auto">
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
                          "max-w-[70%] rounded-2xl px-4 py-2.5",
                          isCurrentUser
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted rounded-bl-md"
                        )}
                      >
                        <p className="text-sm">{message.content}</p>
                        <p
                          className={cn(
                            "text-xs mt-1",
                            isCurrentUser ? "text-primary-foreground/70" : "text-muted-foreground"
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
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border bg-card">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <Input
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={!newMessage.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
