import { useEffect, useState } from 'react';
import { AtSign, MessageSquarePlus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { getMessageableUsers } from '@/api/users';
import { useAuth } from '@/auth/AuthContext';

interface User {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

interface NewConversationDialogProps {
  existingParticipantIds: string[];
  onSelectUser: (userId: string) => void;
  /**
   * messaging.direct-by-username: a student types another student's exact
   * username. Rendered for students only; rejects with the API error so the
   * 404 ("No user with that username") can be shown inline.
   */
  onStartByUsername?: (username: string) => Promise<void>;
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    return response?.status;
  }
  return undefined;
}

export function NewConversationDialog({
  existingParticipantIds,
  onSelectUser,
  onStartByUsername,
}: NewConversationDialogProps) {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [submittingUsername, setSubmittingUsername] = useState(false);

  // Coaches reach players through the roster/club picker only; the username
  // path exists for students (messaging.direct-by-username rule 1 / 6).
  const isStudent = !(me?.roles ?? []).includes('coach');
  const showUsernameField = isStudent && !!onStartByUsername;

  const handleStartByUsername = async () => {
    const value = username.trim();
    if (!value || !onStartByUsername || submittingUsername) return;
    setSubmittingUsername(true);
    setUsernameError(null);
    try {
      await onStartByUsername(value);
      setOpen(false);
      setUsername('');
      setSearchQuery('');
    } catch (error) {
      const status = errorStatus(error);
      if (status === 404) {
        setUsernameError(t('messages.noUserWithUsername'));
      } else if (status === 403) {
        setUsernameError(t('messages.cannotMessageUser'));
      } else {
        setUsernameError(t('messages.somethingWentWrong'));
      }
    } finally {
      setSubmittingUsername(false);
    }
  };

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      try {
        const allUsers = await getMessageableUsers();

        const availableUsers = allUsers.filter(
          (user) => !existingParticipantIds.includes(user.id)
        );

        setUsers(availableUsers);
      } catch (error) {
        console.error('Failed to load users', error);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      loadUsers();
    }
  }, [open, existingParticipantIds]);

  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const handleSelectUser = (userId: string) => {
    onSelectUser(userId);
    setOpen(false);
    setSearchQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="shrink-0" aria-label={t("messages.newConversation")}>
          <MessageSquarePlus className="w-5 h-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("messages.newConversation")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {showUsernameField && (
            <form
              className="space-y-2"
              data-testid="message-by-username"
              onSubmit={(e) => {
                e.preventDefault();
                void handleStartByUsername();
              }}
            >
              <label
                htmlFor="new-conversation-username"
                className="text-sm font-medium"
              >
                {t('messages.messageByUsername')}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="new-conversation-username"
                    data-testid="message-by-username-input"
                    placeholder={t('messages.usernamePlaceholder')}
                    value={username}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (usernameError) setUsernameError(null);
                    }}
                    className="pl-9"
                  />
                </div>
                <Button
                  type="submit"
                  data-testid="message-by-username-submit"
                  disabled={!username.trim() || submittingUsername}
                >
                  {t('messages.usernameSubmit')}
                </Button>
              </div>
              {usernameError && (
                <p
                  className="text-sm text-destructive"
                  role="alert"
                  data-testid="message-by-username-error"
                >
                  {usernameError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t('messages.messageByUsernameHint')}
              </p>
            </form>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("messages.searchUsersPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* User List */}
          <ScrollArea className="h-[300px]">
            <div className="space-y-1">
              {loading || filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {loading
                    ? t('messages.loadingUsers')
                    : users.length === 0
                    ? t('messages.allUsersHaveConversations')
                    : t('messages.noUsersFound')}
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                      'hover:bg-muted/50'
                    )}
                  >
                    <Avatar className="w-10 h-10 shrink-0">
                      <AvatarImage src={user.avatarUrl} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">
                        {user.name}
                      </span>
                      {user.email && (
                        <p className="text-xs text-muted-foreground truncate">
                          {user.email}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
