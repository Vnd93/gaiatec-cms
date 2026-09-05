# Inventário de campos classificatórios — F10

| Entidade | Campo anterior/livre        | Dimensão controlada                                        | Obrigatório          | Exposição                           |
| -------- | --------------------------- | ---------------------------------------------------------- | -------------------- | ----------------------------------- |
| Produto  | `classification.segment`    | `product.category` / `productCategory`                     | sim                  | somente rótulo/slug se público      |
| Produto  | `classification.category`   | `product.application_magnitude` / `applicationMagnitude`   | sim                  | somente rótulo/slug se público      |
| Produto  | `technology`                | `product.technology` / `technology`                        | sim                  | respeita visibilidade de tecnologia |
| Produto  | `classification.family`     | `product.installation_operation` / `installationOperation` | sim                  | somente rótulo/slug se público      |
| Produto  | inexistente/livre implícito | `product.monitored_element` / `monitoredElement`           | sim                  | somente rótulo/slug se público      |
| Serviço  | `serviceKind`               | `service.category` / `serviceKindRef`                      | sim em nova gravação | somente rótulo/slug se público      |

Os campos anteriores permanecem como snapshots de compatibilidade preenchidos pelo servidor. Não são fonte de opções no editor nem podem criar termos. Marca, fabricante/OEM, linha, modelo comercial, referência de fabricante e SKU não pertencem a esse vocabulário; seguem o contrato de visibilidade interna da ADR-012.

## Próximos candidatos, sem implementação editorial nesta fase

Indústria, aplicação, solução, tipos de documento e agrupamentos de campanha podem adotar o mesmo contrato após inventário, autorização de valores e matriz de consumidores. Nenhuma opção foi inferida ou importada.
