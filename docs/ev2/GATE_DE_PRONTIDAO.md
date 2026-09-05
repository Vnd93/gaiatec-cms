# Gate de prontidão para desenvolvimento EV2

**Decisão:** APROVADO PARA INICIAR A FASE EV2.0<br>
**Escopo aprovado:** baseline, ADRs, métricas, protótipos, lote piloto e fundação de entrega segura<br>
**Não aprovado por este gate:** deploy, migration remota, dados reais, ativação de feature ou produção
**Branch de trabalho:** `ev2/fase-0-documentacao-e-planejamento`

## Evidências de entrada

- A especificação canônica contém as 30 seções requeridas, F-001–F-018, RB-001–RB-060, matriz de impacto, rastreabilidade, fases EV2.0–EV2.12, riscos, rollback, homologação e checklist.
- O ciclo anterior possui ADRs, evidências por fase e auditoria local/staging de 2026-09-01.
- A validação local de referência foi concluída com 149 testes automatizados aprovados, typecheck e build de produção; permaneceram 46 avisos de lint e chunks conhecidos de Excel/PDF acima de 600 kB.
- O repositório possui remote `origin` configurado e a documentação EV2 está isolada das alterações funcionais existentes.
- As decisões externas e organizacionais estão registradas com responsável e gate limite, sem serem mascaradas como requisito já resolvido.

## Condições para trabalhar na EV2.0

- Preservar contratos v1, Supabase, RLS, RBAC, MFA/AAL2, revisões, projeções públicas e fallback manual.
- Começar capacidades novas desligadas por padrão e protegidas por feature flags.
- Não misturar limpeza ampla, deploy ou migração remota com a primeira entrega.
- Medir o fluxo atual de 5–8 tarefas reais antes de aceitar ganhos de UX ou automação.
- Registrar decisões arquiteturais em ADR e manter requisitos, implementação, testes e aceite rastreáveis.
- Impedir avanço quando houver regressão, divergência v1/v2, falha de autorização/isolamento, migration não reversível ou perda de integridade.

## Decisões iniciais concluídas

EV2-A01, EV2-A02 e EV2-D01 foram resolvidas: owners interinos nomeados, lote de 20 produtos/8 tarefas selecionado e multisite definido como plataforma futura preparada, com ativação somente após os gates da EV2.9. As demais decisões possuem marcos posteriores e estão detalhadas em [Decisões e ações necessárias](DECISOES_E_ACOES_NECESSARIAS.md).

## Cuidados com o estado local

No momento desta organização, o working tree já continha alterações funcionais em andamento. Elas foram preservadas. A primeira tarefa de implementação deve manter commits pequenos e escopados, sem reset destrutivo e sem incorporar mudanças não relacionadas por engano.

## Critério de saída da EV2.0

A EV2.0 somente pode ser encerrada quando baseline e métricas estiverem registradas, ADRs obrigatórios estiverem aprovados, owners e lote piloto estiverem definidos, estratégia de compatibilidade/flags estiver testável e o plano da EV2.1 estiver fatiado em tickets com aceite e rollback.
