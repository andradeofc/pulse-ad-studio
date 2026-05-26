import { useEffect, useState, useCallback } from "react";
import { Puzzle, Copy, RefreshCw, Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  isCollapsed: boolean;
}

export function SidebarExtensionPairing({ isCollapsed }: Props) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "extension-pairing-code",
        { method: "POST" },
      );
      if (error) throw error;
      setCode(data.code);
      setExpiresAt(new Date(data.expiresAt).getTime());
    } catch (e: any) {
      toast.error("Falha ao gerar código: " + (e?.message || "erro"));
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Auto-generate on first open
  useEffect(() => {
    if (open && !code && !loading) generate();
  }, [open, code, loading, generate]);

  const formatted = code ? `${code.slice(0, 3)}-${code.slice(3)}` : null;
  const expired = !!code && remaining === 0;

  const handleCopy = async () => {
    if (!formatted) return;
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    toast.success("Código copiado");
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    fetch("/adstorm-extension.zip")
      .then((res) => {
        if (!res.ok) throw new Error("Extensão indisponível");
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "adstorm-extension.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((e) => toast.error(e.message));
  };

  const Trigger = (
    <button
      className={cn(
        "w-full flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left",
        isCollapsed ? "justify-center p-2.5" : "px-3 py-2.5",
      )}
    >
      <div className="relative flex-shrink-0">
        <Puzzle className="w-5 h-5 text-primary" />
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
      </div>
      {!isCollapsed && (
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight">
            Extensão AdStorm
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Parear navegador
          </p>
        </div>
      )}
      {!isCollapsed && (
        <Badge
          variant="outline"
          className="text-[9px] h-4 px-1.5 border-primary/40 text-primary"
        >
          NOVO
        </Badge>
      )}
    </button>
  );

  return (
    <div className="px-3 py-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {isCollapsed ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>{Trigger}</TooltipTrigger>
                <TooltipContent side="right">
                  Parear Extensão AdStorm
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            Trigger
          )}
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="end"
          sideOffset={12}
          className="w-80 p-0 overflow-hidden"
        >
          <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Puzzle className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold">Pareamento da Extensão</h4>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Sincronize páginas e ad limits diretamente do seu navegador.
            </p>
          </div>

          <div className="p-4 space-y-3">
            <div
              className={cn(
                "rounded-lg border-2 border-dashed px-4 py-4 flex items-center justify-between transition-colors",
                code && !expired
                  ? "border-primary/50 bg-background"
                  : "border-border bg-muted/40",
              )}
            >
              {formatted && !expired ? (
                <>
                  <span className="font-mono text-xl font-bold tracking-[0.2em] text-foreground">
                    {formatted}
                  </span>
                  <Button variant="ghost" size="sm" onClick={handleCopy}>
                    {copied ? (
                      <Check className="w-4 h-4 text-primary" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground mx-auto">
                  {loading
                    ? "Gerando código…"
                    : expired
                      ? "Código expirado"
                      : "Aguardando código"}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              {code && !expired ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  Expira em{" "}
                  <span className="font-semibold text-foreground">
                    {remaining}s
                  </span>
                </span>
              ) : (
                <span />
              )}
              <Button
                onClick={generate}
                disabled={loading}
                size="sm"
                variant="secondary"
              >
                <RefreshCw
                  className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")}
                />
                {code ? "Gerar novo" : "Gerar"}
              </Button>
            </div>

            <div className="pt-2 border-t">
              <Button
                onClick={handleDownload}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Baixar Extensão (.zip)
              </Button>
              <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                Após instalar no Chrome, abra a extensão, cole o código acima e
                clique em conectar.
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
