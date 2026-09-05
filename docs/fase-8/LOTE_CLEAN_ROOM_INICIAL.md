# Lote clean-room inicial do lançamento

**Data:** 2026-08-30

**Ambiente:** staging

**Autorização:** `GAIATEC-ADMIN-CHAT-2026-08-30`

## Origem e limites

O lote foi redigido a partir das categorias e aplicações fornecidas diretamente por Victor Nishida, administrador da GAIATEC SISTEMAS. Nenhum cadastro, exportação, imagem, documento ou estrutura editorial do painel anterior foi consultado ou importado.

O conteúdo é um ponto de partida editável. Cada item tem proveniência `owner_authored`, homologação administrativa e workflow completo de criação, revisão, aprovação e publicação. O administrador pode alterar, despublicar ou arquivar qualquer item no CMS.

## Conteúdo publicado

| Tipo       | Quantidade | Slugs                                                                                                                                                     |
| ---------- | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serviços   |          5 | `instalacao-de-medidores`, `monitoramento-e-controle-remoto`, `instalacao-de-biodigestores`, `calibracao-de-instrumentos`, `servico-de-protecao-catodica` |
| Indústrias |          8 | `saneamento`, `oleo-e-gas`, `processos-industriais`, `farmaceutica`, `alimentos-e-bebidas`, `agronegocio`, `hvac`, `mineracao`                            |
| Aplicações |          3 | `medicao-estacoes-agua-esgoto`, `medicao-controle-gasodutos`, `monitoramento-deteccao-gases`                                                              |
| Soluções   |          2 | `instrumentacao-monitoramento-remoto`, `deteccao-integrada-gases`                                                                                         |
| Navegação  |          1 | `site-navigation`, com seis links no header e uma coluna de seis links no footer                                                                          |

O staging também preserva o produto e as configurações globais anteriormente publicados pelo proprietário.

## Evidência de integração

- API pública: 5 serviços, 8 indústrias, 3 aplicações e 2 soluções;
- site shell: 13 itens de navegação;
- coleções verificadas em `/servicos`, `/industrias`, `/aplicacoes` e `/solucoes`;
- páginas detalhadas verificadas em um item representativo de cada tipo;
- coleções e detalhes respondendo HTTP 200 real no acesso direto pelo Cloudflare Worker;
- catálogo `/produtos` restrito exclusivamente a produtos, mesmo com as novas entidades publicadas;
- viewport de 393 × 852 sem overflow horizontal;
- títulos SEO e CTAs de contato presentes;
- produção e `main` intocadas.

Evidência visual: [solução clean-room publicada](./evidencia-solucao-clean-room-staging.png).
