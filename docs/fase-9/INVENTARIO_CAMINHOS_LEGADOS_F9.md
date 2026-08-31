# Inventário auditável de caminhos anteriores — Fase 9

**Data:** 2026-08-30

**Branch:** `Remodelagem`

**Ambientes consultados:** repositório local e Supabase/Cloudflare staging
**Produção:** não acessada e não alterada

## Método e critérios

O inventário combinou busca de imports, chamadas de API, rotas, assets, redirects, scripts, migrations, inspeção do bundle e consultas à função `cms-public` em staging. Nenhum conteúdo, taxonomia, produto, serviço, imagem ou estrutura editorial do site/painel anterior foi lido ou reutilizado para criar os substitutos.

Classificações:

- **removido do runtime:** há substituição nova publicada e validada; o consumidor anterior não integra o grafo ativo nem o bundle;
- **redirecionado:** há destino semanticamente equivalente, publicado e validado;
- **histórico/rollback:** o arquivo permanece no worktree para retenção, auditoria ou reversão seletiva, sem import no caminho público ativo;
- **preservado não editorial:** RDO, infraestrutura ou identidade operacional compartilhada, fora da administração editorial paralela.

## Estado real da projeção nova em staging

| Contrato                        |                 Estado observado |
| ------------------------------- | -------------------------------: |
| produto                         |                      1 publicado |
| serviço                         | 6 publicados, incluindo o canary |
| indústria                       |                    14 publicadas |
| aplicação                       |                     3 publicadas |
| solução                         |                     2 publicadas |
| homepage/páginas CMS clean-room |              14 rotas publicadas |
| navegação/configurações globais |                       publicadas |
| sitemap                         |    38 URLs; nenhuma `/setores/*` |

As 14 rotas de página retornaram `kind: page`, `renderer: managed-page` e canonical exata no contrato público: `/`, `/sobre`, `/contato`, `/politica-de-privacidade`, `/termos-de-uso`, oito rotas de Biodigestor e `/deteccao-de-gas`.

## Retirada executada com substituição comprovada

| Caminho anterior                         | Evidência do substituto                       | Ação F9                                                              |
| ---------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| índice compilado do header               | `cms-public?type=autocomplete`                | import e consulta ativa removidos                                    |
| `SAFE_NAVIGATION`/`SAFE_COLUMNS`         | navegação publicada                           | fallbacks removidos do header/footer                                 |
| homepage e páginas institucionais/legais | páginas CMS publicadas                        | rotas agora usam apenas `CmsManagedPageRoute`                        |
| páginas e subpáginas Biodigestor         | oito páginas CMS publicadas                   | imports anteriores removidos das rotas                               |
| hub Detecção de Gás                      | página CMS publicada                          | import anterior removido; subrotas sem equivalente retornam 404 real |
| seis setores remanescentes               | seis indústrias clean-room publicadas         | redirects 301 exatos e imports de `SectorPage` removidos             |
| helpers de `site-content`                | consumidores públicos novos usam `cms-public` | adaptador mantido somente em quarentena histórica                    |
| allowlists antigas do Worker             | coleções/páginas novas                        | removidas; caminho não publicado responde 404 real                   |
| calibração RBC antiga                    | serviço novo equivalente                      | redirect 301 exato                                                   |

## Arquivos retidos somente para história e rollback

Os arquivos editoriais anteriores em `src/app/data`, as páginas antigas, `src/app/hooks/useSiteData.ts`, `src/app/legacy/site-content.ts`, scripts `dg-*.mjs` e mídias editoriais antigas permanecem fisicamente no worktree por retenção e rollback seletivo. Eles não foram apagados porque a Fase 8/Fase 9 está sem commit e o usuário determinou preservação integral do trabalho existente.

As guardas F9 impedem imports desses grupos em `src/app/routes.tsx`, header, footer, renderer, APIs e páginas públicas. O build transformou 3.389 módulos e não gerou chunks de `HomePage`, `SobrePage`, `ContatoPage`, Biodigestor, Detecção de Gás, setores ou páginas legais antigas. O chunk principal caiu de aproximadamente 265,29 kB para 185,16 kB após a retirada do grafo anterior.

Isso permite retenção histórica sem consumo em runtime. Reintroduzir qualquer import, query, asset ou fallback desses grupos faz `scripts/phase9/legacy-retirement.test.mjs` falhar.

## Mídia anterior

As pastas editoriais antigas em `public/images` foram mantidas fisicamente para auditoria/rollback, mas seus consumidores públicos foram retirados do grafo ativo. Não há fallback de imagem antiga nas rotas clean-room. Logos locais compartilhados pelo shell público e pelo RDO são identidade operacional validada e não representam catálogo/editorial anterior.

## Banco, APIs, scripts e administração

- `site-content` não é importado por `src/lib/supabase.ts`, `src/public`, rotas ativas ou contratos CMS;
- tabelas e funções antigas não foram destrutivamente excluídas de staging; estão fora do caminho público ativo e preservadas para rollback/auditoria;
- scripts anteriores não são chamados por `package.json` nem pelo pipeline ativo;
- `/admin` é o único painel editorial ativo;
- o RDO permanece aplicação segregada por ADR-005/ADR-010 e não constitui administração editorial paralela;
- nenhuma informação de fabricante marcada como interna foi exposta pela projeção pública.

## Resultado do inventário

Não resta consumidor público ativo conhecido do caminho editorial anterior. A pendência remanescente não é técnica/editorial em local ou staging: é a autorização separada de go-live em produção e a passagem da janela real de estabilidade pós-go-live.
