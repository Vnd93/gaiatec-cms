# Proteção GitHub e revisores independentes

## Estado observado

O repositório privado `Vnd93/gaiatec-cms` está no GitHub Free. A tela de rulesets informou que as
regras não serão aplicadas enquanto o repositório privado não estiver em uma conta compatível. Só o
ambiente `preview` existe. Não foi criada uma regra decorativa ou um ambiente de produção sem
proteção, pois isso produziria falsa segurança.

A documentação do GitHub confirma que branch protection em repositório privado exige GitHub Pro,
Team ou Enterprise. Ambientes e seus secrets em repositório privado também exigem Pro, Team ou
Enterprise. Required reviewers do **ambiente** privado não estão disponíveis em Free, Pro ou Team;
para esse recurso específico é necessário Enterprise. Referências:

- <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches>
- <https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments>

## Configuração vinculante

Após habilitar no mínimo GitHub Pro no repositório pessoal, ou transferir o repositório para uma
organização Team, aplicar em `main`:

1. PR obrigatório com **dois approvals** de contas distintas do autor;
2. CODEOWNERS obrigatório, com ao menos dois owners globais e dois para `.github/workflows/**` e
   `docs/ev2/fase-12/approvals/**`;
3. descartar approvals obsoletos e exigir aprovação do último push por outra pessoa;
4. checks estritos `quality`, `database` e `browser`;
5. administradores incluídos, sem force-push e sem exclusão;
6. resolução de conversas antes do merge.

Criar dois ambientes:

- `production`: somente branch protegida; secrets de deploy e integração; o workflow exige também
  registro G12 v2 com quatro responsáveis;
- `production-backup`: somente `main`; secrets exclusivos de banco e criptografia. Ele não deve ter
  aprovação manual por execução porque o backup diário precisa ser não assistido.

O guard de produção consulta a proteção pela API, lê CODEOWNERS e confere no PR associado ao SHA
dois approvals reais, atuais, distintos e diferentes do autor. Se required reviewers do ambiente
forem configurados em um plano Enterprise, ele também exige dois revisores e `prevent_self_review`.

## Lacuna que não pode ser automatizada

Dois usernames GitHub reais, distintos de `@Vnd93`, precisam receber acesso de revisão. Nenhuma
identidade foi inventada e nenhum outro perfil foi usado nesta execução. Até o plano e essas contas
serem definidos, a proteção permanece objetivamente pendente e o deploy falha fechado.
