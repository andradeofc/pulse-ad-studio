

# Monitor de Midia do Catalogo

## Objetivo
Monitorar automaticamente a cada 15 minutos os produtos dentro de conjuntos especificos (agendados + manuais) para detectar perda de video, alertar via webhook (WhatsApp) e opcionalmente reparar automaticamente.

## Escopo -- O que NAO sera alterado
- Nenhuma tabela existente sera modificada (catalog_schedules, campaign_jobs, campaign_job_items, etc.)
- Nenhuma edge function existente sera modificada (process-campaign-jobs, process-catalog-schedules, queue-processor, etc.)
- Nenhuma pagina existente sera modificada (CatalogSchedulingPage, CreateCampaignPage, etc.)
- O fluxo de criacao de campanhas, agendamento de catalogo e processamento de fila continua 100% intacto

## Arquitetura

### 1. Nova tabela: `catalog_media_monitors`

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid PK | Identificador |
| user_id | uuid | Dono do monitoramento |
| profile_id | uuid | Perfil Facebook usado |
| catalog_id | uuid FK | Referencia ao catalogo interno |
| product_set_id | uuid FK | Referencia ao product set interno |
| product_set_name | text | Nome do conjunto (ex: BN928) |
| creative_id | uuid | Criativo para auto-reparo (opcional) |
| is_active | boolean | Toggle ativar/desativar monitoramento |
| auto_repair | boolean | Toggle ativar/desativar reparo automatico |
| webhook_url | text | URL do webhook para alertas (n8n/Make) |
| source | text | 'manual' ou 'schedule' (origem do monitoramento) |
| last_checked_at | timestamp | Ultima verificacao |
| last_issue_at | timestamp | Ultima deteccao de problema |
| issues_found | integer | Total de problemas encontrados |
| created_at | timestamp | Criacao |
| updated_at | timestamp | Atualizacao |

RLS: Todas as operacoes restritas a `user_id = auth.uid()`

### 2. Nova tabela: `catalog_media_alerts`

Historico de alertas detectados.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid PK | Identificador |
| monitor_id | uuid FK | Referencia ao monitor |
| user_id | uuid | Dono |
| retailer_id | text | ID do produto afetado |
| product_name | text | Nome do produto |
| product_set_name | text | Nome do conjunto |
| catalog_name | text | Nome do catalogo |
| alert_type | text | 'video_missing' |
| status | text | 'detected', 'repaired', 'notified', 'ignored' |
| repaired_at | timestamp | Quando foi reparado (se auto-repair ativo) |
| webhook_sent | boolean | Se o webhook foi disparado |
| created_at | timestamp | Criacao |

RLS: SELECT restrito a `user_id = auth.uid()`

### 3. Nova Edge Function: `monitor-catalog-media`

Responsabilidades:
- Buscar todos os monitors com `is_active = true`
- Para cada monitor, consultar `GET /{product_set_id}/products?fields=id,retailer_id,name,video,image_url` na API do Facebook
- Comparar: se um produto tinha video (baseado no ultimo agendamento bem-sucedido) e agora so tem imagem, registrar alerta
- Se `auto_repair = true`, usar a logica de `items_batch` (similar ao process-catalog-schedules) para reenviar o video usando o `creative_id` configurado
- Se `webhook_url` configurada, enviar POST com payload do alerta:

```text
Payload do webhook:
{
  "event": "video_missing",
  "catalog": "Nome do Catalogo",
  "product_set": "BN928",
  "products": [
    { "retailer_id": "ABC123", "name": "Produto X" }
  ],
  "auto_repair": true/false,
  "repaired": true/false,
  "timestamp": "2026-02-13T..."
}
```

Otimizacoes para rate limit:
- Usa apenas endpoints GET (limite separado dos POST de campanhas)
- Processa no maximo 5 monitors por execucao (rotacao)
- Retry com backoff exponencial para 429/500
- Busca credenciais de `facebook_credentials` (mesmo padrao das outras functions)

### 4. Cron Job (pg_cron + pg_net)

Agendar chamada a cada 15 minutos para a edge function `monitor-catalog-media`.

### 5. Nova Pagina: `/monitor-catalogo`

UI com as seguintes secoes:

**Configuracao global:**
- Campo de webhook URL (unico por usuario, usado como padrao)

**Lista de conjuntos monitorados:**
- Tabela com colunas: Conjunto | Catalogo | Origem | Auto-reparo | Status | Ultima verificacao | Acoes
- Toggle de ativo/inativo por item
- Toggle de auto-reparo por item (so aparece se um creative_id estiver vinculado)
- Botao de remover

**Adicionar conjunto manualmente:**
- Fluxo cascata: Perfil -> BM -> Catalogo -> Conjunto (reutilizando a mesma logica da pagina de agendamento)
- Campo para selecionar criativo (para auto-reparo)
- Campo de webhook URL (override opcional)

**Historico de alertas:**
- Tabela com: Data | Conjunto | Catalogo | Produto | Status | Acao
- Filtros por status e data

**Populacao automatica:**
- Ao criar um agendamento na pagina de Agendamento Catalogo, um monitor sera criado automaticamente (source='schedule') se nao existir para aquele product_set
- O creative_id sera preenchido com o criativo usado no agendamento

### 6. Integracao com Agendamento (minima e segura)

A unica alteracao na pagina de agendamento sera: apos criar um schedule com sucesso, inserir um registro em `catalog_media_monitors` (se nao existir). Isso e um INSERT isolado que nao afeta o fluxo existente. Sera feito no `onSuccess` da mutation de criacao, completamente desacoplado.

### 7. Novo item no menu lateral

Adicionar "Monitor Catalogo" na secao "GESTAO DE ANUNCIOS" do sidebar, com icone de escudo/olho (Shield ou Eye).

## Detalhes Tecnicos

### Sequencia de implementacao

1. Migration SQL: criar tabelas `catalog_media_monitors` e `catalog_media_alerts` com RLS
2. Edge function `monitor-catalog-media/index.ts`
3. Registrar no `supabase/config.toml` com `verify_jwt = false`
4. Cron job via pg_cron (INSERT via SQL tool, nao migration)
5. Pagina `/monitor-catalogo` com UI completa
6. Rota no App.tsx
7. Item no sidebar
8. Integracao minima no `onSuccess` do agendamento

### Riscos mitigados

- **Nao quebra campanhas**: Nenhum arquivo de campanha e tocado
- **Nao quebra agendamento**: Unica alteracao e um INSERT adicional no onSuccess (try/catch isolado)
- **Nao estoura rate limit**: Usa GET (limite separado), maximo 5 monitors por execucao, retry com backoff
- **Nao pesa o sistema**: Execucao a cada 15min, sem impacto na UI existente

