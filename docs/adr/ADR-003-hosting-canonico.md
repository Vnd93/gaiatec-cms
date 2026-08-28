# ADR-003 — Hosting canônico

**Status:** aprovada — Cloudflare Pages; Pedro Nishida como owner técnico
**Data:** 28 de agosto de 2026

## Contexto

Cloudflare Pages hospeda hoje os domínios públicos e possui histórico de deploys. `vercel.json` existe, mas não há evidência operacional equivalente.

## Decisão

Adotar Cloudflare Pages como hosting canônico. Produção permanece em projeto próprio; preview e staging usam projeto/domínio separados, sem indexação e sem compartilhar secrets. A configuração Vercel será tratada como não canônica e só removida após confirmação do histórico Git.

## Rollback

Reativar artefato Pages imutável anterior e manter a versão pública anterior durante a janela de cutover.
