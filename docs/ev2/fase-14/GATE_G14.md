# Gate G14 — IA transacional controlada

**Decisão atual:** PENDENTE (`pause` — tentativa no SHA `81e0420` interrompida de forma segura)<br>
**Escopo candidato:** somente fixtures sintéticas no alias isolado de staging<br>
**Produção, dados reais, domínios reais e provider externo:** bloqueados

## Critérios vinculantes

| Critério     | Evidência exigida                                                      | Estado atual                     |
| ------------ | ---------------------------------------------------------------------- | -------------------------------- |
| CI integral  | format, lint, typecheck, testes, evals, build e audit sem alta/crítica | correção aprovada localmente     |
| Contrato     | cinco tools fechadas, schemas estritos, erro preserva estado           | candidato local                  |
| Flags        | `ev2.ai_assist` + `ev2.ai_execute` default-off e individual ≤30 min    | implementado; remoto pendente    |
| Migration    | `0054` aditiva, rehearsal com rollback e pgTAP                         | aplicada em staging; 58/58 pgTAP |
| Função       | somente `cms-ai-execute`, provider-off e JWT/MFA                       | publicada em staging             |
| Candidato    | SHA completo no alias `ev2-g14-canary`, health/manifest exatos         | novo SHA/revisão pendentes       |
| Identidade   | dois usuários sintéticos MFA, sem credenciais persistentes             | executor preparado               |
| Segregação   | autor não aprova; aprovador não executa; hash e TTL exatos             | local aprovado; remoto pendente  |
| Atomicidade  | falha deixa zero aplicação parcial; locks seguem ordem global          | local aprovado; remoto pendente  |
| Idempotência | replay e resposta ambígua reutilizam comando/chave; divergência falha  | local aprovado; remoto pendente  |
| Compensação  | snapshot íntegro, renovação após expiração e versão monotônica         | local aprovado; remoto pendente  |
| Negativos    | produção, dado real, PII, injeção, tool/escopo amplo recusados         | local aprovado; remoto pendente  |
| Resíduo      | zero usuário, override, credencial e fixture sintética                 | pendente                         |
| Limites      | zero mutação real/produção/staging estável e zero chamada externa      | respeitados na tentativa         |
| Revisão      | revisão técnica/segurança independente vinculada ao SHA                | novo SHA pendente                |

## Regra de decisão

G14 só muda para `APROVADO` quando todas as linhas estiverem atendidas pelo mesmo SHA e as
evidências sanitizadas estiverem versionadas. Falha de limpeza, vínculo, segregação, atomicidade,
idempotência, compensação ou fronteira de dados produz `pause` imediato.

O workflow de preview não aprova o gate. Migration, função, build candidato, pgTAP, executor
integrado e limpeza são evidências independentes e cumulativas.

## Tentativa fail-closed no SHA aprovado

O REV-01 aprovou `81e042070775062faf8e13505894b8d31a5931ca`. O candidato foi publicado somente
no alias isolado e passou por rehearsal, migration, pgTAP, função, smoke, release/health e
acessibilidade. A sonda HTTP conservou `pause` por latência da rota `/produtos` e o executor G14
interrompeu antes de criar os usuários ao detectar `404` na rota administrativa válida
`/admin/assistente/execucao`.

A causa era um inventário incompleto de rotas no Worker. A correção inclui todas as seis superfícies
afetadas e um teste de regressão do inventário administrativo completo. O relatório sanitizado da
tentativa comprova `externalProviderCalls=0`, `realDataUsed=false`, `productionMutations=0` e
`syntheticResidue=0`. Nenhuma nova tentativa pode ocorrer até CI e revisão independente aprovarem o
novo SHA.

## O que G14 não autoriza

Mesmo aprovado, G14 valida apenas o sandbox sintético. Ele não permite apontar as tools para
conteúdo real, habilitar provider externo, configurar domínio real, promover o staging estável,
alterar produção ou fundir a branch. Cada expansão exige autorização e gate próprios.
