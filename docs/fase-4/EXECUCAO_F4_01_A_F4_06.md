# Execução F4-01 a F4-06

Data: 2026-08-28 (America/Sao_Paulo)

Escopo executado: exclusivamente a Fase 4. A Fase 5 não foi iniciada.

## F4-01 — vertical e hardening

O contrato `cms.catalog-product.v1` cobre fabricante, linha, modelo/variante, classificação, comercial, atributos tipados, mídia, documentos, relações, busca, redirects, SEO, proveniência e aprovação. As migrations `0019`–`0023` criam projeções e guardas, bucket privado de PDF, wrappers públicos `SECURITY INVOKER`, helpers privilegiados no schema interno e sincronização única de usos de mídia.

O PDF privado só permite publicação quando o objeto existe. Imagem só publica se estiver pronta, limpa e com direitos confirmados. Produto não homologado nunca pode ser indexável.

## F4-02 — editor no novo `/admin`

O editor mantém abas de identificação, classificação, comercial, especificações, imagens, documentos, relações, busca, SEO, governança e histórico. Proveniência passou a aceitar caminho, data do arquivo, referência/data da autorização e escopo dos direitos; documento aceita URL oficial ou caminho privado. O preview usa o mesmo renderer e recebe mídias/documentos assinados.

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

O lote final é o `PILOTO-VZ-ELETRO-01`. A diferença GATFLOW-B/KF700E e a divergência DN10/DN15 permanecem `a confirmar`.

## F4-04 — consumidores públicos

- lista, card, facets e estado vazio em `/produtos`;
- detalhe com galeria, ALT, atributos formatados, modelo/variante, relações e PDF assinado;
- busca por `KF700E` e sinônimos;
- comparador com seleção mínima e contrato tipado; a comparação real com dois produtos foi coberta pela suíte descartável;
- canonical e schema.org `Product`;
- redirect 302 do identificador do piloto;
- sitemap exclui o lote não indexável;
- badge `Conteúdo piloto em homologação` na lista e no detalhe.

## F4-05 — ciclo e falhas

O lote real percorreu criar → revisar → preview → publicar → verificar consumidores → revisão 2 → publicar → restaurar revisão 1. Foram comprovados 1 produto, 1 variante, 10 atributos, 1 documento e 2 usos de mídia, sem órfãos.

A suíte descartável adicional comprovou 403 sem permissão, conflito de lock, rejeição de publicação indexável sem owner, 404, dois produtos no comparador e limpeza completa dos fixtures. Nenhum usuário sintético permaneceu.

## F4-06 — UX, segurança e gate

A inspeção prática no navegador integrado cobriu detalhe, galeria, downloads, lista, filtros, busca, estado vazio, comparador, preview e admin sem sessão. Os cinco warnings de banco detectados na F4 foram corrigidos sem reduzir RLS. Em 2026-08-29 o Advisor passou a expor um warning de Auth (`auth_leaked_password_protection`): a Management API recusou a ativação com HTTP 402 por exigir plano Pro. O risco e a decisão de plano estão registrados no Gate G4; não há perfil ativo no staging. O batch de URLs assinadas eliminou a latência sequencial detectada durante o primeiro run.

As fontes estão em `EVIDENCIA_FONTES_PILOTO_VZ_ELETRO_01.md`, UX em `VALIDACAO_UX_UI_F4.md` e decisão em `EVIDENCIAS_GATE_G4.md`.
