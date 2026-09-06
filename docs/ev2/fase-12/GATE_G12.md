# Gate G12 — implantação controlada

**Decisão atual:** APROVADO PARA EXECUÇÃO CONTROLADA<br>
**Escopo liberado:** implantação do candidato imutável `e52b25d9…` pelo workflow protegido<br>
**Staging:** canary G12 e revalidação pós-hardening aprovados para o SHA exato<br>
**Produção:** autorizada, mas ainda não executada

## Critérios vinculantes

| Critério          | Evidência exigida                                                                   | Estado atual                                                |
| ----------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| G11 válido        | aceite G11 e canary sintético rastreável                                            | atendido; run `104b95be-7c7a-479e-83ba-8001a0a876ab`        |
| Artefato imutável | SHA completo igual em checkout, `X-Release`, `/healthz` e manifest                  | SHA `e52b25d903251cf538918d89049a58524c3c9911` validado     |
| CI e segurança    | suíte integral, RLS, E2E, acessibilidade e audit sem vulnerabilidade alta           | checks, auditoria e canary aprovados                        |
| Canary G12        | alias isolado, dois usuários sintéticos MFA, overrides individuais de 30 minutos    | aprovado; run `de784acc-a557-4ed1-b4ca-84f0ea26f077`        |
| Projeções         | comparação v1/candidato sem divergência                                             | reconciliação zero                                          |
| Error budget      | três janelas consecutivas saudáveis, com amostra, versão e ambiente                 | 3 de 3 janelas aprovadas                                    |
| Recuperação       | baseline produtiva identificada e restore drill aprovado                            | backup/restore run `34000214134` aprovado                   |
| GitHub            | `main` protegida, PR de `@Vnd93`, CODEOWNERS solo, CI estrita e ambiente segregado  | atendido com GitHub Pro e ambiente protegido                |
| Backend produtivo | Supabase exclusivo, backup, restore, RLS, migrations e funções verificáveis         | projeto isolado e workflow fail-closed pronto               |
| Privacidade/legal | aceite identificado e hash do escopo dos fluxos com dados reais                     | atendido; escopo e dados públicos do DPO aprovados          |
| E-mail/CSP        | Resend entregue em teste sintético e CSP enforced sem violação crítica no mesmo SHA | atendido no candidato exato                                 |
| Operação          | `@Vnd93` nos quatro papéis, risco solo, janela, treinamento e canal de plantão      | modelo solo, risco e janela aceitos                         |
| Autorização       | registro `G12_<sha>.json` v2 e `AUTORIZO-G12-PRODUCAO:<sha>`                        | autorização exata recebida e registro verificado localmente |

## Regra de decisão

G12 só pode ser marcado como aprovado quando todas as linhas estiverem atendidas por evidência real.
Não são aceitos placeholders, métricas inferidas ou sessões declaradas sem ocorrência. A exceção de
governança humana única vale somente para `@Vnd93`, com risco aceito e evidência separada por papel;
ela não remove segregações técnicas de permissão existentes no CMS.

Qualquer uma das condições abaixo produz decisão `pause` e impede ampliação:

- P0 ou P1 aberto;
- incidente ou revisão de segurança/privacidade não aprovada;
- divergência de projeção;
- disponibilidade abaixo de 99,9%, 5xx acima de 0,1% ou latência fora do budget;
- mismatch de SHA, manifest, header ou ambiente;
- menos de três janelas consecutivas saudáveis;
- tentativa de pular estágio;
- baseline de rollback diferente da aprovada.

## Limites da autorização

A aprovação está vinculada exclusivamente ao SHA
`e52b25d903251cf538918d89049a58524c3c9911` e ao fluxo protegido. Ela não comprova que o go-live já
ocorreu. O workflow ainda deve reconfirmar a baseline, aplicar o backend, validar os contratos e só
então promover o frontend. Qualquer alteração no candidato, na baseline ou nos controles interrompe a
execução e exige nova decisão.
