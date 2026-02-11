

# Plano: Profissionalizar a Pagina de Usuarios do Ops Center

## Problemas Identificados

### Bugs Criticos (Dados Incorretos)

1. **Contagens de Facebook Accounts e Ad Accounts falhando**: As queries para contar `facebook_profiles`, `facebook_ad_accounts` e `campaign_jobs` de outros usuarios falham porque as politicas RLS restringem acesso apenas ao dono dos dados. O admin ve 0 para todos os usuarios exceto ele mesmo.

2. **Ad Accounts e Gasto Total sem filtro por usuario**: As queries nas linhas 161 e 163 nao filtram por `user_id`, contando TODOS os registros do sistema ao inves de por usuario. O campo `facebook_ad_accounts` usa `profile_id` (nao `user_id`), entao precisa de um join via `facebook_profiles`.

3. **Criar Usuario desloga o admin**: A mutation `createUserMutation` usa `supabase.auth.signUp()` que altera a sessao atual, deslogando o admin. Precisa usar uma Edge Function com `service_role` para criar usuarios sem afetar a sessao.

### Funcionalidades Nao Implementadas (Botoes que Nao Fazem Nada)

4. **"Exportar CSV"** - Sem onClick handler
5. **"Alterar Senha"** - Sem onClick handler
6. **"Resetar Senha"** - Sem onClick handler
7. **"Login como Usuario" (Impersonate)** - Sem onClick handler
8. **"Deletar Conta"** - Sem onClick handler
9. **"Ver Detalhes"** - Link para rota `/ops-center/usuarios/:id` que provavelmente nao existe

### Melhorias de Profissionalismo

10. **Busca por email nao funciona**: O campo de busca diz "Buscar por nome, email ou ID" mas `email` nao existe na tabela `user_profiles`
11. **Loading state basico**: Apenas texto "Carregando..." ao inves de skeletons
12. **Sem metricas resumidas no topo**: Cards com total de usuarios, ativos, novos no mes, etc.
13. **IP de auditoria sempre "unknown"**: Nao captura IP real

---

## Plano de Implementacao

### Fase 1: Corrigir Dados (RLS + Queries)

**Criar uma funcao database `get_admin_user_stats`** (security definer) que retorna as contagens de cada usuario sem restricao de RLS. Isso evita N+1 queries e resolve o problema de permissao.

```sql
CREATE OR REPLACE FUNCTION get_admin_user_stats(target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result json;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  SELECT json_build_object(
    'fb_accounts_count', (SELECT count(*) FROM facebook_profiles WHERE user_id = target_user_id),
    'ad_accounts_count', (SELECT count(*) FROM facebook_ad_accounts a JOIN facebook_profiles p ON p.id = a.profile_id WHERE p.user_id = target_user_id),
    'campaigns_count', (SELECT count(*) FROM campaign_jobs WHERE user_id = target_user_id),
    'total_spend', COALESCE((SELECT sum(a.amount_spent) FROM facebook_ad_accounts a JOIN facebook_profiles p ON p.id = a.profile_id WHERE p.user_id = target_user_id), 0)
  ) INTO result;
  
  RETURN result;
END;
$$;
```

Atualizar `AdminUsersPage.tsx` para usar essa funcao RPC no enriquecimento dos dados.

### Fase 2: Edge Function para Criar Usuario

Criar `supabase/functions/admin-create-user/index.ts` que:
- Valida que o chamador e admin (via JWT)
- Usa `supabase.auth.admin.createUser()` com `service_role`
- Atualiza o perfil com plano selecionado
- Registra no log de auditoria
- Retorna o usuario criado sem afetar a sessao do admin

### Fase 3: Implementar Botoes Faltantes

1. **Exportar CSV**: Gerar CSV client-side com os dados da tabela e fazer download
2. **Alterar/Resetar Senha**: Criar edge function `admin-reset-password` que usa `supabase.auth.admin.updateUserById()`
3. **Deletar Conta**: Dialog de confirmacao + edge function `admin-delete-user` que usa `supabase.auth.admin.deleteUser()`
4. **Login como Usuario**: Implementar impersonate via edge function que gera token temporario (ja mencionado na arquitetura do sistema)
5. **Ver Detalhes**: Criar a pagina de detalhes do usuario ou remover o link

### Fase 4: Melhorias Visuais

1. **Cards de metricas no topo**: Total usuarios, ativos hoje, novos este mes, usuarios suspensos/banidos
2. **Skeleton loading**: Substituir texto por skeletons animados na tabela
3. **Avatar/iniciais** do usuario na coluna de nome
4. **Busca funcional**: Remover menção a "email" do placeholder ou adicionar busca via edge function que consulta `auth.users`
5. **Debounce na busca**: Evitar queries a cada tecla digitada

---

## Detalhes Tecnicos

### Arquivos a Criar
- `supabase/functions/admin-create-user/index.ts`
- `supabase/functions/admin-reset-password/index.ts`

### Arquivos a Modificar
- `src/pages/admin/AdminUsersPage.tsx` - Refatoracao principal

### Migracoes SQL
- Funcao `get_admin_user_stats` (security definer)

### Sequencia de Implementacao
1. Migracao SQL (funcao RPC)
2. Edge Functions (create user, reset password)
3. Refatorar AdminUsersPage (queries, botoes, UI)

