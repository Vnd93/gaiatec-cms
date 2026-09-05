# Evidências dos controles de prontidão — 5 de setembro de 2026

## Verificações externas sem mutação

- GitHub `Vnd93/gaiatec-cms`: privado, rulesets não aplicáveis no plano atual, sem ruleset e somente
  ambiente `preview`;
- Supabase `GAIATEC CMS Production`: ref. `chfuhctnhqgyjowkvllv`, região `us-east-2`, plano Free,
  estado `ACTIVE_HEALTHY`, sem migrations, funções, dados ou secrets;
- staging `glcqsosxwgmlhzgcsnzv`: preservado e saudável;
- Resend: integração existente confirmada no código; nenhuma credencial produtiva lida ou copiada.

## Alterações técnicas verificadas

- CSP seleciona Report-Only ou enforcement a partir do ambiente real;
- origens BrasilAPI e Nominatim adicionadas e Resend removido do browser;
- backup externo cifra antes do upload e restaura o mesmo ciphertext em ambiente efêmero;
- provider check vincula domínio e entrega sintética ao SHA;
- proteção exige duas revisões reais e CODEOWNERS;
- G12 approval schema v2 exige DPO/legal, quatro owners, todos os controles e autorização com SHA.

Validação inicial:

- `npm run test:ev2:phase12`: 10/10;
- `npm run test:ev2:phase16`: 5/5;
- produção, dados reais, domínio real e staging estável: zero mutações.

## Evidências ainda inexistentes

Não foram fabricados: ruleset/proteção efetiva, reviewers, CODEOWNERS, backup real, restore real,
parecer DPO/legal, chave Resend de produção, entrega sintética produtiva, canary CSP do SHA final,
quatro identidades operacionais ou autorização de produção. Esses itens continuam bloqueando G12.
