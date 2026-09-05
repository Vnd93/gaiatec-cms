# Plano de canary G12 em staging

## Escopo autorizado por execução

- projeto Cloudflare: `gaiatec-cms-staging`;
- alias isolado: `ev2-g12-canary.gaiatec-cms-staging.pages.dev`;
- branch: `ev2/desenvolvimento-fases-1-a-12`;
- artefato: SHA completo informado e validado pelo workflow;
- banco: Supabase `GAIATEC CMS Staging` (`glcqsosxwgmlhzgcsnzv`);
- atores: dois usuários sintéticos com MFA/AAL2 e papéis distintos;
- flags: somente overrides individuais, com duração máxima de 30 minutos;
- dados: exclusivamente sintéticos; nenhuma integração externa real.

O alias estável `gaiatec-cms-staging.pages.dev`, produção, domínios reais, flags globais e dados reais
ficam fora do escopo.

## Sequência

1. Congelar e registrar o SHA candidato; confirmar CI verde e `npm audit --audit-level=high`.
2. Executar o workflow `EV2.12 Canary Preview` com confirmação `CANARY-G12-STAGING`.
3. Conferir igualdade do SHA em `/healthz`, `X-Release` e `release-manifest.json`.
4. Executar smoke, acessibilidade e probe G12 automático no deployment imutável.
5. No host autenticado e vinculado exclusivamente a staging, definir o SHA e executar
   `npm run canary:ev2:phase12`.
6. O executor reutiliza a prova sistêmica G11 já homologada: cria dois atores sintéticos MFA,
   overrides individuais de até 30 minutos, valida autenticação negativa, comandos, leads/outbox,
   diagnóstico, restore e limpeza.
7. Executar três lotes HTTP consecutivos contra o G12, conferindo release, projeção pública e budgets.
8. Desligar/remover overrides, revogar sessões e apagar fixtures sintéticas mesmo diante de falha.
9. Confirmar zero resíduo e que os aliases estáveis não mudaram.
10. Registrar medições observadas e decisão; não repetir os canaries funcionais G2–G11 sem um achado
    novo.

Exemplo PowerShell, somente após autorização do SHA:

```powershell
$env:EV2_G12_EXPECTED_SHA = "<sha-completo-autorizado>"
$env:EV2_G12_REPORT_PATH = "outputs/g12-canary-report.json"
npm run canary:ev2:phase12
Remove-Item Env:EV2_G12_EXPECTED_SHA, Env:EV2_G12_REPORT_PATH
```

## Budgets mínimos

| Sinal                                  | Limite                            |
| -------------------------------------- | --------------------------------- |
| disponibilidade HTTP                   | >= 99,9%                          |
| taxa HTTP 5xx                          | <= 0,1%                           |
| página pública p95                     | <= 1.500 ms                       |
| leitura admin backend p95              | <= 500 ms                         |
| comando backend p95                    | <= 800 ms                         |
| outbox p95                             | <= 60 s, sem crescimento          |
| segurança/privacidade                  | zero incidente; reviews aprovadas |
| P0/P1, divergência, a11y crítica/séria | zero                              |
| publicação/restore                     | RPO 0; RTO <= 15 min              |

## Abortamento e limpeza

Mismatch de alvo/SHA, falha de autenticação/MFA, tentativa de escopo amplo, dado não sintético ou
violação de budget interrompe a sessão. A limpeza é obrigatória mesmo quando o canary falha. Nenhuma
evidência pode conter token, chave, senha, e-mail real ou payload pessoal.

## Evidência de saída

O relatório deve conter SHA, URLs imutável/alias, deployment id, horários, atores pseudonimizados,
flags/expirações, testes, métricas com amostra, resultado da limpeza e decisão. Até esse relatório
existir, G12 permanece não aprovado.
