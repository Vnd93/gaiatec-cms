# Registro de riscos e pendências — Fase 0

| ID | Severidade | Evidência | Tratamento | Owner funcional | Condição de fechamento |
|---|---|---|---|---|---|
| F0-R01 | fechado | GitHub e branch informados | conectar sem sobrescrever o workspace | Pedro Nishida | `origin/Remodelagem` em `63da594…` |
| F0-R02 | fechado | autorização para nomeação | RACI interino aprovado | Comercial GAIATEC | owners registrados |
| F0-R03 | fechado | organização Supabase free com capacidade | criar staging separado | Pedro Nishida | `GAIATEC CMS Staging` saudável |
| F0-R04 | fechado | credenciais privilegiadas estavam em `.env.local` | isolar staging e mover backup para fora do repo | Pedro Nishida | local somente com chave pública de staging |
| F0-R05 | fechado | taxonomia/lote não definidos | aprovar recorte controlado sem dados atuais | Comercial/Portfólio | `PILOTO-01` registrado |
| F0-R06 | fechado para G0 | Node global 24, projeto declara 22 | usar runtime isolado Node 22 | Pedro Nishida | build verde em Node 22.23.2 |
| F0-R07 | alto | produção/local têm soft 404 e rotas privadas indexáveis | corrigir em Fase 1 | Frontend/DevOps | status/noindex testados |
| F0-R08 | alto | homepage mobile com overflow 619/375 | corrigir em Fase 1 e validar UX/UI | Frontend/UX | matriz responsiva sem overflow |
| F0-R09 | alto | 6–7 links `#` nas rotas amostradas | eliminar ou vincular a destinos válidos | UX/Editorial | crawl com zero link inválido |
| F0-R10 | alto | RDO confirma acesso por qualquer e-mail | executar plano de contenção | Segurança/RDO | Gate G1 |
| F0-R11 | alto | `site-content` e migrations editoriais/leads ausentes | recuperar fonte sem reativar CMS antigo | Backend | artefatos versionados e auditados |
| F0-R12 | médio | JS local difere da entrada produtiva | restaurar Git/release metadata | Tech Lead | correspondência por commit/artefato |
| F0-R13 | médio | chunk PDF de 1,9 MB | adiar/carregar sob demanda e fixar budget | Frontend | budget e teste aprovados |
| F0-R14 | alto | sem CI, lint, typecheck e testes | executar Fase 2 após contenção | Tech Lead/QA | Gate G2 |

Os riscos F0 foram fechados. Riscos P0/P1 de aplicação permanecem no backlog com owner e pertencem às fases seguintes; não impedem o G0 porque possuem contenção, sequência e gate próprios.
