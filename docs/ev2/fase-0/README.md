# EV2.0 — diagnóstico e baseline

**Status:** concluída para desenvolvimento local da EV2.1<br>
**Data-base:** 1 de setembro de 2026<br>
**Gate:** G0 aprovado com controle humano obrigatório antes do G2

## Objetivo

Congelar a evidência verificável, as decisões estruturais e os limites de segurança necessários para iniciar a evolução do CMS sem alterar banco remoto, dados reais ou comportamento produtivo.

## Artefatos

- [Backlog executável](BACKLOG_EXECUTAVEL.md)
- [Baseline técnico](BASELINE_TECNICO.md)
- [Baseline das tarefas](BASELINE_TAREFAS.md)
- [Threat model](THREAT_MODEL.md)
- [Plano de feature flags e rollback](PLANO_FLAGS_ROLLBACK.md)
- [Gate G0](GATE_G0.md)
- [Lote piloto de 20 produtos e 8 tarefas](../LOTE_PILOTO_EV2_0.md)
- [ADR-016 — compatibilidade v1/v2 e command envelope](../../adr/ADR-016-compatibilidade-v1-v2-e-command-envelope.md)
- [ADR-017 — feature flags seguras](../../adr/ADR-017-feature-flags-seguras.md)
- [ADR-018 — release bundle e rollback](../../adr/ADR-018-release-bundle-e-rollback.md)
- [ADR-019 — rascunho, publicação e concorrência](../../adr/ADR-019-rascunho-publicacao-e-concorrencia.md)
- [ADR-020 — identidade PIM e proveniência](../../adr/ADR-020-identidade-pim-e-proveniencia.md)

## Evidência automatizada

Execute:

```bash
npm run test:ev2:phase0
```

O teste rejeita ausência dos artefatos, lote fora de 20–50 itens, tarefas fora de 5–8, ADRs incompletos, feature nova ligada por padrão e autorização indevida de produção.

## Restrições

- Nenhuma migration ou chamada remota integra esta fase.
- Tempos de operador não foram inventados. A rodada humana está roteirizada e é obrigatória antes de aceitar ganhos de UX no G2.
- A liberação do G0 autoriza código e testes locais da EV2.1; staging, dados reais e produção continuam sujeitos aos respectivos gates.
