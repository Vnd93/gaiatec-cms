# Gate G14 — IA transacional controlada

**Decisão atual:** PENDENTE (`pause`)<br>
**Escopo candidato:** somente fixtures sintéticas no alias isolado de staging<br>
**Produção, dados reais, domínios reais e provider externo:** bloqueados

## Critérios vinculantes

| Critério     | Evidência exigida                                                      | Estado atual                     |
| ------------ | ---------------------------------------------------------------------- | -------------------------------- |
| CI integral  | format, lint, typecheck, testes, evals, build e audit sem alta/crítica | aprovado localmente              |
| Contrato     | cinco tools fechadas, schemas estritos, erro preserva estado           | candidato local                  |
| Flags        | `ev2.ai_assist` + `ev2.ai_execute` default-off e individual ≤30 min    | implementado; remoto pendente    |
| Migration    | `0054` aditiva, rehearsal com rollback e pgTAP                         | preparado; não executado         |
| Função       | somente `cms-ai-execute`, provider-off e JWT/MFA                       | candidato local; deploy pendente |
| Candidato    | SHA completo no alias `ev2-g14-canary`, health/manifest exatos         | pendente                         |
| Identidade   | dois usuários sintéticos MFA, sem credenciais persistentes             | executor preparado               |
| Segregação   | autor não aprova; aprovador não executa; hash e TTL exatos             | local aprovado; remoto pendente  |
| Atomicidade  | falha deixa zero aplicação parcial; locks seguem ordem global          | local aprovado; remoto pendente  |
| Idempotência | replay e resposta ambígua reutilizam comando/chave; divergência falha  | local aprovado; remoto pendente  |
| Compensação  | snapshot íntegro, renovação após expiração e versão monotônica         | local aprovado; remoto pendente  |
| Negativos    | produção, dado real, PII, injeção, tool/escopo amplo recusados         | local aprovado; remoto pendente  |
| Resíduo      | zero usuário, override, credencial e fixture sintética                 | pendente                         |
| Limites      | zero mutação real/produção/staging estável e zero chamada externa      | pendente                         |
| Revisão      | revisão técnica/segurança independente vinculada ao SHA                | pendente                         |

## Regra de decisão

G14 só muda para `APROVADO` quando todas as linhas estiverem atendidas pelo mesmo SHA e as
evidências sanitizadas estiverem versionadas. Falha de limpeza, vínculo, segregação, atomicidade,
idempotência, compensação ou fronteira de dados produz `pause` imediato.

O workflow de preview não aprova o gate. Migration, função, build candidato, pgTAP, executor
integrado e limpeza são evidências independentes e cumulativas.

## O que G14 não autoriza

Mesmo aprovado, G14 valida apenas o sandbox sintético. Ele não permite apontar as tools para
conteúdo real, habilitar provider externo, configurar domínio real, promover o staging estável,
alterar produção ou fundir a branch. Cada expansão exige autorização e gate próprios.
