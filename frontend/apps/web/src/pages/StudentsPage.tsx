import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Search, UserX, MoreVertical, MessageSquare, Eye, Link, Trash2 } from 'lucide-react';
import { mockCoachPlayers as mockCoachStudents, mockLevels } from '@/data/mockData';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StudentDetailSheet } from '@/components/students/StudentDetailSheet';
import { CoachPlayer as CoachStudent } from '@/types';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export default function StudentsPage() {
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<CoachStudent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const students = mockCoachStudents.filter(cs => 
    cs.name?.toLowerCase().includes(search.toLowerCase())
  );

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const handleStudentClick = (coachStudent: CoachStudent) => {
    setSelectedStudent(coachStudent);
    setSheetOpen(true);
  };

  const handleSendMessage = (coachStudent: CoachStudent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigate('/messages', { state: { newConversationWith: coachStudent } });
  };

  const handleCopyInviteLink = (coachStudent: CoachStudent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const invitationLink = `${window.location.origin}/invite/${coachStudent.id}`;
    navigator.clipboard.writeText(invitationLink);
    toast.success(t('students.inviteLinkCopied'));
  };

  const renderStudentCard = (coachStudent: CoachStudent) => {
    const { level, side } = coachStudent;
    const isInactive = !coachStudent.userId;

    const cardContent = (
      <Card 
        className="cursor-pointer hover:shadow-md transition-shadow relative"
        onClick={() => handleStudentClick(coachStudent)}
      >
        {/* Inactive Flag */}
        {isInactive && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="absolute top-2 right-10 p-1.5 rounded-full bg-destructive/10 text-destructive">
                <UserX className="w-4 h-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('students.noAccountTooltip')}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* 3-dots menu for touch/mobile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-2 right-2 h-7 w-7 opacity-60 hover:opacity-100"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStudentClick(coachStudent); }}>
              <Eye className="w-4 h-4 mr-2" />
              {t('students.viewDetails')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => handleSendMessage(coachStudent, e)}>
              <MessageSquare className="w-4 h-4 mr-2" />
              {t('students.sendMessage')}
            </DropdownMenuItem>
            {isInactive && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e) => handleCopyInviteLink(coachStudent, e)}>
                  <Link className="w-4 h-4 mr-2" />
                  {t('students.copyInviteLink')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Avatar className="w-12 h-12">
              <AvatarFallback className="bg-primary text-primary-foreground font-bold">{getInitials(coachStudent.name || '')}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{coachStudent.name}</p>
              <p className="text-sm text-muted-foreground truncate">{coachStudent.email}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            {level && <Badge variant="outline">{level.code}</Badge>}
            {side && <Badge variant="secondary">{side === 'left' ? t('students.sideLeftShort') : t('students.sideRightShort')}</Badge>}
          </div>
        </CardContent>
      </Card>
    );

    return (
      <ContextMenu key={coachStudent.id}>
        <ContextMenuTrigger>
          {cardContent}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={() => handleStudentClick(coachStudent)}>
            <Eye className="w-4 h-4 mr-2" />
            {t('students.viewDetails')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleSendMessage(coachStudent)}>
            <MessageSquare className="w-4 h-4 mr-2" />
            {t('students.sendMessage')}
          </ContextMenuItem>
          {isInactive && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => handleCopyInviteLink(coachStudent)}>
                <Link className="w-4 h-4 mr-2" />
                {t('students.copyInviteLink')}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t('students.title')}</h1>
          <Button><Plus className="w-4 h-4 mr-2" />{t('students.addStudent')}</Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('students.searchPlaceholder')} className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <TooltipProvider>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {students.map(renderStudentCard)}
          </div>
        </TooltipProvider>
      </div>

      <StudentDetailSheet 
        student={selectedStudent}
        levels={mockLevels}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </AppLayout>
  );
}
