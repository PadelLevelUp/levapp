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

interface User {
  id: string;
  name: string;
  /** PAD-227: the picker carries the public shape — username, never email. */
  username?: string;
  avatarUrl?: string;
}

interface NewConversationDialogProps {
  existingParticipantIds: string[];
  onSelectUser: (userId: string) => void | Promise<void>;
  /**
   * messaging.direct-by-username: anyone types another user's exact username.
   * Rendered for every role; rejects with the API error so the 404 ("No user
   * with that username") can be shown inline.
   */
  onStartByUsername?: (username: string) => Promise<void>;
  /**
   * PAD-568 (messaging.conversations rule 7, "A student with no coach sees the connect
   * shortcut"): when the server's list is EMPTY — not merely filtered down to nothing by
   * `existingParticipantIds` — a student is offered "Ligar-me a um treinador". The page
   * passes this for students only; a coach with no roster sees the plain empty line.
   */
  onConnectWithCoach?: () => void;
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
  onConnectWithCoach,
}: NewConversationDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  // PAD-568: how many people the server listed BEFORE the existing-thread filter, so the
  // dialog can tell "not connected to anyone" from "already talking to everyone". `null`
  // until a load has answered, so neither state flashes before the request returns.
  const [connectedCount, setConnectedCount] = useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [submittingUsername, setSubmittingUsername] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  // messaging.direct-by-username rules 1 / 6 (PAD-225): the username path is
  // for every role — anyone can reach any other user by exact username. The
  // picker above it stays connection-scoped; that is the only search there is.
  const showUsernameField = !!onStartByUsername;

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

        setConnectedCount(allUsers.length);
        setUsers(availableUsers);
      } catch (error) {
        console.error('Failed to load users', error);
        setLoadFailed(true);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      setPickerError(null);
      setConnectedCount(null);
      setLoadFailed(false);
      loadUsers();
    }
  }, [open, existingParticipantIds]);

  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Why the list is empty, in order of precedence; `null` when there are rows to show.
  const emptyKind =
    loading || (connectedCount === null && !loadFailed)
      ? 'loading'
      : loadFailed
      ? 'failed'
      : connectedCount === 0
      ? 'not-connected'
      : users.length === 0
      ? 'all-taken'
      : filteredUsers.length === 0
      ? 'no-match'
      : null;
  const emptyCopy: Record<Exclude<typeof emptyKind, null>, string> = {
    loading: t('messages.loadingUsers'),
    failed: t('messages.couldNotLoadPeople'),
    'not-connected': t('messages.notConnectedYet'),
    'all-taken': t('messages.allUsersHaveConversations'),
    'no-match': t('messages.noUsersFound'),
  };
  // Literal ids (never built from a string) so the E2E specs' `getByTestId` calls stay greppable.
  const emptyTestId: Record<Exclude<typeof emptyKind, null>, string> = {
    loading: 'new-conversation-loading',
    failed: 'new-conversation-failed',
    'not-connected': 'new-conversation-not-connected',
    'all-taken': 'new-conversation-all-taken',
    'no-match': 'new-conversation-no-match',
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  // B-267 (PAD-483): the server can refuse a picked person (a stale list, a link removed
  // since it loaded). Say why and stay on the picker instead of closing on nothing.
  const handleSelectUser = async (userId: string) => {
    setPickerError(null);
    try {
      await onSelectUser(userId);
      setOpen(false);
      setSearchQuery('');
    } catch (error) {
      setPickerError(
        errorStatus(error) === 403
          ? t('messages.cannotMessageUser')
          : t('messages.somethingWentWrong')
      );
    }
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
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("messages.searchConnectedPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* User List */}
          <ScrollArea className="h-[300px]">
            <div className="space-y-1">
              {emptyKind === 'not-connected' && onConnectWithCoach ? (
                /* PAD-568: a student linked to no coach. The shortcut leads to
                   players.join-token rule 8's "Connect with a coach"; the username
                   field below stays available. */
                <div
                  className="flex flex-col items-center gap-2 text-center py-6 px-4"
                  data-testid="new-conversation-empty"
                >
                  <p className="text-sm font-medium">{emptyCopy['not-connected']}</p>
                  <p className="text-sm text-muted-foreground">{t('messages.notConnectedYetHint')}</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2"
                    data-testid="new-conversation-connect"
                    onClick={() => {
                      setOpen(false);
                      onConnectWithCoach();
                    }}
                  >
                    {t('players.connect.dashboardLink')}
                  </Button>
                </div>
              ) : emptyKind ? (
                <div
                  className="text-center py-8 text-muted-foreground text-sm"
                  data-testid={emptyTestId[emptyKind]}
                >
                  {emptyCopy[emptyKind]}
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    data-testid="new-conversation-row"
                    onClick={() => void handleSelectUser(user.id)}
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
                      {/* PAD-227: the picker carries the public shape — the
                          username, never the email. */}
                      {user.username && (
                        <p className="text-xs text-muted-foreground truncate">
                          @{user.username}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>

          {/* B-267: below the list, so the row that was clicked does not move; the line's
              space is always reserved, so the username section below does not jump either. */}
          <div className="min-h-5">
            {pickerError && (
              <p className="text-sm text-destructive" role="alert" data-testid="new-conversation-picker-error">
                {pickerError}
              </p>
            )}
          </div>

          {showUsernameField && <div className="border-t border-border pt-4" />}
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
              <p className="text-xs text-muted-foreground">{t('messages.messageByUsernameExplain')}</p>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
