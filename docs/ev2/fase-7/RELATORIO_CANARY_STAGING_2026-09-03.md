# Relatório do canary técnico EV2.7 em staging

**Data:** 3 de setembro de 2026<br>
**Ambiente:** Supabase e Cloudflare Pages de staging<br>
**Branch:** `ev2/desenvolvimento-fases-1-a-12`<br>
**SHA do candidato autorizado:** `952bf75b4047ebeaa918767b9ab6cfe522bafb41`<br>
**Resultado técnico:** aprovado — 27/27 verificações<br>
**Gate G7:** aprovado

## Limites da execução

O canary corretivo foi executado após autorização explícita e ficou restrito ao staging. Foram autorizadas e realizadas somente a migration `0046`, a republicação de `cms-releases`, `cms-collaboration` e `cms-bulk`, a atualização do alias isolado e a repetição do G7 com dois usuários sintéticos. Não houve migration, função, build, flag, conteúdo ou escrita em produção; nenhum dado real foi alterado. A flag global permaneceu desligada e o staging estável não foi promovido.

## Banco, funções e build

- O alvo foi confirmado antes das escritas: ref `glcqsosxwgmlhzgcsnzv`, nome `GAIATEC CMS Staging`, região `us-east-2`.
- `0046_ev2_conflict_transport_hardening.sql` era a única migration pendente, passou no dry-run e foi aplicada somente em staging. A versão final registrada é `0046`.
- As RPCs `cms_execute_release_v2_command`, `cms_execute_collaboration_command` e `cms_execute_bulk_command` preservaram `SECURITY DEFINER`, `search_path` explícito e o transporte `PT409`; nenhuma delas conserva `40001` para conflito de negócio.
- `ev2.collaboration_bulk` terminou com `default_enabled=false` e `kill_switch=false`.
- Funções republicadas e ativas, todas com JWT obrigatório: `cms-releases` v2, hash `cd8b9760bae67be08e6c973f650500a358ec90b9aeaa76fc2589b0944d678c98`; `cms-collaboration` v2, hash `f90e7ad210268b37a90a81bfd7d64617491928eb8b3c61a4d9a33f3a444194c8`; `cms-bulk` v3, hash `5d5f354140dfe0f3a7a9e5e15c58ff8965089db8a5da848d4108e28c2cb76932`.
- `cms-outbox-worker` não foi republicada na correção e permaneceu ativa na v21, hash `f198737e3c40cf4ae5326691ac9a253e80721a864844ed5a21235d19dce41da1`, com autenticação pelo segredo próprio já existente.
- O build foi gerado do SHA exato autorizado com apenas `VITE_EV2_COLLABORATION_BULK_CANDIDATE=true`; os candidatos EV2.2–EV2.6 permaneceram desligados.
- Deployment Preview: `43f4cfc3-9e41-4485-b9fb-af560a775533`, branch `ev2-g7-canary`, fonte `952bf75`.
- Alias isolado: <https://ev2-g7-canary.gaiatec-cms-staging.pages.dev>.
- Deployment imutável: <https://43f4cfc3.gaiatec-cms-staging.pages.dev>.
- Manifesto: 1.427 arquivos, SHA-256 `222757751334ec2a13e87f9a383cf768fc06086470df714d9ad30d6d64b23549`.
- O alias e a URL imutável passaram 6/6 smokes cada: rotas públicas e login do RDO responderam 200, rota e asset inexistentes responderam 404 e todas as respostas preservaram `noindex`.

## Verificações funcionais

O runner `npm run canary:ev2:phase7` criou OP-G7 e REV-G7 descartáveis, concluiu MFA/TOTP para ambos e limitou os overrides individuais a 30 minutos. As 27 verificações aprovadas cobriram:

1. alvo exato, flag global desligada, singleton real de navegação somente leitura e dois atores AAL2;
2. overrides exclusivamente individuais, inbox anônima recusada e worker recusado sem segredo válido;
3. envelope de produção recusado e segregação entre criação, aprovação e publicação;
4. release com duas páginas sintéticas publicado atomicamente em **1.492,5 ms**;
5. rollback RPO 0 concluído em **739,4 ms**, abaixo do limite de cinco minutos;
6. falha induzida no segundo item com `CMS_RELEASE_ITEM_GATE_CHANGED` e zero projeção parcial;
7. pacote página+navegação validado e cancelado sem alterar o singleton real;
8. replay idempotente e payload divergente recusado com conflito explícito;
9. tarefa, comentário ancorado, menção, resolução, reabertura, histórico e diff;
10. notificação in-app marcada como entregue e falha externa sintética preservada como `failed` com código visível;
11. alteração após dry-run bloqueando o lote inteiro com HTTP 409 em **763,5 ms**;
12. dry-run inválido com erro por item e zero escrita, seguido de lote válido atômico e replay sem duplicação;
13. flag global inalterada e limpeza integral das fixtures.

Para respeitar a proibição de tocar dados reais, o ensaio não acionou a reserva global da fila compartilhada. Ele provou a proteção do worker com segredo inválido e finalizou somente os dois eventos sintéticos identificados, por meio da mesma RPC usada pelo worker. Assim, validou os estados de entrega e falha sem risco de consumir eventos preexistentes do staging.

## Diagnóstico e correção

Na primeira execução autorizada, o cenário de concorrência revelou que conflitos de negócio persistentes eram emitidos como `SQLSTATE 40001`. Esse código é retentável e provocava repetição automática até o timeout, embora a transação permanecesse atômica e sem bloqueadores no PostgreSQL. A migration aditiva `0046` trocou somente o transporte desses conflitos por `PT409`, preservando a regra de negócio e eliminando o retry indevido.

Passagens preliminares também endureceram o próprio ensaio: a navegação real passou a ser sentinela estritamente read-only; fixtures, status esperados e leitura de detalhe foram alinhados ao contrato; e a cobertura de notificações passou a verificar o resultado final. Cada tentativa interrompida executou limpeza referencial e foi seguida de contraprova. Uma publicação paralela inicialmente não incrementou `cms-bulk`; a divergência foi detectada na auditoria de versão e a função foi republicada isoladamente antes do canary final.

## Auditoria pós-execução

Uma consulta independente, separada do runner, confirmou:

- migration final `0046` e as três RPCs corretivas com `PT409`, sem `40001`;
- zero usuário de autenticação, perfil, override, conteúdo, release, tarefa, job de massa ou falha de notificação sintética G7;
- uma única navegação publicada, ainda no item real `6623fa42-9d43-422a-88fe-affc36f3abff`;
- `ev2.collaboration_bulk` ainda globalmente desligada, sem kill switch acionado;
- as três funções autorizadas ativas nas versões e hashes registrados acima;
- canary no deployment `43f4cfc3-9e41-4485-b9fb-af560a775533`, fonte `952bf75`;
- staging estável ainda no deployment `868f4382-9b99-4caa-bd51-73c70a492895`, fonte `2042c8f`;
- produção ainda no deployment `ff2dbb65-2f8b-4840-a9a1-f2fde29e8ebf`, fonte `ba11310`.

## Validação local final

- `npm run test:ev2:phase7`: 6/6 testes aprovados;
- `npm run check`: aprovado, incluindo formatação, lint com zero erro, typecheck, 40 arquivos e 126 testes Vitest, todas as suítes EV2 e legadas e build;
- orçamento do grafo inicial: quatro chunks e Excel/PDF carregados sob demanda;
- `git diff --check`: aprovado.

## Decisão

O Gate G7 está aprovado e encerrado em staging. A EV2.8 está liberada para implementação local e posterior canary próprio. Produção, promoção do staging estável, ativação global, merge em `main`, publicação de lote real e uso de dados reais permanecem fora do escopo e exigem autorização específica.
