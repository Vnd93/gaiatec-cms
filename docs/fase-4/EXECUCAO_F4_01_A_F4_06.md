# Execução F4-01 a F4-06

Data: 2026-08-29 (America/Sao_Paulo)

Escopo executado: exclusivamente a Fase 4. A Fase 5 não foi iniciada.

## F4-01 — vertical e hardening

O contrato `cms.catalog-product.v1` cobre marca, fabricante/OEM, linha, modelo comercial, referência do fabricante, variantes, classificação, comercial, atributos tipados, mídia, documentos, relações, busca, redirects, SEO, proveniência e aprovação. As migrations `0019`–`0024` criam projeções e guardas, bucket privado de PDF, wrappers públicos `SECURITY INVOKER`, helpers privilegiados no schema interno e sincronização única de usos de mídia. A `0024` separa nas projeções `GATFLOW`, `GATFLOW-B` e `KF700E` e preserva `required` e `storage_path`.

O PDF privado só permite publicação quando o objeto existe. Imagem só publica se estiver pronta, limpa e com direitos confirmados. Produto não homologado nunca pode ser indexável.

## F4-02 — editor no novo `/admin`

O editor mantém abas de identificação, classificação, comercial, especificações, imagens, documentos, relações, busca, SEO, governança e histórico. Marca, OEM, modelo comercial e referência do fabricante possuem campos próprios. Coleções avançadas usam JSON governado com validação, contagem, feedback, preservação e bloqueio de salvamento inválido. Proveniência aceita caminho, data do arquivo, referência/data da autorização e escopo dos direitos; documento aceita URL oficial ou caminho privado. O preview usa o mesmo renderer e recebe mídias/documentos assinados.

## F4-03 — recadastro manual

O script `scripts/phase4/register-authorized-pilot.ps1`:

1. recusa alvo diferente do staging aprovado;
2. lê somente a linha `SUPABASE_ACCESS_TOKEN` do arquivo externo;
3. exige staging vazio;
4. valida os três hashes autorizados;
5. processa cada PNG manualmente em original + WebP/AVIF;
6. carrega o PDF em bucket privado;
7. cria o único produto pela API do CMS;
8. executa workflow e consumidores;
9. suspende e bane o ator de bootstrap.

O lote final é o `PILOTO-VZ-ELETRO-01`. O solicitante confirmou `GATFLOW` como marca própria, `GATFLOW-B` como modelo comercial GAIATEC e `KF700E` como referência/modelo do fabricante. Fabricante/OEM nominal, a divergência DN10/DN15 e especificações ainda não documentalmente fechadas permanecem editáveis e `a confirmar`.

## F4-04 — consumidores públicos

- lista, card, facets e estado vazio em `/produtos`;
- detalhe com galeria, ALT, atributos formatados, modelo/variante, relações e PDF assinado;
- busca por `KF700E` e sinônimos;
- comparador com seleção mínima e contrato tipado; a comparação real com dois produtos foi coberta pela suíte descartável;
- canonical e schema.org `Product`;
- redirect 302 do identificador do piloto;
- sitemap exclui o lote não indexável;
- badge `Conteúdo piloto homologado` na lista e no detalhe, sem tornar o conteúdo indexável no staging.

## F4-05 — ciclo e falhas

O lote real percorreu criar → revisar → preview → publicar → verificar consumidores → revisão 2 → publicar → restaurar revisão 1. Foram comprovados 1 produto, 1 variante, 10 atributos, 1 documento e 2 usos de mídia, sem órfãos.

No fechamento de G4, `scripts/phase4/close-g4-roundtrip.ps1` executou um segundo round-trip remoto. O marcador controlado `ROUNDTRIP-G4-SEM-REBUILD` foi salvo pela API administrativa, revisado, aprovado e publicado; apareceu no detalhe e na busca do staging sem rebuild. Em seguida a revisão homologada foi restaurada, normalizada e republicada. Revisão final publicada: `0e4e09ea-7239-4885-82e0-65a17b34fb98`; o marcador ficou zerado no rascunho e nos consumidores.

A suíte descartável adicional comprovou 403 sem permissão, conflito de lock, rejeição de publicação indexável sem owner, 404, dois produtos no comparador e limpeza completa dos fixtures. Nenhum usuário sintético permaneceu.

## F4-06 — UX, segurança e gate

A inspeção prática no navegador integrado cobriu detalhe, galeria, downloads, lista, filtros, busca, estado vazio, comparador, preview e editor autenticado em desktop/mobile. Foi corrigida também a ativação ARIA/teclado das abas do editor. Os cinco warnings de banco detectados na F4 foram corrigidos sem reduzir RLS. Em 2026-08-29 o Advisor registra 9 `INFO`, 1 `WARN` e 0 `ERROR`; o warning de Auth `auth_leaked_password_protection` depende de plano Pro e não é resolvível por código/RLS. Não há perfil ativo no staging e o ator auditável está suspenso e banido. O batch de URLs assinadas eliminou a latência sequencial detectada durante o primeiro run.

As fontes estão em `EVIDENCIA_FONTES_PILOTO_VZ_ELETRO_01.md`, a auditoria integral em `AUDITORIA_CAMPO_CONSUMIDOR.md`, UX em `VALIDACAO_UX_UI_F4.md` e decisão em `EVIDENCIAS_GATE_G4.md`.
