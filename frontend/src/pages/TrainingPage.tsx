import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Dumbbell, FolderOpen } from 'lucide-react';

export default function TrainingPage() {
  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Entrenamientos</h1>
            <p className="text-muted-foreground">Gestiona ejercicios y rutinas de entrenamiento</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo ejercicio
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-primary" />
                Ejercicios
              </CardTitle>
              <CardDescription>
                Crea y gestiona ejercicios individuales
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                0 ejercicios creados
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-primary" />
                Grupos de ejercicios
              </CardTitle>
              <CardDescription>
                Organiza ejercicios en grupos temáticos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                0 grupos creados
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
