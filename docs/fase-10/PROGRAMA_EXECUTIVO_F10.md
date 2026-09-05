# Programa Executivo F10 — Experiência operacional, rascunhos e padronização

## Objetivo e limites

Entregar um CMS que preserve trabalho durante eventos de sessão, opere com editores claros e use classificações governadas. A fase vale para local e staging. Produção, `main`, `gaiatec-website`, domínio público, banco legado e Supabase produtivo estão fora de escopo. Nenhum conteúdo do painel/site antigo pode ser copiado.

## Fases internas

| Frente             | Resultado                                                               | Dependência                | Evidência de saída               |
| ------------------ | ----------------------------------------------------------------------- | -------------------------- | -------------------------------- |
| F10.1 Sessão       | refresh do mesmo usuário em segundo plano; logout/expiração fail-closed | contrato de auth existente | teste de continuidade e sign-out |
| F10.2 Rascunhos    | cópia por usuário/tipo/item, TTL, restauração e limpeza                 | F10.1                      | componente + teste de expiração  |
| F10.3 Vocabulário  | listas genéricas, RLS, MFA, auditoria, uso e inativação                 | migrations/RBAC            | migration, Edge, RLS e UI        |
| F10.4 Contratos    | produto com cinco dimensões; serviço com categoria                      | F10.3                      | round-trip e normalização        |
| F10.5 Consumidores | busca, filtros, comparação, página, SEO e JSON-LD                       | F10.4                      | testes de projeção e rotas       |
| F10.6 Operação     | cards, rail sticky, progresso, pendências, modelos visuais e footer     | F10.2/F10.4                | validação desktop/mobile/a11y    |
| F10.7 Massa        | template e dry-run por UUID, erro por linha/campo                       | F10.3/F10.4                | testes de contrato e servidor    |
| F10.8 Staging      | migration/functions/site e smoke, sem produção                          | suíte local verde          | URLs e evidências registradas    |

## Dependências e permissões

- `cms:vocabularies.read` para consulta;
- `cms:vocabularies.manage` crítica, portanto MFA/AAL2;
- permissões editoriais existentes para salvar, revisar e publicar;
- service role somente dentro das Edge Functions;
- sessão staging real para carga inicial e homologação autenticada.

## Matriz mínima de testes

| Risco               | Unidade/componente              | Contrato/estrutura | RLS/backend        | E2E/visual                         |
| ------------------- | ------------------------------- | ------------------ | ------------------ | ---------------------------------- |
| perda ao trocar aba | `admin-auth-session-continuity` | F10                | expiração/sign-out | alternar aba e aguardar refresh    |
| cópia incorreta     | `draft-backup`                  | F10                | não aplicável      | restauração consciente             |
| termo inválido      | `bulk-import`                   | F10                | normalizador/RPC   | dry-run com linha/coluna           |
| vazamento interno   | `public-projection`             | F2–F10             | anon negative      | página, busca, SEO/JSON-LD         |
| UX inacessível      | componentes                     | build/typecheck    | não aplicável      | teclado, mobile, console, overflow |

## Riscos e respostas

- **Sessão relaxada:** eventos nulos, expiração e troca real de usuário desmontam e bloqueiam.
- **Cópia local sensível:** armazenamento por sessão, TTL curto, namespace e nenhum terceiro.
- **Classificação histórica:** exclusão física proibida e snapshots preservados.
- **Seed indevido:** script recusa qualquer URL fora do projeto staging e exige MFA.
- **Contrato parcial:** Gate bloqueado se qualquer consumidor ou editor permanecer desconectado.
- **Deploy acidental:** scripts de produção não são executados; staging só após suíte verde.

## Rollback

1. suspender o cadastro de opções e inativar a função no staging;
2. restaurar a versão anterior das Edge Functions e do site staging;
3. manter tabelas para não destruir referências; restaurar payloads por revisionamento existente;
4. desativar a leitura do backup local; deixar chaves expirarem;
5. registrar correlação, janela e resultado em auditoria/evidência.

## Gate G10

G10 exige simultaneamente: suíte completa verde; RLS executado; refresh sem desmontagem; logout/expiração bloqueados; backup em todos os editores e restauração comprovada; vocabulários administráveis e auditados; cinco dimensões de produto e categoria de serviço integradas; importação rejeitando desconhecidos; projeção pública sem campos internos; UX desktop/mobile/teclado sem erro ou overflow; staging implantado e homologado com sessão real.

Até todas as evidências existirem, G10 permanece **NÃO APROVADO**. G10 não aprova G9, produção ou go-live.
