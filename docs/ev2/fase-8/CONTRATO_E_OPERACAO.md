# Contrato e operação do RBAC escopado EV2.8

## Limite de confiança

O navegador nunca escolhe a autorização efetiva. Ele envia um envelope validado e exibe a decisão devolvida pelo servidor. A função `cms-scopes` autentica o JWT, confirma ambiente e origem, aplica limite de requisições e chama RPCs exclusivamente com `service_role`. As tabelas e RPCs internas não são acessíveis por `anon` nem `authenticated`.

O escopo da EV2.8 é fixo em `siteKey=main` e em `environment=local|staging`. Produção é recusada na API e no banco. Essa restrição será revista apenas em uma fase futura explicitamente autorizada.

## Ativação e compatibilidade

1. `ev2.rbac_scoped` permanece globalmente desligada.
2. Sem override individual, `cms_actor_authorized` e a RLS preservam os papéis atuais de `cms_user_roles`.
3. Com exatamente um override individual ativo, o ambiente desse override seleciona somente concessões de `cms_scoped_role_assignments` para `main/ambiente`.
4. Dois overrides individuais simultâneos para a mesma identidade, override amplo, ativação global ou ambiente de produção resultam em negação segura.
5. O kill switch ou a remoção/expiração do override restaura imediatamente o RBAC atual.

Esse desenho permite canary sem bifurcar cada API existente: as funções de domínio continuam chamando o mesmo ponto central de autorização, que troca a fonte de papéis somente para a identidade selecionada.

## Contrato HTTP

`POST /functions/v1/cms-scopes` aceita um corpo estrito com `schemaVersion=1`, `commandId`, `correlationId`, `occurredAt` e `actorContext`.

| Ação         | Permissão                   | Resultado                                                       |
| ------------ | --------------------------- | --------------------------------------------------------------- |
| `capability` | sessão válida               | informa ativação sem expor concessões                           |
| `list`       | `cms:scopes.read`           | concessões do escopo e catálogo de papéis                       |
| `decisions`  | `cms:policy_decisions.read` | decisões recentes do mesmo site/ambiente                        |
| `evaluate`   | sessão escopada             | decisão `allow/deny` registrada, sem mutação                    |
| `grant`      | `cms:scopes.manage` + AAL2  | cria ou reativa concessão com recibo idempotente                |
| `revoke`     | `cms:scopes.manage` + AAL2  | revoga concessão na versão informada com auditoria before/after |

Respostas de segurança: `401` sem sessão, `403` sem permissão/fora do escopo, `412` sem AAL2, `409` para idempotência, versão ou segregação e `422` para concessão estruturalmente inválida.

## Invariantes

- uma linha por usuário, papel, site e ambiente;
- concessão direta não expira;
- delegação sempre expira, no máximo 30 dias após sua criação;
- `super_admin` nunca é delegado temporariamente;
- uma identidade não concede nem revoga o próprio papel;
- o último `super_admin` ativo do escopo não pode ser revogado;
- reativar uma linha revogada/expirada exige sua `lockVersion` atual;
- uma chave idempotente repetida com o mesmo corpo devolve o mesmo recibo;
- a mesma chave com corpo diferente falha sem efeito;
- decisões e auditoria armazenam somente hash SHA-256 do identificador de sessão;
- toda mutação bem-sucedida atualiza um recibo e grava exatamente um evento de auditoria na mesma transação.

## Papéis adicionais

- `auditor`: leitura de usuários, papéis, scopes, auditoria, decisões e flags; não altera concessões.
- `support`: leitura de usuários/papéis/scopes e revogação controlada de sessões; não convida, suspende nem altera papéis.

Os papéis existentes são preservados. `super_admin` administra scopes; `admin` apenas os consulta. Alterações futuras na matriz continuam aditivas, revisadas e auditáveis.

## Rollback

O rollback operacional preferencial é remover os overrides individuais ou acionar o kill switch; isso restaura os papéis atuais sem apagar dados. Depois, restaura-se o build/versões anteriores de `cms-scopes` e `cms-session`. As tabelas aditivas permanecem para análise. Qualquer correção do ponto central de autorização deve ser uma nova migration, nunca um `DROP` improvisado.
