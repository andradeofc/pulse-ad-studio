

## Corrigir persistencia de sessao ao atualizar a pagina (F5)

### Problema
Ao pressionar F5, o usuario e redirecionado para a tela de login mesmo tendo uma sessao valida. Isso acontece porque:

1. O `DashboardLayout` verifica `isAuthenticated` imediatamente no primeiro render.
2. Nesse momento, o auth store ainda esta inicializando (`isLoading: true`, `isAuthenticated: false`).
3. O componente redireciona para `/login` antes do sistema ter tempo de recuperar a sessao salva no navegador.

### Comportamento esperado (padrao profissional)
- A sessao persiste entre atualizacoes de pagina.
- O usuario so precisa logar novamente se a sessao expirar (tipicamente 7 a 30 dias) ou se fizer logout manualmente.
- Durante a verificacao da sessao, o usuario ve uma tela de carregamento em vez de ser redirecionado.

### Solucao
Alterar o `DashboardLayout` para aguardar a inicializacao do auth antes de decidir se redireciona.

### Detalhes tecnicos

**Arquivo**: `src/components/layout/DashboardLayout.tsx`

- Importar `isLoading` do `useAuthStore` alem de `isAuthenticated`.
- Enquanto `isLoading` for `true`, renderizar um estado de carregamento (spinner ou skeleton) em vez de redirecionar.
- Somente apos `isLoading` ser `false`, verificar `isAuthenticated` e redirecionar se necessario.

```text
Fluxo atual (com bug):
  F5 -> isAuthenticated=false -> Navigate(/login) -> sessao recuperada (tarde demais)

Fluxo corrigido:
  F5 -> isLoading=true -> mostra loading -> sessao recuperada -> isAuthenticated=true -> mostra dashboard
```

### O que NAO muda
- A logica de autenticacao no `authStore` permanece identica.
- O fluxo de login/logout nao e alterado.
- Nenhuma tabela ou configuracao de banco de dados precisa ser modificada.

