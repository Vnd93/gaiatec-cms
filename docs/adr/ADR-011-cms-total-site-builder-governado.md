# ADR-011 — CMS total e site builder governado

**Status:** aprovada — Administrador da GAIATEC SISTEMAS
**Data:** 29 de agosto de 2026

## Contexto

O painel administrativo não deve se limitar ao catálogo. O administrador precisa criar, alterar, destacar, agendar, retirar e reorganizar páginas e conteúdos do site sem depender de alterações manuais no código. A referência funcional é a autonomia de plataformas como Duda, sem copiar sua interface, seus componentes ou sua implementação.

Os contratos atuais já cobrem produtos, serviços, indústrias, aplicações, soluções, posts, páginas e homepage, com revisão, preview, publicação e restauração. Porém, páginas/homepage ainda possuem contrato mínimo; serviços, indústrias, aplicações e soluções ainda expõem JSON como editor principal; menus, configurações globais, posicionamentos e campanhas ainda não possuem administração completa.

## Decisão

O novo CMS será a fonte editorial única de todas as superfícies públicas editáveis:

- produtos, serviços, indústrias/setores, aplicações, soluções e conteúdo técnico;
- homepage, páginas institucionais, páginas temáticas e landing pages;
- header, mega menu, menu mobile, footer e links de navegação;
- destaques temporários de produtos, serviços, soluções ou páginas;
- SEO, compartilhamento social, redirects, sitemap e estado de indexação;
- dados globais da empresa, contatos, redes, CTAs e formulários;
- mídia, documentos, relações entre conteúdos e resultados de busca.

A edição de páginas será visual e estruturada por blocos governados. JSON deixa de ser a interface editorial principal e permanece somente como diagnóstico técnico restrito. O administrador poderá:

1. criar uma página a partir de template aprovado ou composição vazia;
2. inserir, editar, duplicar, ordenar, ocultar e remover blocos;
3. relacionar produtos, serviços, setores, aplicações e soluções por seletores pesquisáveis;
4. visualizar desktop e mobile antes da publicação;
5. salvar rascunho, revisar, aprovar, agendar, publicar, despublicar e restaurar versões;
6. configurar períodos de destaque com início, término, prioridade e destino;
7. editar menus e configurações globais com validação de links e referências;
8. arquivar ou retirar páginas publicadas com redirect, `404` ou `410` explícito;
9. consultar auditoria, autor, motivo e histórico de cada alteração.

O builder oferecerá blocos controlados — hero, texto, mídia, galeria, benefícios, especificações, cards relacionados, grade de conteúdo, etapas, métricas, depoimentos, FAQ, formulário e CTA. Não será permitido executar HTML, JavaScript ou CSS arbitrário no conteúdo editorial.

Hard delete será permitido somente para rascunhos nunca publicados e com permissão específica. Conteúdo anteriormente publicado será despublicado e arquivado, mantendo histórico, referências e decisão de redirect/remoção.

## Conteúdo informado pelo administrador

Os nomes abaixo são um inventário inicial para cadastro futuro pelo painel. Não são seed, importação, lote homologado nem autorização para publicação automática.

### Serviços candidatos

- Instalação de Medidores;
- Monitoramento e Controle pela plataforma GAIATEC SISTEMAS;
- Instalação de Biodigestores;
- Calibração de Instrumentos;
- Serviço de Proteção Catódica.

### Indústrias/setores candidatos

- Saneamento;
- Gases e Petróleo;
- Indústrias;
- Farmacêuticas;
- Alimentícias e de Bebidas;
- Agronegócio;
- HVAC;
- Proteção Catódica;
- Mineradoras;
- `Hidr` — denominação recebida incompleta, a confirmar no cadastro.

### Aplicações e soluções candidatas

- Medição e controle em estações de tratamento de água e esgoto;
- Gasodutos;
- Monitoramento e detecção de gases;
- instrumentação integrada de vazão, pressão, nível e temperatura com monitoramento remoto.

### Categorias candidatas para detecção de gases

- detectores portáteis;
- detectores fixos;
- detectores de chamas;
- detectores veiculares.

A detecção de gases permanece no catálogo mestre e poderá receber páginas temáticas criadas pelo builder quando o administrador decidir, sem exigir um módulo editorial paralelo.

## Consequências

- páginas existentes somente se tornam administráveis após recadastro limpo em contratos e blocos novos;
- nenhum texto, imagem, produto ou estrutura antiga será importado ou usado como fallback;
- o desenvolvimento técnico pode avançar sem preencher agora o inventário editorial definitivo;
- a ausência de lotes reais continua impedindo homologação editorial e go-live, mas não impede a construção do CMS e do site builder;
- a Fase 6 deve entregar editor visual, registro de páginas, navegação, configurações e posicionamentos antes de declarar administração total;
- a Fase 7 deve acrescentar campanhas, formulários, leads e agendamentos comerciais;
- o Gate G8 continua exigindo conteúdo real novo, aprovado e completo para produção.
