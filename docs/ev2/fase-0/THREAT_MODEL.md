# Threat model EV2

**Método:** STRIDE aplicado às fronteiras de confiança e regras de negócio da EV2<br>
**Revisão obrigatória:** quando surgir nova fronteira, provider, tenant, ação crítica ou fluxo de dados

## Ativos e fronteiras

Ativos protegidos: identidade do usuário, escopos RBAC, conteúdo/revisões, dados PIM, mídia/direitos, releases/snapshots, auditoria, credenciais, leads/PII e projeção pública.

Fronteiras: navegador público, navegador admin autenticado, Edge Functions, Postgres/RLS, Storage, workers/outbox, providers externos e futuro contexto multisite. O navegador e toda entrada importada/gerada por IA são não confiáveis.

## Ameaças e controles obrigatórios

| ID      | STRIDE                 | Cenário                                                       | Impacto | Controles preventivos/detectivos                                                  | Teste/gate                   |
| ------- | ---------------------- | ------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------- | ---------------------------- |
| `TM-01` | Spoofing               | token roubado ou sessão abaixo de AAL2 executa ação crítica   | crítico | JWT validado no servidor, sessão curta, AAL2, reautenticação e revogação          | auth negativa/G1/G8          |
| `TM-02` | Tampering              | cliente altera status, owner, `site_id` ou versão             | crítico | allowlist server-side, RLS, state machine e `expectedLockVersion`                 | contrato/RLS/G1–G8           |
| `TM-03` | Repudiation            | publicação, aprovação ou rollback sem autoria comprovável     | crítico | auditoria append-only, correlation/idempotency key, hash do plano e ator          | audit coverage/G7/G8         |
| `TM-04` | Information disclosure | rascunho, PII, URL privada ou segredo aparece em API/log      | crítico | projeções separadas, deny-by-default, sanitização e varredura de logs             | testes de projeção/log/G1/G8 |
| `TM-05` | Denial of service      | upload, busca, importação ou IA esgota recursos               | alto    | limites, paginação, quotas, fila, timeout, circuit breaker e backpressure         | carga/G5/G6/G10/G11          |
| `TM-06` | Elevation              | usuário edita grant, aprova o próprio release ou cruza escopo | crítico | segregação, permission eval server-side, MFA e teste negativo                     | G7/G8                        |
| `TM-07` | Tampering              | retry duplica comando, SKU, mídia ou publicação               | alto    | idempotency key com request hash, unicidade e recibo persistido                   | idempotência/G1/G4/G7        |
| `TM-08` | Tampering              | corrida sobrescreve rascunho/revisão                          | alto    | optimistic concurrency, 409, diff e resolução explícita                           | conflito/G2                  |
| `TM-09` | Disclosure             | tenant/site futuro consulta dados de outro site               | crítico | `site_id` obrigatório no servidor, RLS e tenant escape tests                      | G9 antes de ativar           |
| `TM-10` | Tampering              | release parcial diverge site, busca, menu e SEO               | crítico | bundle, validação, snapshot, outbox e confirmação somente após convergência       | G1/G7/G11                    |
| `TM-11` | Disclosure             | mídia sem direito/origem é publicada ou URL privada vaza      | alto    | proveniência, licença, ALT, scan, signed URL e quality gate                       | G5/G6                        |
| `TM-12` | Spoofing/Tampering     | planilha, HTML ou SVG injeta fórmula/script                   | alto    | parse seguro, neutralização de fórmula, MIME real, scan e renderização isolada    | import/DAM/G5/G7             |
| `TM-13` | Tampering              | prompt injection induz IA a executar ou omitir restrições     | crítico | conteúdo como dado, tools allowlist, preview/diff, aprovação humana e policy gate | red-team/G10                 |
| `TM-14` | Disclosure             | provider de IA recebe PII, segredo ou conteúdo não autorizado | crítico | classificação, redaction, minimização, consentimento e política por provider      | privacy eval/G10             |
| `TM-15` | Repudiation            | rollback destrutivo apaga histórico                           | alto    | rollback como novo evento/release; snapshots imutáveis                            | restore drill/G7/G11         |
| `TM-16` | DoS/Tampering          | flag mal escopada ativa código incompleto globalmente         | alto    | default-off, kill switch, rollout determinístico e auditoria                      | flag tests/G1                |

## Abuso por domínio

- Rascunho nunca pode surgir na API pública, sitemap ou busca.
- Aprovação fica inválida se o hash do release mudar.
- Editor não aprova a própria alteração quando segregação for exigida.
- SKU/identificadores imutáveis não são reutilizados após inativação.
- Exclusão de mídia com uso ativo é recusada; arquivo entra em quarentena antes de remoção.
- IA sugere; ações transacionais exigem plano, diff e confirmação dentro do escopo do usuário.

## Resposta e evidência

Qualquer suspeita crítica exige desligar a flag, preservar logs/snapshots, revogar sessão quando aplicável, classificar impacto, abrir incidente e executar o runbook. Nenhum log de evidência pode reproduzir token, segredo ou PII.
