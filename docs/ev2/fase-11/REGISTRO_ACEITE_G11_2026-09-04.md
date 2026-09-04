# Registro de aceite do Gate G11

**Data:** 4 de setembro de 2026<br>
**Decisão:** APROVADO PARA PREPARAR A EV2.12 — PRODUÇÃO BLOQUEADA<br>
**SHA funcional homologado:** `8321f1291860e9ca55d3e17e3c1ce36123d0d025`<br>
**Assurance run:** `7466a0d3-021f-4c60-ad82-61e76b93844f`, estado `accepted`<br>
**Papéis organizacionais:** `OP-01` e `REV-01`

## Origem do aceite

O responsável pelo projeto autorizou expressamente a conclusão das solicitações em aberto e a
continuidade conforme a recomendação técnica. A autorização mantém a identificação codificada de
`OP-01` e `REV-01` já definida no ciclo e delega ao Codex os ensaios técnicos equivalentes, conforme
o protocolo reduzido da [ADR-021](../../adr/ADR-021-baseline-humano-incremental-por-gate.md).

Este registro não declara uma sessão manual que não ocorreu e não inventa tempo, cliques, ajuda ou
percepção. O aceite organizacional recai sobre as evidências objetivas abaixo. As contas sintéticas
segregadas do canary comprovam a separação técnica entre medição e revisão; os papéis humanos
permanecem identificados apenas pelos códigos autorizados.

## Revisão consolidada

| Trilha         | Evidência objetiva                                                             | Decisão sob protocolo reduzido |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| Operacional    | falha, retry idempotente, dead-letter, alerta e recuperação aprovados          | aceita                         |
| Funcional      | regressão integral verde; lead preservado e caminho manual independente        | aceita                         |
| Dados          | publicação/projeção e lead/consentimento/histórico/outbox sem divergência      | aceita                         |
| Permissões     | anônimo/produção/AAL1 negados; MFA e overrides individuais comprovados         | aceita                         |
| Público        | smoke, status, SEO, 404, headers e rotas críticas aprovados                    | aceita                         |
| Não funcional  | disponibilidade 100%, leitura p95 408 ms, comando p95 666 ms e outbox p95 0 ms | aceita                         |
| IA             | candidatos de IA desligados e fallback manual preservado                       | aceita                         |
| LGPD           | fixtures sintéticas, anonimização e consulta independente com resíduo zero     | aceita no escopo sintético     |
| Restore        | checksum íntegro, RPO 0 e RTO 5,642 s                                          | aceita                         |
| Acessibilidade | axe critical/serious 0/0 e jornadas públicas/teclado automatizadas             | aceita                         |

## Parecer Security

- autenticação anônima e ambiente de produção retornaram negação;
- MFA/AAL2 foi exigido para replay e aceite;
- override amplo falhou fechado e os dois overrides válidos foram individuais e temporários;
- os quatro wrappers de rate limit da migration `0052` são executáveis somente por `service_role`;
- rate limit, idempotência, correlation ID, auditoria e segregação permaneceram ativos;
- RLS/pgTAP, CI, lint de banco e auditoria npm concluíram sem falha ou vulnerabilidade conhecida;
- `cms-outbox-worker` v22 permaneceu inalterado.

O parecer aprova o candidato no escopo de staging. Ele não aprova exposição em produção nem reduz
os controles que a EV2.12 ainda precisa criar.

## Parecer LGPD

O canary utilizou somente identificadores e contatos `example.invalid`. O lead foi anonimizado, as
credenciais foram banidas, os perfis suspensos e os overrides removidos. A consulta posterior e
independente encontrou zero credencial ativa, perfil ativo, override ou payload pessoal residual.

Esta decisão não resolve a `EV2-D04`, não aprova provedor externo, transferência internacional,
retenção de prompts ou uso de dado real. Esses temas continuam bloqueados até decisão nominal de
DPO/Security e contrato aplicável.

## UAT e equivalência de risco

A jornada autenticada foi exercitada pelo canary diretamente nas mesmas APIs e regras usadas pela
interface. O frontend teve contratos e estados acionáveis verificados, incluindo “Reprocessar
entrega”, preservação explícita do lead, justificativa, confirmação crítica e link para Diagnósticos.
As rotas públicas, teclado e axe foram executados no deployment imutável.

Como não foi reutilizada credencial humana entre origens e nenhuma nova senha humana foi solicitada,
o protocolo reduzido evita exposição desnecessária de segredo. A ausência de uma repetição manual é
registrada como tal e não é convertida em métrica estimada.

## Decisão e limites

G11 aprovado para iniciar a preparação técnica da EV2.12 no branch atual. A aprovação cobre
documentação, guardas de CI/CD, health/status, canary de staging, treinamento e handover.

Continuam exigindo autorização específica e pré-condições próprias:

- criação/configuração do ambiente protegido de produção no GitHub;
- definição do backend Supabase de produção e seus segredos;
- configuração e validação do provedor/destinatário real de e-mail;
- decisão `EV2-D04` para qualquer provedor de IA ou dado real;
- promoção do staging estável, merge em `main`, ativação global e deploy de produção;
- janela de mudança, plano de comunicação e aprovação final G12.

Nenhuma dessas ações é concedida por este aceite do G11.
