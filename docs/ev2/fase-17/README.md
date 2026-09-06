# EV2.17 — CMS operacional e IA real controlada

**Estado em 6 de setembro de 2026:** implementação e canary G17 aprovados em staging para o
candidato `7abe356b0f4503d6b87fd00d50acee20ab794d6d`.

## Objetivo

Tornar os módulos EV2 utilizáveis pelo CMS sem liberar recursos de forma ampla. O acesso continua
condicionado ao manifesto calculado no servidor, MFA/AAL2 e override individual. A integração de IA
usa exclusivamente `nvidia/nemotron-3.5-lightning:free` no OpenRouter e produz propostas que exigem
revisão humana; ela não aplica nem publica conteúdo automaticamente.

## Controles preservados

- flags permanecem desligadas por padrão;
- override amplo é recusado e o individual é obrigatório;
- produção depende também de `CMS_EV2_PRODUCTION_ENABLED=true` no servidor;
- nenhum fallback de modelo ou provedor pago;
- prompt, fonte, resposta e chave do provedor não entram no log de auditoria;
- falha do provedor preserva o cadastro manual;
- identidade sintética pode ser removida sem apagar o histórico imutável;
- nenhuma mudança desta fase foi aplicada em produção.

## Evidências

- [Relatório do canary G17](RELATORIO_CANARY_G17_2026-09-06.md)
- [Evidência estruturada do canary](evidencias/G17_CANARY_7abe356.json)

## Próximo gate

Revisar o candidato e homologar a operação do CMS no alias isolado. Uma eventual ativação em
produção exigirá autorização nova e literal vinculada ao SHA exato escolhido; este documento não a
concede.

