import { Card, CardContent } from '@/components/ui/card';
import { Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      
      <Card className="glass-card">
        <CardContent className="py-16 text-center">
          <Construction className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            Em Desenvolvimento
          </h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Esta página está sendo construída. Em breve você poderá acessar todas as funcionalidades.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
