# Responsáveis, DPO/legal e autorização final

## Um responsável, quatro responsabilidades

`@Vnd93` é o único responsável humano e assume os quatro campos do registro G12:

| Campo                  | Responsabilidade                                    | Evidência mínima                       |
| ---------------------- | --------------------------------------------------- | -------------------------------------- |
| `changeOwner`          | janela, comunicação, execução e encerramento        | horário, workflow e decisão            |
| `technicalReviewer`    | SHA, CI, arquitetura, backup e rollback             | checks e relatórios automatizados      |
| `securityPrivacyOwner` | segurança, CSP, RLS, secrets e incidentes           | varreduras, escopo legal e rastreio    |
| `businessOwner`        | impacto, atendimento, conteúdo e decisão de negócio | aceite de risco e autorização pelo SHA |

Cada owner informa `id=Vnd93`, `approvedAt` e `evidenceReference`. Outro identificador, ausência da
aceitação de risco ou tentativa de apresentar o Codex como segunda pessoa são recusados. A exceção é
somente de governança humana; MFA, menor privilégio e segregações críticas do CMS permanecem ativas.

## DPO/legal

`productionReadiness.dpoLegal` exige:

- `status=approved`;
- identificador do aprovador;
- referência durável ao parecer;
- data/hora;
- SHA-256 do pacote exato analisado: avisos de privacidade, termos, formulários, retenção,
  subprocessadores, DPA e fluxos RDO/leads.

O responsável declarou autoridade interna, aprovou o escopo padrão e confirmou Marcelo Diaz e
`vendas@gaiatecsistemas.com.br` como encarregado e canal públicos vigentes. O controle DPO/legal
está `approved`; qualquer mudança posterior de identidade, canal ou escopo exige nova aprovação e
novo hash.

## Autorização vinculada ao SHA

Além de `candidateSha`, o registro e o disparo exigem simultaneamente:

- `productionAuthorizationSha=<SHA completo>`;
- `productionAuthorizationText=AUTORIZO-G12-PRODUCAO:<SHA completo>`;
- `productionAuthorizedBy` e `productionAuthorizedAt`;
- arquivo imutável `G12_<SHA completo>.json` versionado em `main`.

Alterar um único caractere do SHA invalida a autorização. A aprovação só pode ocorrer depois de CI,
canary, backup/restore, e-mail, CSP, GitHub e DPO/legal vinculados ao mesmo candidato.
