import { useState } from 'react';
import { MessageSquarePlus, Search } from 'lucide-react';
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
import { mockStudents } from '@/data/mockData';
import { cn } from '@/lib/utils';

interface NewConversationDialogProps {
  existingParticipantIds: string[];
  onSelectStudent: (studentId: string, studentName: string) => void;
}

export function NewConversationDialog({ 
  existingParticipantIds, 
  onSelectStudent 
}: NewConversationDialogProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const availableStudents = mockStudents.filter(
    student => !existingParticipantIds.includes(student.id)
  );

  const filteredStudents = availableStudents.filter(student =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSelectStudent = (studentId: string, studentName: string) => {
    onSelectStudent(studentId, studentName);
    setOpen(false);
    setSearchQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="shrink-0">
          <MessageSquarePlus className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva conversación</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar alumno..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Student List */}
          <ScrollArea className="h-[300px]">
            <div className="space-y-1">
              {filteredStudents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {availableStudents.length === 0 
                    ? 'Ya tienes conversaciones con todos los alumnos'
                    : 'No se encontraron alumnos'
                  }
                </div>
              ) : (
                filteredStudents.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => handleSelectStudent(student.id, student.name)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
                      "hover:bg-muted/50"
                    )}
                  >
                    <Avatar className="w-10 h-10 shrink-0">
                      <AvatarImage src={student.avatarUrl} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {getInitials(student.name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">
                        {student.name}
                      </span>
                      {student.email && (
                        <p className="text-xs text-muted-foreground truncate">
                          {student.email}
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
