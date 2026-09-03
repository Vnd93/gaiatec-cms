# Gate G5 — DAM sem órfãos e com direitos válidos

**Resultado atual:** G5 APROVADO — canary técnico concluído com 27/27 verificações<br>
**Produção:** bloqueada e inalterada<br>
**Staging EV2.5:** migration `0043`, funções candidatas e build isolado aplicados; flag global desligada e zero resíduo sintético

## Critérios objetivos

| Critério                 | Situação | Evidência necessária                                           |
| ------------------------ | -------- | -------------------------------------------------------------- |
| Schema aditivo/RLS       | aprovado | migration `0043`, nega escrita direta e preserva v1            |
| MIME/hash/tamanho/scan   | aprovado | assinatura, dimensões, pixels, tamanho e hash server-side      |
| Variantes/focal/crops    | aprovado | original preservado e crops dentro dos limites                 |
| ALT/origem/licença/owner | aprovado | metadados obrigatórios e editáveis com auditoria               |
| Vigência de direitos     | aprovado | expiração bloqueia publicação e assinatura pública             |
| Duplicidade/similaridade | aprovado | SHA reutiliza; dHash apenas sugere                             |
| Coleções/tags            | aprovado | organização idempotente e sem órfãos                           |
| Mapa de usos             | aprovado | vínculo localizado e exclusão/arquivo bloqueado                |
| Substituição/rollback    | aprovado | impacto prévio, resolução pública e retorno íntegro            |
| Retenção/GC              | aprovado | 30 dias, rechecagem transacional e job isolado                 |
| Picker contextual        | aprovado | escolher ou enviar sem sair do editor                          |
| Canary isolado           | aprovado | migration/funções/build somente em staging e limpeza sintética |

## Condições comprovadas

- CI local e remota verdes, incluindo pgTAP e teste adversarial do fluxo Edge.
- Zero referência órfã após upload, organização, crop, substituição, rollback, arquivamento e GC.
- 100% dos ativos sintéticos do canary com origem, owner, licença, ALT e estado de direitos coerentes.
- Ativo em uso não pode ser arquivado nem excluído e a resposta deve apresentar o impacto.
- Ativo expirado não recebe URL pública nem pode entrar em nova projeção publicada.
- Substituição não altera revisões históricas e o rollback restaura a resolução anterior.
- Flag global permanece desligada; somente usuário sintético recebe override temporário.
- Produção, staging estável e dados reais permanecem inalterados.

Todos os itens foram comprovados no staging autorizado. A EV2.6 está liberada para implementação local e posterior canary próprio, ainda sem qualquer autorização de produção.

## Evidências

- A migration completa foi aceita pelo PostgreSQL 17.6 do staging em transação revertida.
- Após o `ROLLBACK`, três verificações independentes confirmaram: nenhuma tabela DAM, nenhuma coluna EV2.5 e nenhuma versão `0043` persistidas.
- O runner do canary limita o GC ao identificador da fixture sintética, usa MFA/AAL2 para ações críticas e falha se a limpeza não for concluída.
- A migration `0043` foi aplicada somente no projeto `glcqsosxwgmlhzgcsnzv` (`GAIATEC CMS Staging`, `us-east-2`).
- `cms-media` v13, `cms-public` v30 e `cms-preview` v18 terminaram ativas; a primeira exige JWT e as duas últimas preservam a configuração pública vigente.
- O deployment `e154fd1a-e649-47de-b8f4-2d918010cf0e`, originado de `405b84a`, ficou restrito ao alias `ev2-g5-canary` e passou no smoke HTTP com `noindex`.
- O canary concluiu 27/27 verificações, recusou o envelope de produção e registrou zero mutação em dados reais.
- A auditoria independente confirmou zero usuário, perfil, papel, override, conteúdo, ativo, coleção, receipt, evento, job, log ou objeto sintético remanescente.

Consulte o [relatório completo do canary](RELATORIO_CANARY_STAGING_2026-09-02.md).
