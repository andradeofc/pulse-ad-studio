import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, RefreshCw, Puzzle, Check, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ExtensionPairingCard() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("extension-pairing-code", {
        method: "POST",
      });
      if (error) throw error;
      setCode(data.code);
      setExpiresAt(new Date(data.expiresAt).getTime());
    } catch (e: any) {
      toast.error("Falha ao gerar código: " + (e?.message || "erro desconhecido"));
    } finally {
      setLoading(false);
    }
  }, []);

  // Countdown
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = expiresAt - Date.now();
      setRemaining(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [expiresAt]);

  const handleCopy = async () => {
    if (!code) return;
    const formatted = `${code.slice(0, 3)}-${code.slice(3)}`;
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    toast.success("Código copiado");
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = "/adstorm-extension.zip";
    a.download = "adstorm-extension.zip";
    a.click();
  };

  const expired = remaining === 0;
  const formatted = code ? `${code.slice(0, 3)}-${code.slice(3)}` : null;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Puzzle className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Pareamento com Extensão</CardTitle>
            <Badge variant="outline" className="text-[10px]">Novo</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Baixar Extensão
          </Button>
        </div>
        <CardDescription>
          Gere um código, instale a extensão AdStorm no Chrome e cole para sincronizar páginas
          + ad limits reais sem esperar pela API.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div
            className={cn(
              "flex-1 rounded-lg border-2 border-dashed px-5 py-4 flex items-center justify-between transition-colors",
              code && !expired ? "border-primary/50 bg-background" : "border-border bg-muted/40",
            )}
          >
            {formatted && !expired ? (
              <>
                <span className="font-mono text-2xl font-bold tracking-[0.25em] text-foreground">
                  {formatted}
                </span>
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                </Button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">
                {expired ? "Código expirado — gere outro" : "Clique em Gerar Código"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {code && !expired && (
              <div className="text-xs text-muted-foreground tabular-nums w-16 text-right">
                Expira em <span className="font-semibold text-foreground">{remaining}s</span>
              </div>
            )}
            <Button onClick={generate} disabled={loading} size="sm">
              <RefreshCw className={cn("w-4 h-4 mr-1.5", loading && "animate-spin")} />
              {code ? "Gerar novo" : "Gerar código"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
