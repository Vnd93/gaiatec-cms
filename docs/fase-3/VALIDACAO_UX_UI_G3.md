# Validação prática de UX/UI — Gate G3

**Data:** 2026-08-28

**Ferramenta:** skill `browser:control-in-app-browser`, navegador integrado do Codex

**Staging inspecionado visualmente:** `https://e48a3283.gaiatec-cms-staging.pages.dev`

**Deployment final de fechamento:** `https://c67cd638.gaiatec-cms-staging.pages.dev`

## Cenários executados

| Cenário          | Resultado observado                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Login fechado    | formulário acessível por labels, título privado e meta `noindex,nofollow,noarchive`              |
| Shell desktop    | navegação por domínio, breadcrumbs, identidade/papel e dashboard operacional carregados          |
| Estado loading   | rota protegida exibiu `Validando acesso` com indicador de carregamento                           |
| Estado vazio     | biblioteca retornou `Biblioteca editorial vazia` sem consultar base antiga                       |
| Estado erro      | UUID inexistente exibiu alerta `Conteúdo indisponível ou sem permissão`                          |
| Sem permissão    | identidade Auth sem perfil viu `Acesso administrativo não autorizado`; UI protegida não abriu    |
| Criação pela UI  | rascunho sintético criado com confirmação, correlação e lock inicial                             |
| Preview real     | botão emitiu token, abriu `/preview/:token` e mostrou o mesmo renderer estruturado               |
| Busca global     | termo enviado pelo shell chegou a `/admin/conteudo?q=...` e filtrou a biblioteca                 |
| Perfil/sessão    | rota exibiu e-mail, status, papéis, MFA, expiração, permissões efetivas e encerramento da sessão |
| Mobile 390 × 844 | sem overflow horizontal; busca ocupou largura disponível; alvos principais ficaram utilizáveis   |
| Menu mobile      | `aria-expanded` alternou, sidebar fechada ficou invisível e `Escape` devolveu foco ao botão Menu |
| Console          | nenhuma mensagem de erro ou warning nas jornadas finais                                          |
| Cache/indexação  | `/admin` e `/preview` com `private, no-store`; header e meta robots bloqueando indexação         |

## Correções derivadas da inspeção

1. O preview usava `window.open` depois de uma chamada assíncrona e era bloqueado como popup. Foi alterado para navegação determinística na mesma aba, mantendo retorno pelo histórico.
2. O menu mobile deixava links fora da tela ainda focalizáveis e não respondia a `Escape`. A sidebar fechada agora usa `visibility: hidden`; `Escape` fecha o menu e restaura foco.
3. A auditoria do escopo F3-03 mostrou ausência de busca global e página de perfil/sessão. Ambas foram implementadas e revalidadas em desktop e mobile.

O único ajuste posterior à inspeção foi estabilizar a função de carregamento da biblioteca de mídia para remover um warning de dependência do React, sem alteração visual. O deployment final foi recompilado pelo ciclo integral, publicado na mesma branch `Remodelagem` e revalidado por HTTP em `/`, `/admin`, `/admin/login`, asset inexistente, preview inválido e projeção pública ausente.

## Dados de teste

Somente e-mails `example.invalid`, senhas aleatórias efêmeras e conteúdo explicitamente sintético foram usados. Nenhuma credencial real foi registrada neste documento. Todos os usuários, rascunhos e tokens da inspeção foram removidos, e os contadores finais do staging ficaram zerados conforme `EVIDENCIAS_GATE_G3.md`.
