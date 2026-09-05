# Evidências técnicas da Fase 5

## Banco e funções

- alvo verificado antes da mutação: `glcqsosxwgmlhzgcsnzv`, nome `GAIATEC CMS Staging`, região `us-east-2`;
- `SUPABASE_ACCESS_TOKEN` lido somente da linha homônima do arquivo externo e mantido em memória;
- migrations locais/remotas estavam alinhadas de `0001` a `0024`;
- `db push --linked --dry-run` indicou apenas `0025`, sem seed ou role externa;
- a migration completa compilou dentro de `BEGIN/ROLLBACK` antes da aplicação;
- `0025_fase5_catalog_discovery` foi aplicada apenas no staging;
- funções publicadas: `cms-content`, `cms-public`, `cms-preview` e `cms-search-admin`;
- `cms-public` e `cms-preview` mantêm verificação pública própria e `no-verify-jwt`; as funções administrativas exigem JWT.

## Testes remotos descartáveis

Resultado: 48 verificações `PASS`.

- quatro usuários sintéticos criados, RBAC separado e logins válidos;
- em serviço, indústria, aplicação e solução: create, save/lock, submit, approve, emissão/consumo de preview, publish e consumidor público aprovados;
- identidade sem acesso: `403`;
- busca única: quatro domínios sintéticos encontrados somente após publicação;
- autocomplete: resultados com `no-store`;
- zero resultado: resposta vazia e evento anônimo persistido;
- consulta `KF700E`: marca `GATFLOW`, modelo `GATFLOW-B` e referência `KF700E` preservados.

Auditoria posterior confirmou `f5_items=0`, `f5_projection=0`, `f5_published=0`, `f5_users=0`, `search_events=0` e `synonyms=0`. O único conteúdo publicado é o produto GATFLOW homologado na versão 7.

## Validação local

- Vitest: 9 arquivos e 27 testes aprovados;
- F5 estrutural: 5 testes aprovados;
- TypeScript estrito e build de staging aprovados;
- ESLint: 0 erros e 48 warnings preexistentes, sem warning novo F5;
- chunk PDF legado: warning de 1,9 MB permanece conhecido e não foi criado pela F5;
- `npm run validate:local` é a autoridade final; CI remoto não é declarado verde.

## Segurança e observabilidade

- RLS habilitada nas três tabelas novas;
- escrita pública negada; comando/API validam sessão e permissão;
- aprovação separada da edição e publicação;
- correlação e audit log herdados do comando editorial;
- projeções por domínio aparecem em Diagnósticos; zero resultados aparecem em Busca;
- o único warning do Security Advisor herdado é `auth_leaked_password_protection`: HIBP depende do plano Supabase Pro e a tentativa anterior recebeu HTTP 402. O warning continua registrado sem relaxar senha, RLS, preview, storage ou RBAC.
