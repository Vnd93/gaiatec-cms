# ADR-023 — IA transacional sintética e aprovação por hash

**Status:** aceita para candidato local; ativação condicionada ao G14<br>
**Data:** 4 de setembro de 2026

## Contexto

A F-016 prevê comandos oficiais produzidos por IA. Permitir que texto livre acione diretamente as
APIs editoriais ampliaria riscos de alvo incorreto, injeção, privilégio excessivo, replay, aplicação
parcial e rollback destrutivo. A F-015 aprovada no G10 é deliberadamente não transacional e não pode
ser expandida apenas por um novo botão.

## Decisão

Adotar um gateway separado, `cms-ai-execute`, e validar primeiro toda a máquina operacional em um
sandbox sintético. O gateway usa tools registradas e fechadas, plano e dry-run determinísticos,
hash SHA-256 sobre a versão exata, aprovação temporária por ator distinto, comando idempotente,
execução atômica e compensação baseada em snapshots com versão monotônica.

A capacidade exige simultaneamente `ev2.ai_assist` e `ev2.ai_execute`, ambas default-off e habilitadas
somente por override individual de até 30 minutos. O banco aceita apenas `local|staging`, site `main`
e referências `g14x-*`. Produção, dados reais e provider externo não fazem parte desta decisão.

## Alternativas rejeitadas

- Reaproveitar `cms-ai`: misturaria leitura/rascunho e mutação, aumentando o blast radius.
- Aprovar apenas por clique/ID: não vincularia a decisão ao conteúdo exato do plano.
- Executar cada etapa por requisição: permitiria estado parcial e rollback difícil.
- Reverter a versão ao valor anterior: criaria risco ABA e esconderia alterações concorrentes.
- Conectar desde já às tabelas reais: anteciparia risco sem provar segregação e compensação.

## Consequências

Positivas: fronteira auditável, negação segura, repetição determinística, revisão humana explícita e
ensaio sem impacto editorial. Negativas: mais tabelas/estados, necessidade de dois atores MFA e uma
segunda aprovação para compensar; após expiração ou revisão, um novo dry-run/aprovação é obrigatório.

## Condição para expansão

Uma tool que toque domínio real deverá possuir contrato específico, policy por recurso, prova de
RLS/RBAC, classificação de risco, idempotência, verificação de pós-estado, compensação exercitada,
dataset/evals próprios e um gate posterior explicitamente autorizado. G14 não satisfaz essa condição
para nenhuma tabela real.
