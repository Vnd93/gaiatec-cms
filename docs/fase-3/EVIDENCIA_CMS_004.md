# Evidencia CMS-004 — fundacao editorial versionada

> Nota vigente em 2026-08-28: referências abaixo a CI remoto são históricas e não comprovam o estado atual. A contingência aceita em `docs/fase-2/EVIDENCIAS_GATE_G2.md` torna `npm run validate:local` obrigatório e mantém Actions, environments, branch protection, `main` e produção bloqueados.

**Data:** 2026-08-28

**Commit funcional:** `c26daf3`

**Producao:** nao acessada

## Entrega

- migration `0013_fase3_cms_editorial_foundation.sql`;
- taxonomia hierarquica para segmento, categoria, familia e tag;
- itens editoriais separados por produto, servico, post, pagina e homepage;
- rascunhos com controle otimista de concorrencia por `lock_version`;
- revisoes imutaveis e numeradas;
- relacao N:N entre conteudo e taxonomia;
- projecao da revisao publicada com referencia composta obrigatoria;
- outbox idempotente para publicar, restaurar e despublicar;
- recibos idempotentes fechados para os futuros comandos editoriais;
- RLS por dominio e permissao `cms:*`;
- contrato runtime Zod para conteudo, SEO, especificacoes e proveniencia.

## Protecoes comprovadas

- nenhum registro real, legado ou sintetico e criado pela migration;
- frontend autenticado possui somente leitura autorizada sob RLS;
- RDO nao recebe acesso editorial;
- rascunho nao pode pular diretamente para publicacao;
- revisao nao pode ser alterada ou apagada, nem por codigo privilegiado;
- publicacao somente aceita revisao pertencente ao mesmo item;
- outbox rejeita evento duplicado para a mesma revisao;
- categoria exige segmento e familia exige categoria;
- fonte externa exige URL, hash SHA-256 e direitos confirmados;
- campos legados desconhecidos sao rejeitados pelo contrato runtime.

## Validacoes

- TypeScript estrito: aprovado;
- testes unitarios e de contrato: 11/11 aprovados;
- testes estruturais da Fase 3: 14/14 aprovados;
- pgTAP do pacote editorial: 20/20 aprovados no banco efemero do GitHub;
- migrations `0001` a `0013` aplicadas do zero: aprovadas;
- qualidade, banco e navegador no CI de `push`: aprovados;
- qualidade, banco e navegador no CI do Pull Request: aprovados;
- preview validado e preservado como artefato do GitHub.

## Estado de homologacao

Assim como o CMS-003, a aplicacao no projeto `GAIATEC CMS Staging` aguarda uma sessao autenticada do Supabase. Nenhum acesso foi tentado em producao. O pacote esta versionado e validado em banco limpo, pronto para aplicacao sequencial depois de `0012`.

## Limite do pacote

Esta entrega cria apenas a fundacao vazia. Criar, salvar, revisar, aprovar, publicar, restaurar e arquivar conteudo pela API administrativa pertence ao proximo pacote. Midia e API publica permanecem em pacotes separados.
