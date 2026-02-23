

# Plano: Pagina de Detalhes de Campanha no Admin (Ops Center)

## Problema
A rota `/ops-center/campanhas/:id` nao existe no `App.tsx`, causando 404 ao clicar em "Ver Detalhes" na listagem de campanhas do admin.

## Desafio Tecnico
A pagina de detalhes existente (`/campanhas/:id`) usa queries diretas ao banco que dependem de RLS -- ou seja, so mostra campanhas do proprio usuario. O admin precisa ver campanhas de **qualquer** usuario.

## Solucao

### 1. Criar RPC `get_admin_campaign_details` (Migration SQL)
Uma funcao `SECURITY DEFINER` que retorna os dados de `campaign_jobs` e `campaign_job_items` para qualquer campaign, alem de informacoes do dono (nome, email, plano). Somente admins podem chamar.

```sql
CREATE OR REPLACE FUNCTION get_admin_campaign_details(p_job_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  
  RETURN (
    SELECT json_build_object(
      'job', row_to_json(cj),
      'items', (SELECT json_agg(row_to_json(ci)) FROM campaign_job_items ci WHERE ci.job_id = cj.id),
      'user', (SELECT json_build_object(
        'user_id', up.user_id, 'full_name', up.full_name, 'plan', up.plan, 'status', up.status,
        'email', (SELECT email FROM auth.users WHERE id = up.user_id)
      ) FROM user_profiles up WHERE up.user_id = cj.user_id)
    )
    FROM campaign_jobs cj WHERE cj.id = p_job_id
  );
END;
$$;
```

### 2. Criar `AdminCampaignDetailsPage.tsx`
Nova pagina em `src/pages/admin/AdminCampaignDetailsPage.tsx` que:
- Usa `AdminLayout` como wrapper
- Chama a RPC `get_admin_campaign_details` para buscar dados sem restricao de RLS
- Exibe um **banner do usuario dono** no topo (nome, email, plano, link para perfil do usuario no admin)
- Reutiliza a mesma estrutura visual profissional do `CampaignDetailsPage` existente com as 3 abas:
  - **Visao Geral**: objetivo, tipo (CBO/ABO), orcamento, segmentacao, destino, criativos
  - **Estrutura**: arvore hierarquica Campanha > Conjuntos > Anuncios com IDs do Facebook e status
  - **Configuracao**: JSON completo do payload
- Botao "Voltar" aponta para `/ops-center/campanhas`
- Botao adicional "Ver Perfil do Usuario" no header

### 3. Registrar Rota no `App.tsx`
Adicionar a rota `/ops-center/campanhas/:id` apontando para `AdminCampaignDetailsPage`.

### 4. Resumo de Arquivos

| Acao | Arquivo |
|------|---------|
| Migration SQL | Nova funcao RPC `get_admin_campaign_details` |
| Criar | `src/pages/admin/AdminCampaignDetailsPage.tsx` |
| Editar | `src/App.tsx` (adicionar rota) |

### Isolamento e Seguranca
- Nenhuma alteracao nos componentes existentes de campanha do usuario
- A RPC valida `is_admin()` antes de retornar qualquer dado
- A pagina admin usa `AdminLayout` que ja valida autenticacao de admin via `useAdminAuth`
- Nenhuma tabela existente e modificada -- apenas leitura via funcao dedicada

