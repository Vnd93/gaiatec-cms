# Estrutura de código — Fase 2

**Status:** aprovada para adoção progressiva

**Escopo:** somente limites de engenharia; nenhum módulo do CMS da Fase 3 foi iniciado

## Limites aprovados

```text
src/public/       bootstrap e consumidores públicos novos
src/admin/        reservado ao painel novo após o Gate G2
src/shared/       contratos e infraestrutura sem regra editorial
src/rdo/          destino progressivo do domínio RDO
src/app/          aplicação legada preservada durante a transição
supabase/migrations/
supabase/functions/
supabase/seed/    apenas fixtures sintéticas
docs/api/
docs/database/
docs/operations/
```

O entrypoint público já passa por `src/public/bootstrap.tsx`. O RDO permanece fisicamente em `src/app/rdo` nesta fase: movê-lo sem necessidade funcional geraria uma refatoração ampla e sem ganho para G2. `src/admin` contém apenas a fronteira documental; criar login, shell, RBAC ou conteúdo seria avanço indevido para a Fase 3.

## Regras de dependência

- `public` pode consumir `shared` e o aplicativo público existente durante a transição;
- `shared` não consome `public`, `admin` nem conteúdo editorial legado;
- `admin` não reutiliza código, usuários, telas ou workflows administrativos anteriores;
- seeds não carregam conteúdo, mídia, cadastros ou dados pessoais;
- migrações aplicadas são imutáveis e novas mudanças usam novo arquivo;
- movimentos físicos adicionais exigem ticket próprio, teste e justificativa.
