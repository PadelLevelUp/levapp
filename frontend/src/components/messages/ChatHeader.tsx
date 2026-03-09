import { ArrowLeft, MoreVertical } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Conversation } from '@/types';

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

interface Props {
  conversation: Conversation;
  onBack?: () => void;
  showBack?: boolean;
}

export function ChatHeader({ conversation, onBack, showBack }: Props) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-card border-b border-border min-h-[56px]">
      {showBack && (
        <button
          onClick={onBack}
          className="p-1.5 -ml-1 rounded-full hover:bg-accent transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-primary" />
        </button>
      )}

      <Avatar className="w-9 h-9 flex-shrink-0">
        <AvatarImage src={conversation.participantAvatar} />
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
          {getInitials(conversation.participantName)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-semibold text-foreground truncate">{conversation.participantName}</h2>
        <p className="text-xs text-muted-foreground">Player</p>
      </div>

      <button className="p-2 rounded-full hover:bg-accent transition-colors" aria-label="More options">
        <MoreVertical className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}
