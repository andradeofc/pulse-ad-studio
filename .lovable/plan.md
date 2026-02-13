

## Botao "Marcar todas como lidas" nas Notificacoes

### Contexto
Atualmente, as notificacoes administrativas (vindas da tabela `admin_notifications`) ja possuem um sistema de leitura individual via `user_notification_reads`. As notificacoes de sistema (tokens, jobs, alertas de catalogo) nao possuem estado de leitura persistente.

### O que sera feito

1. **Adicionar botao "Marcar todas como lidas"** no cabecalho do popover de notificacoes, visivel apenas quando existirem notificacoes nao lidas.

2. **Logica do botao:**
   - Para notificacoes **admin**: inserir registros em `user_notification_reads` para todas as notificacoes admin ainda nao lidas (usando um upsert em lote).
   - Para notificacoes **de sistema**: armazenar os IDs das notificacoes de sistema "dispensadas" no `localStorage`, para que elas aparecam como lidas na sessao atual sem precisar de tabela extra.

3. **Atualizar a contagem de nao lidas** (`unreadCount`) para considerar tambem as notificacoes de sistema que foram dispensadas via localStorage.

4. **Atualizar o estilo visual** das notificacoes de sistema dispensadas para ficarem com opacidade reduzida (mesmo comportamento ja existente nas admin lidas).

### Detalhes tecnicos

**Arquivo**: `src/components/layout/NotificationPopover.tsx`

- Novo estado: `dismissedSystemIds` carregado do `localStorage` (chave `dismissed-system-notifications`).
- Nova mutation `markAllAsReadMutation`:
  - Coleta IDs das notificacoes admin nao lidas e faz upsert em lote na tabela `user_notification_reads`.
  - Coleta IDs das notificacoes de sistema e salva no localStorage.
  - Invalida a query `admin-broadcast-notifications` ao concluir.
- O botao aparece ao lado do titulo "Notificacoes" no header do popover, usando um icone `CheckCheck` do lucide-react.
- O calculo de `unreadCount` passa a descontar as notificacoes de sistema cujo ID esta em `dismissedSystemIds`.
- Notificacoes de sistema dispensadas recebem `opacity-60` para indicar que ja foram vistas.

### O que NAO muda
- O fluxo de marcar notificacoes admin como lidas individualmente continua funcionando.
- A busca de notificacoes (system e admin) permanece identica.
- A estrutura visual do popover e preservada.

