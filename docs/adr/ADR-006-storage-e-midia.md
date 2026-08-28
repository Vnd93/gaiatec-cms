# ADR-006 — Storage e pipeline de mídia

**Status:** aprovada — Comercial GAIATEC / Pedro Nishida
**Data:** 28 de agosto de 2026

## Decisão

Criar buckets novos por ambiente. Upload entra privado e passa por validação de MIME real, tamanho, dimensões, malware, direitos, correspondência e geração de variantes WebP/AVIF. Originais são preservados em área controlada; publicação expõe apenas derivados aprovados.

Mídia registra ALT, legenda, crédito, licença, owner, ponto focal e mapa de usos. Arquivo atual publicado não será copiado.
