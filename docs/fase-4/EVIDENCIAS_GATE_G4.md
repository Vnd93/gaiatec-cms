# Gate G4 — evidências e decisão

Data: 2026-08-28 (America/Sao_Paulo)

## Matriz do gate

| Critério                       | Evidência real                                                                                           | Situação               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------- |
| fonte única nova               | lote `PILOTO-VZ-ELETRO-01`, três arquivos autorizados, hashes e proveniência persistidos                 | aprovado para o esboço |
| zero campo órfão               | 1 produto, 1 variante, 10 atributos, 1 documento e 2 usos de mídia projetados                            | aprovado               |
| zero arquivo atual reutilizado | somente os três caminhos explicitamente autorizados; nenhum site/banco/painel antigo ou dado derivado    | aprovado               |
| preview fiel                   | mesmo renderer, duas mídias e PDF assinado; `noindex` e `no-store`                                       | aprovado               |
| rollback funcional             | revisão 2 publicada e revisão 1 restaurada como content version 3                                        | aprovado               |
| segurança                      | RLS remoto verde; 5 warnings de banco corrigidos; 1 warning Auth depende de plano Pro; ator suspenso     | aprovado tecnicamente  |
| responsividade/WCAG            | navegador integrado, mobile Chromium, 19 testes aprovados e Axe sem séria/crítica                        | aprovado               |
| performance                    | URLs assinadas em lote, chunks F4 pequenos, sem erro de console ou overflow                              | aprovado tecnicamente  |
| homologação do owner           | autorização dos arquivos existe; aprovação visual e relação GATFLOW-B/KF700E ainda não foram confirmadas | **pendente**           |

## Evidência remota

- alvo fixo: `glcqsosxwgmlhzgcsnzv`, `GAIATEC CMS Staging`, `us-east-2`;
- migrations `0021`–`0023` aplicadas após dry-run;
- Security Advisor em 2026-08-29: 9 itens `INFO`, 1 `WARN`, 0 `ERROR`. O único warning é `auth_leaked_password_protection`; a tentativa de ativar `password_hibp_enabled` pela Management API foi recusada com HTTP 402 porque o recurso exige plano Pro. Isso não altera RLS, preview ou storage. Como mitigação atual, não há perfil ativo e o único ator auditável está suspenso e banido. A decisão de contratar o plano e habilitar a proteção deve ser tomada antes de abrir autenticação por senha a usuários reais;
- suíte remota de contenção: 36/36 checks, incluindo 403, conflito otimista, preview, publicação, negação de owner, comparação e rollback;
- `npm run validate:local`: aprovado integralmente; 13 testes unitários/contrato/componentes, 3 integrações, 4 contenções F1, 19 testes F3, 4 testes F4, audit com 0 vulnerabilidades, build e Playwright 19 aprovados/3 skips previstos;
- manifesto: 1.441 arquivos, SHA-256 `617e922ace4c29f4f488b5f25f7c383ac5cbb470b3cb18de58a09fe54ebdb2f0`;
- lote real: criar → revisar → preview → publicar → lista/detalhe/filtro/busca/comparador/SEO → nova revisão → restaurar;
- estado final: 1 produto publicado, 2 mídias prontas, 1 PDF privado, 0 usuário sintético e 0 perfil ativo;
- staging e produto são `noindex`; sitemap exclui o lote;
- produção e branch `main` não foram tocadas;
- a contingência G2 permanece: somente `npm run validate:local` concluído localmente pode ser declarado verde; CI remoto não é inferido.

## Único bloqueio remanescente

O solicitante ainda precisa inspecionar o resultado visual e confirmar explicitamente:

1. que as duas imagens representam o produto pretendido;
2. se GATFLOW-B pode ser apresentado comercialmente com o PDF KF700E;
3. fabricante, faixa nominal e configuração definitivos;
4. autorização para mudar `pilotState` de `awaiting_owner` para `homologated`.

Nenhuma dessas aprovações foi fabricada.

## Decisão

**GATE G4: BLOQUEADO somente por homologação visual/conteudística do solicitante.**

Todos os critérios técnicos e de clean-room estão comprovados no staging. A Fase 5 não foi iniciada.
