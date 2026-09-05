# Proteção GitHub no modelo de mantenedor único

## Decisão vigente

`@Vnd93` é o único mantenedor humano, administrador, desenvolvedor e responsável por merges. O
Codex atua como revisor técnico automatizado, produzindo análise, testes, CI e canaries, mas não é
representado como outra conta GitHub, pessoa legal ou aprovação humana independente.

O repositório privado `Vnd93/gaiatec-cms` está no GitHub Free. A tela de rulesets informou que as
regras não serão aplicadas enquanto o repositório privado não estiver em uma conta compatível. Só o
ambiente `preview` existe. Não foi criada uma regra decorativa ou um ambiente de produção sem
proteção, pois isso produziria falsa segurança.

A documentação do GitHub confirma que branch protection e environment secrets em repositório
privado exigem GitHub Pro, Team ou Enterprise. Required reviewers de ambiente não fazem parte deste
modelo, porque impediriam o próprio mantenedor único de concluir o deploy. Referências:

- <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches>
- <https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments>

## Configuração vinculante

Após habilitar no mínimo GitHub Pro no repositório pessoal, aplicar em `main`:

1. toda mudança entra por PR, sem aprovação humana obrigatória;
2. CODEOWNERS aponta exclusivamente para `@Vnd93`, globalmente, em workflows e nos registros G12;
3. checks estritos `quality`, `database` e `browser` precisam concluir com sucesso no SHA exato;
4. conversas precisam ser resolvidas e o histórico deve ser linear;
5. administradores são incluídos, sem bypass, force-push ou exclusão da branch.

Criar dois ambientes, ambos sem required reviewers:

- `production`: somente `main` protegida; secrets de deploy e integração; o workflow exige também o
  registro G12 e a autorização literal vinculada ao SHA;
- `production-backup`: somente `main`; secrets exclusivos de banco e criptografia. Não deve ter
  aprovação manual por execução porque o backup diário precisa ser não assistido.

O guard de produção consulta a proteção, lê CODEOWNERS e os check-runs reais e confere que o SHA
veio de PR de `@Vnd93` já integrado em `main`. Zero approvals é intencional; qualquer reviewer de
ambiente, bypass ou autor diferente torna o controle inválido.

Aplicar a mesma governança no repositório `Vnd93/gaiatec-documentacao`, com PR obrigatório,
CODEOWNERS `@Vnd93`, histórico linear, conversas resolvidas e check `Documentation quality / quality`.

## Risco aceito e compensações

O modelo não oferece segregação humana de funções. Por isso, o registro G12 exige
`soleMaintainerRiskAccepted=true`, evidência técnica automatizada, backup/restore comprovado, CSP,
teste real do e-mail, DPO/legal e autorização final de `@Vnd93` ligada ao SHA completo. Sem GitHub
Pro ou sem qualquer compensação, produção permanece bloqueada.
