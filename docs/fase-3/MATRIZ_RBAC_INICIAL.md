# Matriz RBAC inicial do CMS

Os papeis organizam a interface, mas a autorizacao real usa permissoes `cms:dominio.acao` verificadas no banco e, para comandos criticos, novamente na API administrativa.

| Papel       | Capacidades iniciais                                            | Restricoes principais                              |
| ----------- | --------------------------------------------------------------- | -------------------------------------------------- |
| Super Admin | todas as permissoes                                             | exige MFA `aal2`                                   |
| Admin       | operacao ampla, usuarios em leitura e auditoria                 | nao altera papeis, convites, suspensoes ou sessoes |
| Comercial   | catalogo, publicacao de produtos e operacao/exportacao de leads | sem usuarios, aparencia ou auditoria               |
| Marketing   | homepage, blog, SEO, campanhas e aparencia                      | sem publicacao de produtos ou exportacao de leads  |
| Tecnico     | dados tecnicos, revisao e diagnosticos                          | sem publicacao                                     |
| Editor      | criacao e edicao de conteudo                                    | sem aprovacao ou publicacao                        |
| Revisor     | revisao e aprovacao                                             | sem edicao ou publicacao                           |

## Regras invariantes

- Ser `rdo_admin` nao concede nenhuma permissao `cms:*`.
- Usuario suspenso nao recebe permissao, mesmo que mantenha atribuicoes historicas.
- Super Admin sem MFA `aal2` nao recebe permissoes administrativas.
- O frontend possui somente `select` sob RLS; convite, suspensao, papeis, sessoes e auditoria exigem comando server-side.
- Logs nao armazenam senha, token, e-mail digitado, IP bruto ou payload livre de formulario.
