import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { protocol, host, port, username, password } = await req.json();

    if (!host || !port) {
      return new Response(
        JSON.stringify({ error: "Host and port are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const proto = (protocol || "http").toLowerCase();
    const validProtocols = ["http", "https", "socks5"];
    if (!validProtocols.includes(proto)) {
      return new Response(
        JSON.stringify({ error: `Invalid protocol: ${proto}. Use: ${validProtocols.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build proxy URL
    let proxyUrl: string;
    if (username && password) {
      proxyUrl = `${proto}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
    } else if (username) {
      proxyUrl = `${proto}://${encodeURIComponent(username)}@${host}:${port}`;
    } else {
      proxyUrl = `${proto}://${host}:${port}`;
    }

    console.log(`[test-proxy] Testing proxy: ${proto}://${host}:${port} (auth: ${!!username})`);

    // Create HTTP client with proxy
    let client: Deno.HttpClient;
    try {
      client = Deno.createHttpClient({
        proxy: { url: proxyUrl },
      });
    } catch (err: any) {
      console.error("[test-proxy] Failed to create HTTP client:", err);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Falha ao criar cliente proxy: ${err.message}` 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Test connectivity by fetching external IP via a reliable service
    const ipServices = [
      "https://api.ipify.org?format=json",
      "https://httpbin.org/ip",
    ];

    let externalIp: string | null = null;
    let testError: string | null = null;

    for (const ipService of ipServices) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const res = await fetch(ipService, {
          // @ts-ignore - client option for Deno.HttpClient
          client,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          // ipify returns { ip: "..." }, httpbin returns { origin: "..." }
          externalIp = data.ip || data.origin || null;
          if (externalIp) {
            // Clean up multiple IPs (httpbin sometimes returns "ip1, ip2")
            externalIp = externalIp.split(",")[0].trim();
            break;
          }
        } else {
          const text = await res.text();
          testError = `HTTP ${res.status}: ${text.substring(0, 200)}`;
        }
      } catch (err: any) {
        testError = err.message || String(err);
        console.warn(`[test-proxy] Service ${ipService} failed:`, testError);
      }
    }

    // Also get our server IP without proxy for comparison
    let serverIp: string | null = null;
    try {
      const serverRes = await fetch("https://api.ipify.org?format=json");
      if (serverRes.ok) {
        const serverData = await serverRes.json();
        serverIp = serverData.ip || null;
      }
    } catch {
      // Non-critical
    }

    if (externalIp) {
      const isProxyWorking = serverIp ? externalIp !== serverIp : true;
      
      console.log(`[test-proxy] Success! Proxy IP: ${externalIp}, Server IP: ${serverIp}, Different: ${isProxyWorking}`);

      return new Response(
        JSON.stringify({
          success: true,
          externalIp,
          serverIp,
          isProxyWorking,
          message: isProxyWorking 
            ? "Proxy está funcionando corretamente" 
            : "Proxy conectou mas IP é o mesmo do servidor (pode ser proxy transparente)",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.error(`[test-proxy] Failed. Last error: ${testError}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: testError || "Não foi possível conectar através do proxy",
          message: "Falha na conexão com o proxy. Verifique host, porta e credenciais.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: any) {
    console.error("[test-proxy] Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || "Erro desconhecido" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
