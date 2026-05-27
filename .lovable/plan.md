# Paralelização de Contas + Visualizador de Logs

Vou aplicar duas mudanças complementares, ambas com chaves de segurança para reverter em segundos se algo der errado.

---

## Parte 1 — Paralelização de contas (process-campaign-jobs)

### Estratégia escolhida: Wave-based parallelism com feature flag

Por que não `Promise.all` puro: o corpo do loop atual tem ~665 linhas, usa estado compartilhado (`totalAdsCreated`, `hasError`, `lastError`), faz `return yieldChunk(...)` no meio (sai da função inteira) e usa `continue` em erro fatal de conta. Tudo isso quebra em paralelo cru.

### O que muda

1. **Constante de concorrência** no topo do arquivo:
   ```ts
   const ACCOUNT_CONCURRENCY = parseInt(Deno.env.get('ACCOUNT_CONCURRENCY') ?? '3', 10);
   ```
   Padrão **3** (seguro — bem abaixo do limite de proxy/rede). Pode virar `1` por env var sem deploy se algo quebrar = volta ao comportamento atual.

2. **Extração do corpo do loop** em uma função interna `processAccount(currentAccount, accountIndex)` que retorna:
   ```ts
   { adsCreated: number; error?: string; yieldRequested?: { reason: string } }
   ```
   - `return yieldChunk(...)` vira `return { yieldRequested: { reason }, adsCreated }` (não sai mais da função-mãe — apenas sinaliza).
   - `continue` em erro fatal vira `return { error, adsCreated }`.
   - Variáveis locais (`resolvedPages`, `defaultPageId`, `defaultInstagramUserId`, `replaceNamingVariables`, `accessToken`, `campaignIdMap`, `adsetIdMap`) ficam **dentro** da função → isolamento total entre contas em paralelo.

3. **Runner por ondas** substitui o `for`:
   ```ts
   for (let i = 0; i < allAdAccounts.length; i += ACCOUNT_CONCURRENCY) {
     const wave = allAdAccounts.slice(i, i + ACCOUNT_CONCURRENCY);
     const results = await Promise.allSettled(
       wave.map((acc, k) => processAccount(acc, i + k))
     );
     // agregar adsCreated, hasError, lastError; se algum pediu yield, faz yieldChunk APÓS a onda
     if (results.some(r => r.status === 'fulfilled' && r.value.yieldRequested)) {
       return yieldChunk('Yield após onda paralela');
     }
   }
   ```
   `allSettled` garante que um erro em uma conta **não cancela** as outras (pedido seu — equivalente ao retry de adsets que já funciona).

4. **Proxy isolado por conta**: o global `activeProxyClient` deixa de ser usado como fallback (já não é — todos os 9 call sites passam `client:` explicitamente). Cada `processAccount` busca seu próprio `httpClient` via `getProxyClientForProfile` e passa adiante. Zero corrida.

5. **Rate limit**: o `shouldPauseForRateLimit(accountId)` em `fetchWithRetry` já é **por conta** (Map indexado por `accountId`). Como cada onda processa contas diferentes, não há contenção. O `X-Ad-Account-Usage` do Facebook também é independente por conta — então paralelizar contas diferentes **não aumenta risco de rate limit** (mesma justificativa que validamos na resposta anterior).

### Logs estruturados (para eu acompanhar)

Adiciono prefixos consistentes para filtrar facilmente:
```
[WAVE 1/2] Starting 3 accounts in parallel: SC2-71, SC2-72, SC2-73
[ACCOUNT-PAR SC2-71] Starting (proxy: ACTIVE)
[ACCOUNT-PAR SC2-71] Campaigns: 2/2 created in 12s
[ACCOUNT-PAR SC2-71] Adsets: 100/100 in 45s
[ACCOUNT-PAR SC2-71] Ads: 95/100 in 38s (5 failed → retry pool)
[ACCOUNT-PAR SC2-71] DONE in 95s (95 ads)
[WAVE 1/2] Completed in 102s — adsCreated=287, errors=0
```
Quando você criar uma campanha, eu filtro por `[WAVE` e `[ACCOUNT-PAR` para te dar um relatório limpo.

### O que NÃO muda (zero risco)

- Toda a lógica de criação de campanha/adset/ad/creative.
- Batch API, retry, idempotência (`facebook_id` check).
- `yieldChunk` e re-invoke automático (OPT-A).
- `Skip PBIA when no page token` (OPT-B).
- Ordem dentro de cada conta (campanha → adset → ad → ativação) permanece **estritamente sequencial** — atende a regra do projeto.
- Reprocessamento, atribuição de erros, fila, UI.

---

## Parte 2 — Visualizador de logs no app

Adiciono na rota `/fila-processamento` (na tela de detalhes do job) um botão **"Ver logs em tempo real"** que abre um drawer com:

- Logs filtrados pelo `job_id` da campanha (últimos 5 min, auto-refresh a cada 5s).
- Filtros rápidos: `Tudo`, `Erros`, `Warnings`, `Por conta` (dropdown).
- Cor por nível (info/warn/error) e timestamp em BRT.
- Botão "Copiar para análise" — copia em formato Markdown que eu posso colar.

### Como funciona

- Nova edge function `get-job-logs` (somente leitura, admin/owner) que chama a Analytics API do Supabase (`function_edge_logs`) filtrando pelo `job_id`.
- Componente `JobLogsDrawer.tsx` consumindo via `supabase.functions.invoke`.
- RLS: só dono do job ou admin.

Você poderá dizer **"olha os logs da #xxxx"** e eu uso a mesma fonte (`supabase--edge_function_logs`) que já tenho — só fica mais fácil para você visualizar em paralelo comigo.

---

## Plano de rollout

1. Implemento Parte 1 com `ACCOUNT_CONCURRENCY=3` (default).
2. Implemento Parte 2 (logs viewer).
3. Você testa com #teste-paralelo.
4. Se algo der errado: defino `ACCOUNT_CONCURRENCY=1` via Supabase secrets → comportamento atual restaurado **sem deploy**.

## Ganho esperado

- Hoje: ~20 min (4 contas × ~5 min sequencial)
- Com `CONCURRENCY=3`: ~7-8 min (2 ondas: 3 + 1)
- Com `CONCURRENCY=4`: ~5-6 min (1 onda de 4)
