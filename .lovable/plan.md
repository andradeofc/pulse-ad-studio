## Pesquisa Facebook Marketing API

A diferença entre os dois modos de Dynamic Ads (Advantage+ Catalog Ads) é onde o `product_set_id` é vinculado:

### Nível de Campanha (o que já temos hoje)

- `promoted_object` no **AdSet** carrega `product_catalog_id` + `product_set_id`.
- Todos os anúncios do adset herdam o mesmo product set.
- AdCreative usa `template_data` / `object_story_spec` sem `product_set_id` próprio.

### Nível de Anúncio (novo — o que o concorrente faz)

- `promoted_object` no **AdSet** carrega apenas `product_catalog_id` (sem `product_set_id`).
- Cada **AdCreative** define seu próprio `product_set_id` (campo direto no creative, ou via `asset_feed_spec`/`template_data`).
- Permite vários anúncios no mesmo adset apontando para product sets diferentes.
- No Ads Manager, a aba "Catálogo" do adset aparece como "desativada" porque a vinculação está no anúncio — exatamente o comportamento que você observou.

Fontes: Meta docs `ad-promoted-object`, `ad-creative` e Advantage+ Catalog Ads FAQ (v23+ suporta `product_set_id` no creative).

## Mudanças propostas

Escopo deliberadamente cirúrgico — o caminho atual (nível de campanha) continua sendo o **default** e nada muda quando o toggle fica nele.

### 1. `campaignStore.ts`

- Novo campo `catalogScope: 'campaign' | 'ad'` no Step3 (default `'campaign'`).
- Quando `useCatalog=false`, ignorado.

### 2. `Step3Adsets.tsx` (ou onde fica `CatalogSelector`)

- Quando `useCatalog=true`, mostrar um **RadioGroup** com 2 cards:
  - **Nível de Campanha** (recomendado / atual) — "Catálogo e conjunto de produtos configurados no conjunto de anúncios. Todos os anúncios usam o mesmo product set."
  - **Nível de Anúncio** — "Cada anúncio define seu próprio product set. Permite testar product sets diferentes dentro do mesmo conjunto."
- Se `catalogScope='ad'`:
  - Catalog selector continua (precisamos do `product_catalog_id` no adset).
  - **ProductSetSelector vira opcional / é movido para o Step 4 (por anúncio)**. No Step 3 mostramos só info "configurado em cada anúncio".

### 3. `Step4Ads.tsx`

- Quando `useCatalog && catalogScope==='ad'`, adicionar um `ProductSetSelector` por anúncio (ou um seletor global aplicado a todos os anúncios da rodada — preciso confirmar com você qual UX prefere; o concorrente parece usar "um por anúncio").
- Persistir em cada item de criativo: `productSetId` / `productSetName`.

### 4. Backend (`process-campaign-jobs` / payload builder)

- AdSet payload:
  - `catalogScope='campaign'`: `promoted_object = { product_catalog_id, product_set_id }` (igual hoje).
  - `catalogScope='ad'`: `promoted_object = { product_catalog_id }` (sem product_set_id).
- AdCreative payload:
  - `catalogScope='ad'`: incluir `product_set_id` no creative (campo top-level do `/adcreatives`, suportado em v23+ que já usamos).
  - `catalogScope='campaign'`: nenhuma mudança no creative.
- Nomenclatura: `{{conjunto_catalogo}}` continua funcionando — quando ad-level, resolve para o product set específico do anúncio.

### 5. Step5Review

- Mostrar no resumo qual modo foi escolhido + um JSON sample do payload para auditoria (já temos esse padrão).

## Garantias de não-quebra

- Default permanece `'campaign'` → qualquer fluxo existente (incluindo templates salvos) continua idêntico.
- Templates antigos sem `catalogScope` são tratados como `'campaign'`.
- Sem migração de banco — campo só vive no payload do job.
- Sem mudanças em sync, RLS, monitor de catálogo, ou agendamento.

## Pergunta antes de implementar

No modo "Nível de Anúncio", o concorrente permite **um product set diferente por anúncio**, ou aplica **o mesmo product set a todos os anúncios** (só muda a localização técnica do parâmetro)? Isso muda bastante a UX do Step 4. Por padrão vou assumir **um por anúncio** (mais flexível), mas confirma se preferir o modo simples.   
  
Resposta: É o mesmo product set para todos