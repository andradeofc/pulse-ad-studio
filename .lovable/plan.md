

# Refatoracao DLO: Upload Compartilhado e Batch API

## Objetivo

Substituir o fluxo DLO atual (que faz upload + creative + ad **por anuncio**) por um fluxo otimizado que faz upload de midia **1x por idioma por conta**, cria **1 creative reutilizavel por conta**, e cria os ads via **Batch API**.

## O que muda

1. **Nova funcao `uploadDLOMediaForAccount`** -- faz upload de toda midia DLO 1 vez por ad account, retornando um mapa `locale -> video_id/image_hash`. Usa `url` no endpoint `/adimages` (sem `btoa`). Reutiliza o mesmo ID quando idiomas compartilham a mesma midia.

2. **Nova funcao `buildDLOCreative`** -- monta o `asset_feed_spec` com adlabels e `asset_customization_rules`, cria 1 creative reutilizavel por conta.

3. **Substituicao do bloco `if (isDLO)` no loop de ads (linhas ~2791-2898)** -- em vez de chamar `createDLOCreativeAndAd` sequencialmente por ad, o novo fluxo:
   - Fase 1: Chama `uploadDLOMediaForAccount` (1x, antes dos ads)
   - Fase 2: Chama `buildDLOCreative` (1x, reutilizavel)
   - Fase 3: Cria todos os ads via `executeBatchRequest` em chunks de 30, referenciando o mesmo `creative_id`

4. **Remocao da funcao `createDLOCreativeAndAd`** (linhas 1600-1935) -- substituida pelas 2 novas funcoes + batch inline.

## O que NAO muda

- `buildAdsetParams` (ja tem `is_dynamic_creative`)
- `buildCampaignParams`
- `createNonCatalogAd` (fluxo sem DLO)
- `createCampaignsBatch`, `createAdsetsBatch`, `createCatalogCreativesBatch`, `createAdsBatch`
- Chunked processing / yield logic
- Qualquer logica de catalogo

## Idempotencia

| Dado | Onde salva | Verificacao |
|------|-----------|-------------|
| Media map (locale -> id/hash) | `job.config.savedDLOMedia[accountId]` | Se existe, pula upload |
| Creative ID | `job.config.savedDLOCreativeIds[accountId]` | Se existe, reutiliza |
| Ad ID | `ad_item.config.savedAdId` + `facebook_id` | Se existe, pula criacao |

## Detalhes Tecnicos

### Upload de imagem

Usa `url` direto no `/adimages` (Facebook faz o download):
```text
POST /{act_id}/adimages
  access_token=...
  url=https://storage.example.com/image.jpg
```
Elimina o problema de memoria com `btoa(String.fromCharCode(...))`.

### Estrutura do asset_feed_spec

Mantida identica a implementacao atual (adlabels com prefixo `locale_X`, `asset_customization_rules` por locale). Apenas muda de onde vem os IDs de midia (agora do `mediaMap` compartilhado).

### Batch de ads

Usa `executeBatchRequest` existente com `AD_BATCH_SIZE` (30), mesmo padrao do fluxo de catalogo. Cada ad referencia o mesmo `creative_id` compartilhado.

### Yield checks

- Apos upload de midia (pode levar tempo com videos)
- Entre chunks de ads (igual ao padrao existente)

### Sequencia de implementacao

1. Criar funcao `uploadDLOMediaForAccount` (antes da funcao `createNamingReplacer`, ~linha 1937)
2. Criar funcao `buildDLOCreative` (logo apos)
3. Reescrever bloco `if (isDLO)` nas linhas 2791-2898 para usar o novo fluxo
4. Remover funcao `createDLOCreativeAndAd` (linhas 1600-1935)

