

## Plano: Yield intra-batch nas funcoes de criacao

### Problema
Os 3 checkpoints de yield existentes ficam **entre** as fases (apos campanhas, apos adsets, apos cada conta). Se uma fase individual (ex: 500 adsets = 17 batches) demorar mais de 90s por rate limiting ou rede lenta, a funcao estoura o timeout antes de atingir um checkpoint.

### Solucao
Passar `shouldYield` como parametro para as 4 funcoes de batch e adicionar um check no inicio de cada iteracao do loop de chunks. Quando o tempo estoura, o loop faz `break` e retorna o que ja processou.

### Mudancas (arquivo unico: `process-campaign-jobs/index.ts`)

**1. `createCampaignsBatch` — adicionar parametro e check**
- Adicionar `shouldYield?: () => boolean` como ultimo parametro
- No loop `for (const chunk of chunks)`, adicionar no inicio:
```text
if (shouldYield?.()) {
  console.log(`[batch] Time limit approaching, yielding after ${idMap.size} campaigns`);
  break;
}
```

**2. `createAdsetsBatch` — mesmo padrao**
- Adicionar `shouldYield?: () => boolean` como ultimo parametro
- Mesmo check no loop de chunks

**3. `createCatalogCreativesBatch` — mesmo padrao**
- Adicionar `shouldYield?: () => boolean` como ultimo parametro
- Mesmo check no loop de chunks

**4. `createAdsBatch` — mesmo padrao**
- Adicionar `shouldYield?: () => boolean` como ultimo parametro
- Mesmo check no loop de chunks (no loop principal, nao no loop de retry)

**5. Chamadas no fluxo principal — passar `shouldYield`**
- Atualizar as 4 chamadas (~linhas 2216, 2281, 2359, 2372) para passar `shouldYield` como argumento adicional

### Por que funciona sem mais nada

- Cada item e salvo no DB com `facebook_id` imediatamente apos criacao dentro do loop
- O `break` faz a funcao retornar um `idMap` parcial (apenas itens ja criados)
- O fluxo principal chega no proximo `shouldYield()` checkpoint e chama `yieldChunk()`
- Na proxima invocacao, filtros de `pending + !facebook_id` pulam automaticamente os itens ja processados
- A idempotencia existente garante zero duplicatas

### O que NAO muda

- Nenhuma mudanca na logica de yield/resume do fluxo principal
- Nenhuma mudanca no `queue-processor`
- Nenhuma mudanca na estrutura do banco de dados
- O parametro e opcional (`shouldYield?.()`) para manter compatibilidade

### Detalhes tecnicos

Total de linhas alteradas: ~20 linhas distribuidas em 4 funcoes + 4 chamadas.

Assinatura das funcoes apos mudanca (exemplo com `createAdsetsBatch`):
```text
async function createAdsetsBatch(
  accessToken: string,
  adAccountId: string,
  adsets: Array<...>,
  campaignIdMap: Map<string, string>,
  config: Record<string, any>,
  supabase: any,
  shouldYield?: () => boolean,  // NOVO
): Promise<Map<string, string>>
```

Check dentro do loop:
```text
for (const chunk of chunks) {
  if (shouldYield?.()) {
    console.log(`[batch] Time limit approaching, yielding after ${idMap.size} items`);
    break;
  }
  // ... resto do processamento existente
}
```

