import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Check, UserX, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { CoachPlayer, CoachLevel, sideLabel } from '@/types';

interface StudentDetailSheetProps {
  student: CoachPlayer | null;
  levels: CoachLevel[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StudentDetailSheet({ student, levels, open, onOpenChange }: StudentDetailSheetProps) {
  const [copied, setCopied] = useState(false);
  
  if (!student) return null;

  const studentData = { name: student.name, email: student.email, phone: student.phone, userId: student.userId };
  const { level, side } = student;
  const isInactive = !studentData.userId;
  
  const getInitials = (name: string) => 
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const invitationLink = `${window.location.origin}/invite/${student.id}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(invitationLink);
      setCopied(true);
      toast.success('Enlace copiado al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Error al copiar el enlace');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalles del alumno</SheetTitle>
          <SheetDescription>
            Ver y editar la información del alumno
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Profile Section */}
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {getInitials(studentData.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{studentData.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                {level && <Badge variant="outline">{level.code}</Badge>}
                {side && <Badge variant="secondary">{sideLabel(side, { locale: 'es', short: true })}</Badge>}
                {isInactive && (
                  <Badge variant="destructive" className="gap-1">
                    <UserX className="w-3 h-3" />
                    Sin cuenta
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Invitation Link for Inactive Students */}
          {isInactive && (
            <div className="rounded-lg border border-dashed border-warning bg-warning/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <UserX className="w-5 h-5 text-warning mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Este alumno aún no tiene cuenta</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Comparte el siguiente enlace para que pueda registrarse y acceder a su perfil.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Input 
                  readOnly 
                  value={invitationLink} 
                  className="text-xs bg-background"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleCopyLink}
                  className="shrink-0"
                >
                  {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}

          <Separator />

          {/* Contact Info */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground">Información de contacto</h4>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{studentData.email || 'Sin email'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{studentData.phone || 'Sin teléfono'}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Editable Fields */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground">Configuración</h4>
            
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="level">Nivel</Label>
                <Select defaultValue={level?.id}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar nivel" />
                  </SelectTrigger>
                  <SelectContent>
                    {levels.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="side">Lado preferido</Label>
                <Select defaultValue={side || undefined}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar lado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Izquierda</SelectItem>
                    <SelectItem value="right">Derecha</SelectItem>
                    <SelectItem value="both">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button className="flex-1">Guardar cambios</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
