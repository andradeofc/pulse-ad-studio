
# Plano: Wizard profissional de "Adicionar Perfil" (paridade + superação vs DirectAds)

Objetivo: substituir o fluxo atual de adicionar perfil (cola token e pronto) por um **wizard de 3 etapas** com **App ID + App Secret + Token**, **troca automática para long-lived (60 dias)**, **teste de proxy integrado** e **progresso em tempo real (SSE de 8 etapas)** — sem quebrar nada do que já existe.

## Princípio de não-quebrar nada

- Todos os campos novos (`app_id`, `app_secret`, `auth_method`, etc.) entram como **NULLABLE** com defaults seguros.
- O fluxo antigo (`facebook-add-profile` com só `accessToken`) continua funcionando como fallback / modo "System User" (BETA, igual o concorrente).
- Edge functions existentes (`facebook-sync-*`, `facebook-update-proxy`, `test-proxy-connection`) **não mudam de assinatura** — apenas serão **orquestradas** por um novo endpoint.
- Nenhuma alteração em `campaign_jobs`, `process-campaign-jobs`, sync de catálogos ou qualquer fluxo de criação de campanha.

---

## Etapa 1 — Banco de dados (migração aditiva)

Adicionar em `facebook_profiles`:
- `app_id TEXT NULL` — App ID do FB
- `app_secret TEXT NULL` — App Secret (criptografado em repouso pelo Postgres)
- `app_name TEXT NULL` — nome do app retornado pelo `/debug_token`
- `auth_method TEXT NOT NULL DEFAULT 'token_only'` — `'facebook_app'` | `'token_only'` (System User BETA)
- `token_status TEXT NOT NULL DEFAULT 'unknown'` — `VALID` | `EXPIRED` | `API_BLOCKED` | `RATE_LIMITED`
- `token_check_error TEXT NULL` — última mensagem de erro do FB
- `token_check_error_code TEXT NULL`
- `last_token_check_at TIMESTAMPTZ NULL`
- `rate_limited_until TIMESTAMPTZ NULL`
- `rate_limit_count INTEGER NOT NULL DEFAULT 0`
- `is_long_lived BOOLEAN NOT NULL DEFAULT false`

Nova tabela `facebook_profile_tasks` (rastreia o progresso do wizard, igual o concorrente):
- `id UUID PK`
- `user_id UUID` (RLS por dono)
- `task_type TEXT` (`add_profile`, `refresh_token`)
- `status TEXT` (`pending`, `running`, `completed`, `failed`)
- `current_step INTEGER`, `total_steps INTEGER`
- `progress JSONB` — array de eventos `{step, message, detail, params, timestamp}`
- `result JSONB` — `{profile_id, accounts_count, pages_count, bms_count}`
- `error TEXT NULL`
- timestamps

RLS: dono via `auth.uid() = user_id`. Realtime habilitado nesta tabela.

---

## Etapa 2 — Edge functions

### 2.1 `facebook-validate-credentials` (NOVA)
Substitui parcialmente `facebook-validate-token` quando o usuário fornece App ID/Secret. Retorna:
```
{ valid, userId, userName, scopes, expiresAt, isShortLived, appName }
```
Usa `appsecret_proof` (hash HMAC) — boa prática que o FB recomenda e que reduz erros 190.

### 2.2 `facebook-exchange-token` (NOVA) ⭐
O pulo do gato:
```
GET /oauth/access_token?grant_type=fb_exchange_token
  &client_id={app_id}&client_secret={app_secret}
  &fb_exchange_token={short_token}
```
Recebe `{ profileId | credentials, shortToken }`, devolve `{ accessToken, tokenType, isLongLived: true, expiresAt }` (~60 dias). Atualiza o perfil se `profileId` for passado.

### 2.3 `facebook-add-profile-orchestrator` (NOVA)
Endpoint principal que cria a "task" e processa em **background** (`EdgeRuntime.waitUntil`) as 8 etapas:

1. `validatingToken` — chama `/debug_token`
2. `verifyingAccount` — checa duplicidade por `facebook_id`
3. `configuringToken` — troca para long-lived (se `auth_method = 'facebook_app'`)
4. `creatingAccount` — INSERT em `facebook_profiles`
5. `fetchingAdAccounts` + `savingAccounts` (em chunks de 15) — reusa `facebook-sync-accounts`
6. `syncingBMs` — reusa `facebook-sync-business-managers`
7. `syncingPages` — reusa `facebook-sync-pages`
8. `completed` — escreve `result` na task

Cada etapa faz UPDATE em `facebook_profile_tasks.progress` (append JSONB) → frontend recebe via **Supabase Realtime** (zero polling, alinhado com a memória "Sync Architecture").

### 2.4 `facebook-refresh-token` (NOVA, bônus)
Cron diário: para perfis com `auth_method = 'facebook_app'` cujo token vence em <7 dias, refaz `exchange-token` automaticamente. **Resolve o problema crônico de tokens expirando.**

### 2.5 Funções já existentes — não tocar em assinatura
`test-proxy-connection`, `facebook-update-proxy`, `facebook-sync-accounts`, `facebook-sync-pages`, `facebook-sync-business-managers`, `facebook-sync-pixels`, `facebook-delete-profile` continuam exatamente iguais.

---

## Etapa 3 — Frontend (Wizard)

Novo componente `AddProfileWizard.tsx` (modal `Dialog` shadcn) com **3 sub-etapas** no sidebar esquerdo, como no print:

### Step 1 — Proxy (opcional mas recomendado)
- Formulário: Protocolo (HTTP/HTTPS/SOCKS5), Host, Porta, Usuário, Senha
- Botão "Testar Conexão" → chama `test-proxy-connection` → mostra `responseTime` + `externalIp`
- Card lateral com link "Webshare" e dica de proxy residencial
- Botão "Continuar" (proxy salvo em memória, persistido no Step 4 junto com o perfil)

### Step 2 — Credenciais
- **Duas abas (tabs):**
  - **"Facebook App"** (padrão, recomendado): App ID + App Secret + Token. Faz `validate-credentials` ao colar token; mostra card verde "Credenciais válidas! Conectado como: {nome}".
  - **"System User" (BETA)**: só token (fluxo atual). Disclaimer: "Ideal para BMs centralizadas ou perfis com problemas de publicação".
- Link contextual para `developers.facebook.com/apps` e `developers.facebook.com/tools/explorer`
- Botão "Validar Credenciais e Sincronizar Perfil" → cria a task e abre Step 3.

### Step 3 — Sincronização em tempo real
- Substitui o spinner genérico. Stepper visual de 8 etapas (igual ao SSE do concorrente).
- Subscreve via **Supabase Realtime** em `facebook_profile_tasks` filtrado por `task_id`.
- Renderiza:
  - Barra de progresso `step/total` (`5/8`)
  - Mensagem traduzida (pt-BR): "Salvando contas (16–30 de 37)..."
  - Ícone ✅ por etapa concluída, ⏳ na atual, ⚪ pendente
- Ao receber evento `completed`, mostra resumo: "37 contas, 7 BMs, 16 páginas" + botão "Concluir".
- Se `failed`, mostra mensagem + botão "Tentar Novamente" (reusa a mesma task).

### Substituição cirúrgica
- `FacebookProfilesPage.tsx` apenas troca o handler do botão "Adicionar Perfil" para abrir `<AddProfileWizard />`.
- O componente antigo (input de token simples) vira o conteúdo da aba "System User" → **zero código deletado**, só refatorado.

---

## Etapa 4 — UI/Status reativo (lista de perfis)

Adicionar à lista de perfis (sem refatorar):
- Badge de `token_status`: 🟢 VALID / 🟡 EXPIRA EM 5D / 🔴 EXPIRED / ⛔ API_BLOCKED
- Tooltip mostrando `token_check_error` em português
- Indicador "60 dias" vs "Short-lived ⚠️" baseado em `is_long_lived`
- Botão "Renovar token" (só aparece se `auth_method = 'facebook_app'`)

---

## Diferenciais nossos (onde superamos eles)

1. **Realtime nativo** (Supabase) em vez de SSE caseiro → mais robusto a desconexão.
2. **Refresh automático via cron** — eles não têm isso aparente; nós resolvemos antes do token expirar.
3. **Mantemos nossa arquitetura paralela** (Batch API 50, sync paralelo) — eles processam em chunks sequenciais de 15.
4. **Persistência de task** — se o usuário fechar o modal, a sincronização continua e ele vê o resultado depois (eles perdem o progresso ao desconectar o SSE).

---

## Ordem de implementação (sem riscos)

1. ✅ Migração do banco (campos NULLABLE + tabela `facebook_profile_tasks`)
2. ✅ Edge functions novas (`validate-credentials`, `exchange-token`, `add-profile-orchestrator`)
3. ✅ Componente `AddProfileWizard` com as 3 etapas
4. ✅ Substituição do botão em `FacebookProfilesPage` (1 linha)
5. ✅ Badges de status na lista
6. ✅ Cron de refresh automático (último, pode ir em release separada)

Cada passo é independente e o fluxo antigo continua funcional até o passo 4.

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| App Secret em texto plano no banco | Postgres já criptografa em repouso; RLS restringe a `auth.uid()`; mascarado no frontend |
| Token long-lived ainda expira em 60d | Cron de refresh + badge "expira em Xd" + email/notificação 7d antes |
| Usuário sem App próprio do FB | Aba "System User" (BETA) mantida — fluxo atual intacto |
| Realtime cair | Fallback: polling de 3s só no Step 3 enquanto o modal está aberto |

---

## Estimativa

- Etapa 1 (DB): 1 migração
- Etapa 2 (Edge): 3 funções novas + 1 cron
- Etapa 3 (Frontend): 1 wizard + ~4 sub-componentes
- Etapa 4 (Badges): edição localizada em `FacebookProfilesPage`

Tudo aditivo. **Zero breaking changes** no resto do sistema (campanhas, jobs, catálogos, sync existente).

Posso começar pela **Etapa 1 (migração)** assim que você aprovar?
