# Gate G12 — implantação controlada

**Decisão atual:** NÃO APROVADO<br>
**Escopo liberado:** desenvolvimento, validação local e canary isolado concluído<br>
**Staging:** canary G12 aprovado tecnicamente para o SHA `8250db0d…`<br>
**Produção:** bloqueada

## Critérios vinculantes

| Critério          | Evidência exigida                                                                   | Estado atual                                                   |
| ----------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| G11 válido        | aceite G11 e canary sintético rastreável                                            | atendido; assurance segregada aceita                           |
| Artefato imutável | SHA completo igual em checkout, `X-Release`, `/healthz` e manifest                  | SHA `8250db0d…` validado em staging                            |
| CI e segurança    | suíte integral, RLS, E2E, acessibilidade e audit sem vulnerabilidade alta           | checks e canary aprovados                                      |
| Canary G12        | alias isolado, dois usuários sintéticos MFA, overrides individuais de 30 minutos    | histórico concluído; requalificação pós-hardening necessária   |
| Projeções         | comparação v1/candidato sem divergência                                             | reconciliação zero; aceite final pendente                      |
| Error budget      | três janelas consecutivas saudáveis, com amostra, versão e ambiente                 | 3 de 3 janelas aprovadas                                       |
| Recuperação       | baseline produtiva e drill de rollback compatível com RPO 0/RTO <= 15 min           | restore RPO 0/RTO 1; drill produtivo pendente                  |
| GitHub            | `main` protegida, dois reviews reais, CODEOWNERS e ambiente segregado               | bloqueado por plano/identidades                                |
| Backend produtivo | Supabase exclusivo, backups, RLS, migrations e funções aprovadas                    | isolado e saudável; plano Free/backup/restore/schema pendentes |
| Privacidade/legal | parecer identificado e hash do escopo dos fluxos com dados reais                    | pendente                                                       |
| E-mail/CSP        | Resend entregue em teste sintético e CSP enforced sem violação crítica no mesmo SHA | automação pronta; execução pendente                            |
| Operação          | quatro owners distintos, janela, comunicação, treinamento e on-call confirmados     | identidades reais pendentes                                    |
| Autorização       | registro `G12_<sha>.json` v2 e `AUTORIZO-G12-PRODUCAO:<sha>`                        | ausente                                                        |

## Regra de decisão

G12 só pode ser marcado como aprovado quando todas as linhas estiverem atendidas por evidência real.
Não são aceitos placeholders, métricas inferidas, sessões declaradas sem ocorrência ou aprovação pela
mesma pessoa em papéis que exigem segregação.

Qualquer uma das condições abaixo produz decisão `pause` e impede ampliação:

- P0 ou P1 aberto;
- incidente ou revisão de segurança/privacidade não aprovada;
- divergência de projeção;
- disponibilidade abaixo de 99,9%, 5xx acima de 0,1% ou latência fora do budget;
- mismatch de SHA, manifest, header ou ambiente;
- menos de três janelas consecutivas saudáveis;
- tentativa de pular estágio;
- baseline de rollback diferente da aprovada.

## O que este gate não autoriza

O status de implementação, um CI verde ou o canary isolado não autorizam `main`, dados reais, domínio
real, projeto `gaiatec-website`, ativação global nem produção. Essas ações requerem uma decisão G12
posterior e específica ao SHA.
