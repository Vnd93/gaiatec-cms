# Gate G4 — evidências e decisão

Data: 2026-08-29 (America/Sao_Paulo)

## Matriz do gate

| Critério                       | Evidência real                                                                                        | Situação              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------- |
| fonte única nova               | lote `PILOTO-VZ-ELETRO-01`, três arquivos autorizados, hashes, direitos e proveniência persistidos    | aprovado              |
| zero campo órfão               | auditoria integral contrato→editor→revisão→projeção→preview/público; round-trip estrutural exato      | aprovado              |
| zero arquivo atual reutilizado | somente os três caminhos explicitamente autorizados; nenhum site/banco/painel antigo ou dado derivado | aprovado              |
| preview fiel                   | mesmo renderer, duas mídias e PDF assinado; `noindex` e `no-store`                                    | aprovado              |
| rollback funcional             | revisão 2 publicada e revisão 1 restaurada como content version 3                                     | aprovado              |
| segurança                      | RLS remoto verde; 5 warnings de banco corrigidos; 1 warning Auth depende de plano Pro; ator suspenso  | aprovado tecnicamente |
| responsividade/WCAG            | navegador integrado, mobile Chromium, 19 testes aprovados e Axe sem séria/crítica                     | aprovado              |
| performance                    | URLs assinadas em lote, chunks F4 pequenos, sem erro de console ou overflow                           | aprovado tecnicamente |
| homologação do owner           | solicitante homologou o objetivo funcional e confirmou `GATFLOW` / `GATFLOW-B` / `KF700E`             | aprovado              |

## Evidência remota

- alvo fixo: `glcqsosxwgmlhzgcsnzv`, `GAIATEC CMS Staging`, `us-east-2`;
- migrations `0021`–`0024` aplicadas após dry-run;
- Security Advisor em 2026-08-29: 9 itens `INFO`, 1 `WARN`, 0 `ERROR`. O único warning é `auth_leaked_password_protection`; a tentativa de ativar `password_hibp_enabled` pela Management API foi recusada com HTTP 402 porque o recurso exige plano Pro. Isso não altera RLS, preview ou storage. Como mitigação atual, não há perfil ativo e o único ator auditável está suspenso e banido. A decisão de contratar o plano e habilitar a proteção deve ser tomada antes de abrir autenticação por senha a usuários reais;
- suíte remota de contenção: 36/36 checks, incluindo 403, conflito otimista, preview, publicação, negação de owner, comparação e rollback;
- `npm run validate:local`: deve ser lido junto do manifesto final em `docs/validacao-local/ULTIMA_VALIDACAO.md`; somente a execução local é declarada, nunca CI remoto por inferência;
- lote real: criar → revisar → preview → publicar → lista/detalhe/filtro/busca/comparador/SEO → nova revisão → restaurar;
- round-trip G4: o marcador `ROUNDTRIP-G4-SEM-REBUILD` foi salvo pela API administrativa, revisado, publicado e visto no detalhe/busca sem rebuild; depois foi removido por restauração e normalização;
- revisão final publicada: `0e4e09ea-7239-4885-82e0-65a17b34fb98`;
- estado final remoto: 1 produto publicado e homologado, marca `GATFLOW`, modelo comercial `GATFLOW-B`, referência `KF700E`, 2 mídias prontas, 1 PDF privado, marcador temporário zerado, 0 usuário sintético e 0 perfil ativo;
- staging e produto são `noindex`; sitemap exclui o lote;
- produção e branch `main` não foram tocadas;
- a contingência G2 permanece: somente `npm run validate:local` concluído localmente pode ser declarado verde; CI remoto não é inferido.

## Alcance da homologação

O solicitante homologou o funcionamento do piloto e autorizou a continuidade do projeto. Essa decisão não torna imutáveis as especificações técnicas atuais. Permanecem deliberadamente editáveis no `/admin`:

1. fabricante/OEM nominal;
2. faixa nominal diante da divergência documental DN10/DN15;
3. configuração, SKU e especificações definitivas;
4. qualquer texto, mídia, relação, termo de busca ou metadado SEO do cadastro futuro.

`pilotState` foi alterado para `homologated`; `seo.indexable` continua falso e todo o staging permanece `noindex`.

## Decisão

**GATE G4: APROVADO.**

Todos os critérios técnicos, funcionais e de clean-room estão comprovados no staging, incluindo fonte única nova, zero campo órfão, preview fiel, rollback, segurança, responsividade, performance e homologação funcional do owner. A Fase 5 não foi iniciada.
