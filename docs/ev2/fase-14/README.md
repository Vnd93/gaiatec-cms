# EV2.14 — IA transacional controlada

**Estado:** candidato local implementado; Gate G14 pendente<br>
**Data-base:** 4 de setembro de 2026<br>
**Branch:** `ev2/fase-14-ia-transacional-controlada`<br>
**Produção e dados reais:** bloqueados

## Objetivo

Implementar a fundação segura da F-016 sem conceder à IA acesso direto ao CMS real. O primeiro
incremento opera somente sobre alvos `g14x-*` classificados como sintéticos, em `local` ou no alias
isolado de staging, com provedor externo desligado.

O fluxo completo é: plano estruturado, dry-run determinístico, hash imutável, aprovação por outro
ator MFA, execução atômica de ferramentas fechadas, verificação do estado e compensação também
aprovada por outro ator.

## Entregas

- migration aditiva `0054_ev2_ai_transactional.sql`;
- Edge Function `cms-ai-execute` com contrato estrito, rate limit fail-closed e filtro de entrada;
- tela `/admin/assistente/execucao` e fallback para os fluxos manuais;
- cinco ferramentas sintéticas, todas reversíveis e server-side;
- contratos Zod, testes unitários/de componente, pgTAP e eval adversarial;
- rehearsal transacional com rollback e executor de canary G14, ambos travados por autorização;
- workflow manual do candidato no alias `ev2-g14-canary`;
- ADR-023 e documentação operacional deste diretório.

## Limites vinculantes

- `ev2.ai_assist` e `ev2.ai_execute` permanecem desligadas por padrão;
- habilitação somente por dois overrides individuais, sem escopo amplo, por no máximo 30 minutos;
- MFA/AAL2 em toda mutação;
- dois atores: criador/executor e revisor; o aprovador não executa a ação que aprovou;
- aprovação de dez minutos vinculada ao hash e à versão exatos do plano;
- compensação reautorizável após expiração, com histórico preservado e uma única aprovação ativa;
- resposta ambígua repete o mesmo comando/chave e bloqueia nova mutação até reconciliação;
- mudança do plano invalida a aprovação anterior;
- nenhum acesso às tabelas editoriais, domínios reais, produção ou rede externa;
- nenhuma promoção do staging estável.

## Ordem de leitura

1. [Contrato e operação](CONTRATO_E_OPERACAO.md)
2. [Ameaças e controles](AMEACAS_E_CONTROLES.md)
3. [Gate G14](GATE_G14.md)
4. [Plano do canary em staging](PLANO_CANARY_STAGING.md)
5. [Relatório de validação local](RELATORIO_VALIDACAO_LOCAL_2026-09-04.md)
6. [Correções da revisão técnica](RELATORIO_CORRECOES_REVISAO_2026-09-05.md)
7. [ADR-023](../../adr/ADR-023-ia-transacional-sintetica-e-aprovacao-por-hash.md)

## Verificação local

```powershell
npm run test:ev2:phase14
npm run eval:ev2:phase14
npm run typecheck
npm run lint
npm run test
npm run build
```

`npm run canary:ev2:phase14:validate` e `npm run canary:ev2:phase14` são operações de staging e
não fazem parte da validação local. Elas recusam execução sem as frases explícitas descritas no plano
de canary.

## Próximo passo controlado

Concluir CI no SHA candidato e revisão independente. Depois, mediante nova autorização que nomeie
o SHA e o escopo, executar o rehearsal da migration `0054`, aplicar migration/função/build no alias
isolado e rodar o canary com dois usuários sintéticos MFA. G14 permanece `pause` até as evidências
remotas e o pgTAP estarem vinculados ao mesmo SHA.
