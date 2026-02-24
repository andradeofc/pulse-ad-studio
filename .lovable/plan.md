

# Sistema de Colaboradores - Plano Enterprise

## Resumo Executivo

Permitir que usuarios do plano Enterprise adicionem ate 3 colaboradores que compartilham todos os recursos da conta principal (perfis Facebook, contas de anuncio, catalogos, campanhas, criativos, etc). Cada colaborador tera login proprio com senha padrao `adstormenterprise`, podendo alterar depois.

## Arquitetura da Solucao

### Principio Central: "Effective User ID"

O sistema inteiro hoje funciona via RLS com `auth.uid()`. Para que colaboradores vejam os dados do dono, precisamos de uma abordagem que **nao altere nenhuma RLS existente**. A estrategia:

1. Criar uma tabela `team_members` que mapeia colaborador -> dono
2. Criar uma funcao SQL `effective_user_id()` que retorna:
   - Se o usuario e colaborador: retorna o `user_id` do dono (master)
   - Senao: retorna `auth.uid()` (comportamento normal)
3. Adicionar **novas politicas RLS** (sem remover as existentes) que permitem colaboradores acessarem dados do dono
4. Nas insercoes de dados (codigo frontend), usar o `effective_user_id` para que dados criados pelo colaborador pertencam ao dono

### Por que essa abordagem e segura

- Nenhuma politica RLS existente e alterada ou removida
- Usuarios normais (Starter/Pro) continuam funcionando exatamente como antes
- A funcao `effective_user_id()` e `SECURITY DEFINER`, impossivel de manipular pelo cliente
- Colaboradores sao criados via Edge Function com `service_role`, nao pelo signup publico

---

## Fase 1: Banco de Dados (Migrations SQL)

### 1.1 Tabela `team_members`

```text
team_members
  id            uuid (PK)
  owner_id      uuid (NOT NULL) -- usuario master (Enterprise)
  member_id     uuid (NOT NULL) -- usuario colaborador (referencia auth.users)
  email         text (NOT NULL) -- email do colaborador
  invited_at    timestamptz
  accepted_at   timestamptz
  status        text ('active', 'removed') default 'active'
  created_at    timestamptz
  
  UNIQUE(owner_id, email)
```

- RLS: Dono pode SELECT/INSERT/UPDATE/DELETE seus proprios registros
- Colaborador pode ver registros onde ele e `member_id`

### 1.2 Funcao `effective_user_id()`

```text
Funcao SECURITY DEFINER que:
1. Verifica se auth.uid() existe em team_members como member_id com status 'active'
2. Se sim, retorna o owner_id correspondente
3. Se nao, retorna auth.uid()
```

### 1.3 Funcao `is_team_member_of(owner_uuid)`

Funcao auxiliar SECURITY DEFINER que verifica se o usuario logado e colaborador do owner especificado.

### 1.4 Novas politicas RLS (ADICIONAR, sem remover existentes)

Para cada tabela que usa `user_id = auth.uid()`, adicionar uma politica **adicional** do tipo:

```text
"Team members can view owner data"
FOR SELECT USING (user_id = effective_user_id())
```

Tabelas afetadas (somente SELECT adicional):
- `facebook_profiles` 
- `campaign_jobs`
- `campaign_templates`
- `creatives`
- `creative_folders`
- `naming_presets`
- `naming_variables`
- `user_zapi_settings`
- `user_ad_usage`
- `catalog_schedules`
- `catalog_media_monitors`
- `catalog_media_alerts`
- `rate_limit_tracking`

Para tabelas que usam `profile_id` via join (facebook_ad_accounts, facebook_pages, facebook_pixels, facebook_catalogs, facebook_product_sets, facebook_business_managers), a politica adicional fara join via `facebook_profiles` usando `effective_user_id()`.

Tambem precisamos de politicas de INSERT/UPDATE/DELETE para colaboradores nas tabelas onde eles precisam executar acoes (criar campanhas, upload de criativos, etc).

### 1.5 Limite de colaboradores

Validado na Edge Function de criacao (max 3 por owner Enterprise).

---

## Fase 2: Edge Function `manage-team-members`

Nova Edge Function que gerencia colaboradores:

**Acoes:**
- `invite` - Cria conta do colaborador (via admin API) com senha padrao `adstormenterprise`, insere em `team_members`
- `remove` - Marca colaborador como `removed`, desativa a conta
- `list` - Lista colaboradores do dono

**Validacoes:**
- Verifica se o usuario que chama e plano Enterprise
- Verifica limite de 3 colaboradores
- Verifica se email ja esta em uso
- Cria `user_profile` para o colaborador com plano `collaborator` (novo valor)

---

## Fase 3: Frontend

### 3.1 Novo componente `TeamSettings.tsx`

Componente nas Configuracoes (nova aba "Equipe") visivel somente para usuarios Enterprise:
- Lista colaboradores existentes (nome, email, status, data de convite)
- Botao "Adicionar Colaborador" com campo de email
- Botao "Remover" para cada colaborador
- Indicador de slots usados (ex: 2/3 colaboradores)
- Aviso informando a senha padrao

### 3.2 Modificacao em `SettingsPage.tsx`

- Adicionar aba "Equipe" (icone Users) condicionalmente quando `plan === 'enterprise'`
- Buscar plano do usuario do banco para decisao (nao confiar no store local)

### 3.3 Hook `useEffectiveUserId`

Novo hook que:
1. Consulta `team_members` para verificar se o usuario logado e colaborador
2. Se sim, retorna o `owner_id` como user_id efetivo
3. Se nao, retorna o `auth.uid()` normal
4. Cacheia o resultado via React Query

### 3.4 Ajuste nos hooks de insercao de dados

Os seguintes hooks precisam usar `effective_user_id` ao inserir dados:
- `useCampaignJobs.ts` - `user_id` na insercao de campaign_jobs
- `useNamingPresets.ts` - `user_id` na insercao de presets e variables
- `useCampaignTemplates.ts` - `user_id` na insercao de templates

Esses sao os unicos locais no frontend que fazem INSERT com `user_id` explicito. As demais tabelas (facebook_profiles, creatives, etc) sao populadas por Edge Functions que ja usam o user_id da sessao.

### 3.5 Ajuste nas Edge Functions que inserem dados

Edge Functions que fazem insert com `user_id` precisam resolver o effective_user_id:
- `facebook-add-profile` 
- `facebook-sync-*` (accounts, pages, pixels, catalogs, etc)
- `process-campaign-jobs`
- `monitor-catalog-media`

Esses devem chamar `effective_user_id()` via RPC ou fazer lookup em `team_members` antes de inserir.

---

## Fase 4: Seguranca e Restricoes para Colaboradores

### O que o colaborador PODE fazer:
- Ver todos os dados do dono (perfis, contas, campanhas, criativos)
- Criar campanhas (ficam vinculadas ao dono)
- Upload de criativos (ficam vinculados ao dono)
- Agendar catalogos
- Ver fila de processamento

### O que o colaborador NAO pode fazer:
- Acessar Configuracoes de Plano/Faturamento
- Adicionar/remover outros colaboradores
- Alterar perfis do Facebook do dono
- Acessar o Ops Center (admin)

### Identificacao visual
- No header do dashboard, mostrar um badge "Colaborador de [Nome do Dono]" quando o usuario logado for colaborador

---

## Resumo de Arquivos

| Acao | Arquivo | Descricao |
|------|---------|-----------|
| Migration SQL | Nova migration | Tabela team_members, funcoes effective_user_id() e is_team_member_of(), novas politicas RLS |
| Criar | `supabase/functions/manage-team-members/index.ts` | Edge Function para CRUD de colaboradores |
| Criar | `src/components/settings/TeamSettings.tsx` | UI de gestao de equipe |
| Criar | `src/hooks/useEffectiveUserId.ts` | Hook para resolver user_id efetivo |
| Criar | `src/hooks/useTeamMembers.ts` | Hook para listar/gerenciar colaboradores |
| Editar | `src/pages/dashboard/SettingsPage.tsx` | Adicionar aba Equipe (condicional Enterprise) |
| Editar | `src/hooks/useCampaignJobs.ts` | Usar effective_user_id no INSERT |
| Editar | `src/hooks/useNamingPresets.ts` | Usar effective_user_id no INSERT |
| Editar | `src/hooks/useCampaignTemplates.ts` | Usar effective_user_id no INSERT |
| Editar | `src/components/layout/DashboardHeader.tsx` | Badge de colaborador |
| Editar | Edge Functions de sync | Resolver effective_user_id |

## Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|----------|
| Quebrar RLS existente | Somente ADICIONAR novas politicas, nunca alterar/remover existentes |
| Performance das queries | `effective_user_id()` faz um unico SELECT simples com indice unico |
| Colaborador se auto-promover | Funcao SECURITY DEFINER impede manipulacao client-side |
| Conflito de sessoes | Cada colaborador tem conta propria, sem conflito de tokens |
| Dados orfaos ao remover colaborador | Dados ja pertencem ao dono (owner_id), remocao so desativa acesso |

## Ordem de Implementacao

1. Migration SQL (tabela + funcoes + RLS) -- fundacao
2. Edge Function manage-team-members -- backend
3. Hook useEffectiveUserId -- infraestrutura frontend
4. TeamSettings + aba nas Configuracoes -- UI
5. Ajustes nos hooks de INSERT -- vinculacao correta
6. Badge de colaborador no header -- UX
7. Testes end-to-end

