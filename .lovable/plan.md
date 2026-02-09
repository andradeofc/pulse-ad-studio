
# Dynamic Language Optimization (DLO) - Plano de Implementacao

## Resumo

Adicionar suporte a multiplos idiomas por anuncio (Dynamic Language Optimization) para campanhas sem catalogo. Quando ativado, o sistema usa `asset_feed_spec` com `asset_customization_rules` ao inves de `object_story_spec`, e marca os adsets com `is_dynamic_creative: true`.

## Viabilidade

A feature e 100% viavel. A arquitetura atual ja possui:
- Lista de locales do Facebook no `LocaleSelector.tsx` (reutilizavel)
- Separacao clara entre fluxo catalogo e non-catalog no backend
- Funcao `createNonCatalogAd` isolada e facil de bifurcar
- `buildAdsetParams` com ponto de extensao simples para `is_dynamic_creative`
- Sistema de idempotencia que salva IDs no config do job item

## Escopo das Alteracoes

### 1. Store (`campaignStore.ts`)

Adicionar interface `LanguageConfig` e campo `languageConfig` ao `CampaignConfig`:

```typescript
interface DLOLanguage {
  locale: number;        // Facebook locale ID
  label: string;         // Nome legivel
  mediaId?: string;      // ID do criativo da biblioteca (opcional)
  mediaType?: 'video' | 'image';
  mediaUrl?: string;
  mediaThumbnailUrl?: string;
  useDefaultMedia: boolean;
  websiteUrl?: string;
  headline?: string;
  primaryText?: string;
  description?: string;
}

interface LanguageConfig {
  enabled: boolean;
  defaultLanguage: DLOLanguage;
  secondaryLanguages: DLOLanguage[];
}
```

Valor padrao: `{ enabled: false, defaultLanguage: {...}, secondaryLanguages: [] }`

### 2. Frontend - Novo Componente `DLOLanguageSection.tsx`

Componente renderizado no Step4Ads **apenas quando** `config.useCatalog === false`:

- Toggle "Ativar Idiomas (DLO)" - desativado por padrao
- Quando ativado:
  - Card do idioma padrao com: seletor de locale, campos de texto (primaryText, headline, description), URL, seletor de midia (da biblioteca existente)
  - Botao "Adicionar Idioma" para idiomas secundarios
  - Cada idioma secundario tem checkbox "Usar midia do idioma padrao"
  - Campos vazios nos secundarios = fallback para o padrao (informar visualmente)
  - Maximo 48 idiomas total
- Quando DLO ativado, os campos globais de "Conteudo do Anuncio" (primaryText, headline, description, destinationUrl) ficam desabilitados com aviso de que os valores vem da configuracao DLO

### 3. Modificacoes no Step4Ads

- Importar e renderizar `DLOLanguageSection` condicionalmente (`!config.useCatalog`)
- Quando DLO ativado, ocultar/desabilitar a secao "Conteudo do Anuncio" global (os textos vem de cada idioma)
- A URL de destino global e substituida pelas URLs por idioma

### 4. Validacao (`useStepValidation.ts`)

Quando `languageConfig.enabled === true`:
- Idioma padrao deve ter locale selecionado
- Idioma padrao deve ter primaryText, headline e websiteUrl preenchidos
- Pelo menos 1 idioma secundario adicionado
- Cada idioma secundario deve ter locale selecionado (unico)
- Se `useDefaultMedia === false`, o secundario deve ter midia selecionada

### 5. Review (`Step5Review.tsx`)

Adicionar secao "Idiomas (DLO)" mostrando:
- Idioma padrao com seus textos
- Lista de idiomas secundarios
- Indicacao de quais usam midia/textos do padrao

### 6. Backend - Edge Function `process-campaign-jobs`

#### 6a. `buildAdsetParams` - Adicionar `is_dynamic_creative`

```typescript
if (config.languageConfig?.enabled) {
  params.is_dynamic_creative = 'true';
}
```

#### 6b. Nova funcao `createDLOCreativeAndAd`

Funcao separada da `createNonCatalogAd` para o fluxo DLO:

1. **Upload de midias unicas**: Para cada idioma que tem midia propria, fazer upload (video via `/advideos` ou imagem). Salvar IDs no config do item para idempotencia.
2. **Construir `asset_feed_spec`**:
   - Array `bodies` com adlabels por idioma
   - Array `titles` com adlabels por idioma  
   - Array `videos` ou `images` com adlabels por idioma
   - Array `link_urls` com adlabels por idioma
   - Array `descriptions` com adlabels (se houver)
   - `call_to_action_types`: [config.ctaType]
   - `ad_formats`: ["SINGLE_VIDEO"] ou ["SINGLE_IMAGE"]
   - `asset_customization_rules`: mapeamento locale -> labels
3. **Criar creative** com `asset_feed_spec` + `object_story_spec` (apenas page_id e instagram_actor_id)
4. **Criar ad** com o creative_id

#### 6c. Bifurcacao no fluxo principal

No bloco de criacao de non-catalog ads (linha ~2450), adicionar:

```
if (config.languageConfig?.enabled) {
  // Usar createDLOCreativeAndAd
} else {
  // Fluxo existente com createNonCatalogAd
}
```

#### 6d. Idempotencia

Salvar no `config` do job item:
- `savedVideoIds`: Map de locale -> videoId (para evitar re-upload)
- `savedCreativeId`: ID do creative DLO criado
- `savedAdId`: ID do ad criado

### 7. Sequencia de Implementacao

| Ordem | Tarefa | Arquivo |
|-------|--------|---------|
| 1 | Adicionar `LanguageConfig` ao store | `campaignStore.ts` |
| 2 | Criar componente `DLOLanguageSection` | `components/campaign/DLOLanguageSection.tsx` |
| 3 | Integrar no Step4Ads | `steps/Step4Ads.tsx` |
| 4 | Atualizar validacao | `useStepValidation.ts` |
| 5 | Atualizar review | `steps/Step5Review.tsx` |
| 6 | Adicionar `is_dynamic_creative` ao buildAdsetParams | `process-campaign-jobs/index.ts` |
| 7 | Criar funcao `createDLOCreativeAndAd` | `process-campaign-jobs/index.ts` |
| 8 | Bifurcar fluxo no loop principal | `process-campaign-jobs/index.ts` |

## Secao Tecnica

### Estrutura do asset_feed_spec (exemplo com 2 idiomas)

```text
asset_feed_spec:
  bodies: [{text, adlabels:[{name:"pt_body"}]}, {text, adlabels:[{name:"en_body"}]}]
  titles: [{text, adlabels:[{name:"pt_title"}]}, {text, adlabels:[{name:"en_title"}]}]
  videos: [{video_id, thumbnail_hash, adlabels:[{name:"pt_video"}]}, ...]
  link_urls: [{website_url, adlabels:[{name:"pt_url"}]}, ...]
  call_to_action_types: ["LEARN_MORE"]
  ad_formats: ["SINGLE_VIDEO"]
  asset_customization_rules:
    - customization_spec: {locales: [24]}, body_label/title_label/video_label/link_url_label -> pt_*
    - customization_spec: {locales: [6]}, body_label/title_label/video_label/link_url_label -> en_*

object_story_spec: {page_id, instagram_actor_id}  // apenas IDs de pagina
```

### Impacto zero no fluxo existente

- Quando `languageConfig.enabled === false` (padrao) ou `useCatalog === true`: nenhuma alteracao no comportamento atual
- `is_dynamic_creative` so e adicionado ao adset quando DLO esta ativo
- `createNonCatalogAd` permanece intacta

### Limitacoes conhecidas

- Maximo 48 idiomas por anuncio (limite do Facebook)
- Funciona apenas com single image ou single video (sem carousel)
- Nao funciona com catalogo (enforced no frontend)
- Placements suportados: Feed, Stories, Reels, Explore, Audience Network
