# Responsáveis, DPO/legal e autorização final

## Quatro responsáveis operacionais

O registro G12 v2 exige quatro identidades reais e distintas:

| Campo                  | Responsabilidade                                    | Não pode ser substituído por     |
| ---------------------- | --------------------------------------------------- | -------------------------------- |
| `changeOwner`          | janela, comunicação, execução e encerramento        | nome de equipe ou placeholder    |
| `technicalReviewer`    | SHA, CI, arquitetura, backup e rollback             | autor sem revisão independente   |
| `securityPrivacyOwner` | segurança, CSP, RLS, secrets e incidentes           | confirmação verbal sem evidência |
| `businessOwner`        | impacto, atendimento, conteúdo e decisão de negócio | conta técnica genérica           |

Cada owner informa `id`, `approvedAt` e `evidenceReference`. Duplicação de identidade em qualquer
par é recusada.

## DPO/legal

`productionReadiness.dpoLegal` exige:

- `status=approved`;
- identificador do aprovador;
- referência durável ao parecer;
- data/hora;
- SHA-256 do pacote exato analisado: avisos de privacidade, termos, formulários, retenção,
  subprocessadores, DPA e fluxos RDO/leads.

O sistema não pode criar uma aprovação jurídica. O template permanece `pending` até que o responsável
real emita e referencie o parecer.

## Autorização vinculada ao SHA

Além de `candidateSha`, o registro e o disparo exigem simultaneamente:

- `productionAuthorizationSha=<SHA completo>`;
- `productionAuthorizationText=AUTORIZO-G12-PRODUCAO:<SHA completo>`;
- `productionAuthorizedBy` e `productionAuthorizedAt`;
- arquivo imutável `G12_<SHA completo>.json` versionado em `main`.

Alterar um único caractere do SHA invalida a autorização. A aprovação só pode ocorrer depois de CI,
canary, backup/restore, e-mail, CSP, GitHub e DPO/legal vinculados ao mesmo candidato.
