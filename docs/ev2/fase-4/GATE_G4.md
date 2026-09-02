# Gate G4 — PIM íntegro e compatível com v1

**Resultado atual:** G4 PENDENTE — EV2.5 BLOQUEADA<br>
**Produção:** bloqueada<br>
**Staging EV2.4:** não iniciado

## Evidências disponíveis no branch

| Critério             | Situação                  | Evidência                                          |
| -------------------- | ------------------------- | -------------------------------------------------- |
| Schema aditivo/RLS   | implementado localmente   | migration `0041_ev2_pim_core.sql`                  |
| Contratos/API        | implementado localmente   | Zod, `cms-pim` e `cms-attributes`                  |
| Editor guiado        | implementado localmente   | `/admin/pim`, gate duplo e testes de componente    |
| Identidade/SKU       | coberto em teste          | unicidade, imutabilidade, idempotência e histórico |
| Atributos/unidades   | coberto em teste          | attribute sets e conversão L/s → m³/h              |
| Adapter v1           | coberto em teste unitário | projeção e comparação estrutural                   |
| Banco integrado      | aguardando CI             | suíte pgTAP com 35 asserções específicas           |
| Piloto/reconciliação | não executado             | exige autorização própria para staging e dados     |

## Critérios objetivos para aprovação

- CI completa verde, incluindo as 35 asserções pgTAP da EV2.4.
- Canary sintético isolado em staging com migration `0041`, duas funções e build candidato explicitamente habilitado.
- Limpeza comprovada do usuário, override, produtos, modelos, variantes, SKUs, atributos e proveniência sintéticos.
- Fontes ERP/MPN/GTIN/NCM e regra de SKU aprovadas pelos responsáveis.
- Lote de 20–50 produtos previamente autorizado, sem inferência silenciosa.
- 100% dos campos críticos do round-trip sem divergência e completude mínima de 95% no piloto.
- Busca por faixa demonstra conversão de unidade e interseção correta.
- Rollback lógico testado com v1 operacional e v2 inerte.

## Estado e decisão

A implementação candidata está pronta para validação automatizada, mas a migration `0041` não foi aplicada em staging, as funções não foram publicadas e nenhum dado real ou sintético da EV2.4 foi criado remotamente. Portanto, G4 permanece pendente e a EV2.5 não está liberada.

Executar staging, piloto, dual-write, produção ou promover qualquer alias requer autorização posterior e explícita; a autorização concedida para o canary EV2.3 não se transfere para esta fase.
