# Gate G5 — DAM sem órfãos e com direitos válidos

**Resultado atual:** G5 CANDIDATO VALIDADO — canary persistente ainda não autorizado/executado<br>
**Produção:** bloqueada<br>
**Staging EV2.5:** sem migration, função, flag ou build candidato aplicados até o fechamento das validações locais

## Critérios objetivos

| Critério                 | Situação       | Evidência necessária                                           |
| ------------------------ | -------------- | -------------------------------------------------------------- |
| Schema aditivo/RLS       | local aprovado | migration `0043`, nega escrita direta e preserva v1            |
| MIME/hash/tamanho/scan   | local aprovado | assinatura, dimensões, pixels, tamanho e hash server-side      |
| Variantes/focal/crops    | local aprovado | original preservado e crops dentro dos limites                 |
| ALT/origem/licença/owner | local aprovado | metadados obrigatórios e editáveis com auditoria               |
| Vigência de direitos     | local aprovado | expiração bloqueia publicação e assinatura pública             |
| Duplicidade/similaridade | local aprovado | SHA reutiliza; dHash apenas sugere                             |
| Coleções/tags            | local aprovado | organização idempotente e sem órfãos                           |
| Mapa de usos             | local aprovado | vínculo localizado e exclusão/arquivo bloqueado                |
| Substituição/rollback    | local aprovado | impacto prévio, resolução pública e retorno íntegro            |
| Retenção/GC              | local aprovado | 30 dias, rechecagem transacional e job isolado                 |
| Picker contextual        | local aprovado | escolher ou enviar sem sair do editor                          |
| Canary isolado           | pendente       | migration/funções/build somente em staging e limpeza sintética |

## Condições para aprovação

- CI local e remota verdes, incluindo pgTAP e teste adversarial do fluxo Edge.
- Zero referência órfã após upload, organização, crop, substituição, rollback, arquivamento e GC.
- 100% dos ativos sintéticos do canary com origem, owner, licença, ALT e estado de direitos coerentes.
- Ativo em uso não pode ser arquivado nem excluído e a resposta deve apresentar o impacto.
- Ativo expirado não recebe URL pública nem pode entrar em nova projeção publicada.
- Substituição não altera revisões históricas e o rollback restaura a resolução anterior.
- Flag global permanece desligada; somente usuário sintético recebe override temporário.
- Produção, staging estável e dados reais permanecem inalterados.

Enquanto esses itens não forem comprovados, a EV2.6 não está liberada.

## Evidência pré-canary

- A migration completa foi aceita pelo PostgreSQL 17.6 do staging em transação revertida.
- Após o `ROLLBACK`, três verificações independentes confirmaram: nenhuma tabela DAM, nenhuma coluna EV2.5 e nenhuma versão `0043` persistidas.
- O runner do canary limita o GC ao identificador da fixture sintética, usa MFA/AAL2 para ações críticas e falha se a limpeza não for concluída.
