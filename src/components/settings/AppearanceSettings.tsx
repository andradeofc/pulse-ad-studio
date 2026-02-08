import { useState, useEffect } from 'react';
import { Palette, Sun, Moon, Monitor, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark' | 'system';

const themes: { id: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'light', label: 'Claro', icon: Sun },
  { id: 'dark', label: 'Escuro', icon: Moon },
  { id: 'system', label: 'Sistema', icon: Monitor },
];

const accentColors = [
  { id: 'purple', name: 'Roxo', color: 'hsl(262, 83%, 58%)' },
  { id: 'blue', name: 'Azul', color: 'hsl(217, 91%, 60%)' },
  { id: 'green', name: 'Verde', color: 'hsl(142, 76%, 36%)' },
  { id: 'orange', name: 'Laranja', color: 'hsl(25, 95%, 53%)' },
  { id: 'pink', name: 'Rosa', color: 'hsl(330, 81%, 60%)' },
  { id: 'cyan', name: 'Ciano', color: 'hsl(189, 94%, 43%)' },
];

export function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored) return stored;
    return 'dark'; // Default to dark
  });
  const [accentColor, setAccentColor] = useState('green');
  const [compactMode, setCompactMode] = useState(false);
  const [animations, setAnimations] = useState(true);

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;
    
    if (newTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    } else if (newTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    toast.success(`Tema alterado para ${themes.find(t => t.id === newTheme)?.label}`);
  };

  const handleAccentColorChange = (colorId: string) => {
    setAccentColor(colorId);
    toast.success('Cor de destaque atualizada');
  };

  return (
    <div className="space-y-6">
      {/* Theme Selection */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Tema
          </CardTitle>
          <CardDescription>
            Escolha como a interface será exibida
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={theme}
            onValueChange={(value) => handleThemeChange(value as Theme)}
            className="grid grid-cols-3 gap-4"
          >
            {themes.map((t) => (
              <Label
                key={t.id}
                htmlFor={t.id}
                className={cn(
                  'flex flex-col items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all',
                  theme === t.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <RadioGroupItem value={t.id} id={t.id} className="sr-only" />
                <div className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center',
                  theme === t.id ? 'bg-primary/10' : 'bg-secondary'
                )}>
                  <t.icon className={cn(
                    'w-6 h-6',
                    theme === t.id ? 'text-primary' : 'text-muted-foreground'
                  )} />
                </div>
                <span className={cn(
                  'text-sm font-medium',
                  theme === t.id ? 'text-primary' : 'text-foreground'
                )}>
                  {t.label}
                </span>
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Accent Color */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Cor de Destaque</CardTitle>
          <CardDescription>
            Personalize a cor principal da interface
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {accentColors.map((color) => (
              <button
                key={color.id}
                onClick={() => handleAccentColorChange(color.id)}
                className={cn(
                  'relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all',
                  accentColor === color.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <div
                  className="w-8 h-8 rounded-full"
                  style={{ backgroundColor: color.color }}
                />
                {accentColor === color.id && (
                  <div className="absolute top-1 right-1">
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                )}
                <span className="text-xs text-muted-foreground">{color.name}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            * Alteração de cor será implementada em breve
          </p>
        </CardContent>
      </Card>

      {/* Display Options */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Opções de Exibição</CardTitle>
          <CardDescription>
            Ajuste como o conteúdo é apresentado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-foreground">
                Modo Compacto
              </Label>
              <p className="text-xs text-muted-foreground">
                Reduz o espaçamento para mostrar mais conteúdo
              </p>
            </div>
            <Switch
              checked={compactMode}
              onCheckedChange={setCompactMode}
            />
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-foreground">
                Animações
              </Label>
              <p className="text-xs text-muted-foreground">
                Ativar animações e transições suaves
              </p>
            </div>
            <Switch
              checked={animations}
              onCheckedChange={setAnimations}
            />
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Pré-visualização</CardTitle>
          <CardDescription>
            Veja como suas configurações afetam a interface
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-6 rounded-xl bg-secondary/50 border border-border">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/20" />
              <div>
                <div className="h-4 w-24 bg-foreground/20 rounded" />
                <div className="h-3 w-16 bg-muted-foreground/20 rounded mt-2" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full bg-muted-foreground/10 rounded" />
              <div className="h-3 w-3/4 bg-muted-foreground/10 rounded" />
              <div className="h-3 w-1/2 bg-muted-foreground/10 rounded" />
            </div>
            <div className="flex gap-2 mt-4">
              <Button size="sm">Primário</Button>
              <Button size="sm" variant="outline">Secundário</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
