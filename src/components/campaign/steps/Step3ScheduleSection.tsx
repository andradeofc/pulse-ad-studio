import { CalendarIcon, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCampaignStore } from '@/stores/campaignStore';
import { cn } from '@/lib/utils';

export function Step3ScheduleSection() {
  const { config, updateConfig } = useCampaignStore();

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        Agendamento
      </h3>
      <p className="text-sm text-muted-foreground">
        Data e hora de início dos conjuntos de anúncios
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Start Date */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4" />
            Data de Início
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal bg-secondary/50",
                  !config.scheduleStart && "text-muted-foreground"
                )}
              >
                {config.scheduleStart ? (
                  format(config.scheduleStart, "PPP", { locale: ptBR })
                ) : (
                  <span>Iniciar imediatamente</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={config.scheduleStart || undefined}
                onSelect={(date) => {
                  if (date) {
                    // Preserve time if already set, otherwise use current time
                    const currentTime = config.scheduleStart || new Date();
                    date.setHours(currentTime.getHours(), currentTime.getMinutes());
                  }
                  updateConfig({ scheduleStart: date || null });
                }}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Start Time */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Horário de Início (EST)
          </Label>
          <div className="flex gap-2">
            <Select
              value={config.scheduleStart ? String(config.scheduleStart.getHours()).padStart(2, '0') : ''}
              onValueChange={(hour) => {
                const date = config.scheduleStart || new Date();
                date.setHours(parseInt(hour));
                updateConfig({ scheduleStart: new Date(date) });
              }}
              disabled={!config.scheduleStart}
            >
              <SelectTrigger className="bg-secondary/50 w-24">
                <SelectValue placeholder="Hora" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={String(i).padStart(2, '0')}>
                    {String(i).padStart(2, '0')}h
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="flex items-center text-muted-foreground">:</span>
            <Select
              value={config.scheduleStart ? String(config.scheduleStart.getMinutes()).padStart(2, '0') : ''}
              onValueChange={(minute) => {
                const date = config.scheduleStart || new Date();
                date.setMinutes(parseInt(minute));
                updateConfig({ scheduleStart: new Date(date) });
              }}
              disabled={!config.scheduleStart}
            >
              <SelectTrigger className="bg-secondary/50 w-24">
                <SelectValue placeholder="Min" />
              </SelectTrigger>
              <SelectContent>
                {[0, 15, 30, 45].map((min) => (
                  <SelectItem key={min} value={String(min).padStart(2, '0')}>
                    {String(min).padStart(2, '0')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="ml-2 text-xs">
              EST
            </Badge>
          </div>
          {!config.scheduleStart && (
            <p className="text-xs text-muted-foreground">
              Selecione uma data para definir o horário
            </p>
          )}
          {config.scheduleStart && (
            <p className="text-xs text-muted-foreground">
              Fuso horário: Eastern Standard Time (Nova York)
            </p>
          )}
        </div>
      </div>

      {/* Clear Schedule Button */}
      {config.scheduleStart && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => updateConfig({ scheduleStart: null })}
        >
          Limpar agendamento (iniciar imediatamente)
        </Button>
      )}
    </section>
  );
}
