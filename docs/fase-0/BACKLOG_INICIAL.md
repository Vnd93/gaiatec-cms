# Backlog inicial — Ondas 0 e 1

| ID | Prioridade | Resultado | Dependência | Owner funcional | Estado |
|---|---|---|---|---|---|
| DEV-000 | P0 | Identificar repositório oficial, histórico e branch base | acesso do patrocinador | Pedro Nishida | concluído |
| DEV-001 | P0 | Aprovar ADR-001/002 e política de recadastro | autorização executiva | PO + Tech Lead | concluído |
| DEV-002 | P0 | Aprovar Cloudflare Pages como hosting canônico | Tech Lead/Patrocinador | Pedro Nishida | concluído |
| DEV-003 | P0 | Criar staging Cloudflare + Supabase e separar secrets | organização gratuita disponível | Pedro Nishida | concluído |
| DEV-004 | P0 | Trazer `site-content`, migrations editoriais/leads e policies para Git | repositório/acessos | Backend | bloqueado |
| DEV-005 | P0 | Inventário de backup e teste de restauração | acesso à produção | DevOps | bloqueado |
| GOV-001 | P0 | Nomear RACI e canal de decisões/incidentes | patrocinador | Comercial GAIATEC | concluído |
| GOV-002 | P0 | Aprovar taxonomia e primeiro lote piloto | definição controlada | Comercial/Portfólio | concluído |
| GOV-003 | P0 | Aceitar critérios de aceite e normativos | autorização executiva | Patrocinador/PO/TL | concluído |
| SEC-001 | P0 | Fechar autoinscrição OTP do RDO | G0 | Segurança/RDO | planejado |
| SEC-002 | P0 | Tornar RDO assinado imutável e versionar correções | regra jurídica | Backend/RDO | planejado |
| SEC-003 | P0 | Tornar fotos e PDFs privados | staging | Backend | planejado |
| SEC-004 | P0 | Reconstruir notificações RDO server-side | migrations/funções | Backend | planejado |
| SEC-005 | P0 | Separar escopos `cms:*` e `rdo:*` | ADR-005 | Segurança/Backend | planejado |
| WEB-001 | P0 | Error Boundary, erros de rota e falha de chunk | fundação de testes | Frontend | planejado |
| WEB-002 | P0 | `noindex` real em RDO/admin/preview | hosting canônico | Frontend/DevOps | planejado |
| WEB-003 | P1 | Remover links `#`, overflow mobile e destinos genéricos | baseline UX | Frontend/UX | planejado |
| WEB-004 | P0 | Corrigir soft 404, canonical, cache e Service Worker | ADR-003/008 | DevOps/Frontend | planejado |
| LEAD-001 | P0 | Proteger formulário atual contra abuso | contrato e staging | Backend/Segurança | planejado |

## Ordem

1. Fechar DEV-000, DEV-003, GOV-001, GOV-002 e GOV-003.
2. Aprovar o Gate G0.
3. Abrir a Fase 1 em tarefa própria.
4. Executar SEC/WEB/LEAD por risco e comprovar Gate G1.

Nenhum item de implementação da Fase 1 foi iniciado neste baseline.
