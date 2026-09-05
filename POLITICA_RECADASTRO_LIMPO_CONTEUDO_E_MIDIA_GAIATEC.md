# Política de recadastro limpo de conteúdo e mídia GAIATEC

**Versão:** 1.0
**Data:** 27 de agosto de 2026
**Aplicação:** novo site e novo painel administrativo `/admin`
**Status:** obrigatória para preparação, cadastro, revisão, publicação e cutover
**Planejamento executivo relacionado:** `PLANEJAMENTO_EXECUTIVO_DESENVOLVIMENTO_REMODELAGEM_CMS_GAIATEC.md`

---

## 1. Objetivo

Garantir que a remodelagem do site não transporte os erros de estrutura, classificação, conteúdo, relações e imagens existentes.

O novo CMS será preenchido por **recadastro limpo**, e não por migração do conteúdo atual. Cada registro será criado novamente no painel, comprovado por fonte aprovada, revisado e publicado dentro do modelo novo.

---

## 2. Decisão obrigatória

É proibido carregar no novo CMS, de forma manual automatizada ou semiautomatizada:

- produtos e serviços atualmente publicados;
- arrays hardcoded do frontend;
- tabelas editoriais existentes;
- categorias, subcategorias, setores, aplicações e relações atuais;
- textos, especificações, benefícios, claims e SEO atuais;
- imagens, thumbnails, banners e documentos atualmente publicados;
- slugs, SKUs derivados e identificadores criados pelo site atual;
- posts, menus, homepage, footer e configurações atuais;
- qualquer registro cuja origem e responsável não possam ser comprovados.

O site atual não é fonte de verdade. Ele pode ser usado somente para:

1. inventariar URLs e backlinks;
2. planejar redirects, 404 e 410;
3. documentar erros que não podem se repetir;
4. manter continuidade pública temporária até o cutover;
5. servir como rollback técnico integral durante a janela de lançamento.

Rollback não transforma dados atuais em dados do CMS novo.

---

## 3. Estado inicial obrigatório

Antes do primeiro cadastro:

- banco editorial novo sem registros de conteúdo;
- storage editorial novo sem arquivos atuais;
- taxonomias ainda em rascunho até aprovação;
- nenhum seed com produto, serviço, setor, aplicação, texto ou imagem real;
- ambientes local, CI, staging e produção separados;
- usuários, papéis, audit log, schemas e workflows operacionais;
- importação em massa desabilitada;
- API pública expondo somente projeções aprovadas;
- site de staging sem fallback para conteúdo atual.

O gate deve verificar por consulta automatizada que as tabelas e buckets novos estão vazios antes de iniciar o recadastro real.

---

## 4. Fontes aceitas

### 4.1 Produtos e especificações

Ordem preferencial:

1. folha de dados/manual vigente do fabricante;
2. catálogo oficial vigente do fabricante;
3. certificado ou documento técnico verificável;
4. cadastro mestre interno revisado especificamente para o projeto;
5. informação assinada/aprovada pelo responsável técnico designado.

Uma planilha ou cadastro interno não se torna automaticamente confiável. Cada item precisa de data, owner e evidência.

### 4.2 Serviços

- escopo operacional aprovado pela direção/responsável da área;
- capacidade efetivamente oferecida;
- limites, entregáveis, pré-requisitos e região de atendimento;
- evidências técnicas/comerciais atuais;
- CTA e responsável pelo atendimento.

### 4.3 Setores, aplicações e soluções

- validação conjunta de Comercial e Engenharia;
- relação com oferta real;
- problema/processo claramente definido;
- produto/serviço relacionado com justificativa;
- claims e benefícios comprováveis.

### 4.4 Imagens e documentos

- arquivo original fornecido pelo fabricante, GAIATEC ou banco autorizado;
- autorização/licença identificada;
- correspondência visual com o modelo/serviço;
- documento vigente, íntegro e aprovado para publicação.

### 4.5 Conteúdo institucional e marketing

- texto produzido para a remodelagem;
- responsável editorial;
- aprovação de negócio;
- validação jurídica quando contiver obrigação, privacidade, certificação ou claim regulado.

---

## 5. Fontes proibidas como base de cadastro

- copiar e colar do site atual;
- extrair conteúdo do bundle JavaScript;
- importar tabelas de conteúdo existentes;
- copiar imagens das pastas publicadas/otimizadas;
- usar resultado de mecanismo de busca como evidência primária;
- usar material de concorrente;
- presumir especificação por produto semelhante;
- criar relações porque aparecem atualmente em cards/filtros;
- confiar em nome de arquivo como prova da imagem;
- usar IA como fonte factual sem documento verificável e aprovação humana.

IA pode apoiar redação, normalização e detecção de lacunas, mas não decide especificações, certificações, compatibilidade ou correspondência de imagem.

---

## 6. Registro obrigatório de proveniência

Cada conteúdo deve registrar:

- `source_type`;
- `source_reference` ou ID do documento;
- título/versão da fonte;
- data da fonte;
- fabricante/autor;
- usuário que cadastrou;
- responsável técnico/comercial;
- data da revisão;
- observação de divergência/limite;
- hash do documento quando aplicável;
- status de aprovação.

Fonte sensível ou privada deve ser armazenada em área protegida. A referência administrativa não implica publicação do documento.

---

## 7. Procedimento por lote

### 7.1 Planejar

- definir objetivo e entidades do lote;
- nomear cadastradores e revisores;
- aprovar fontes;
- fechar taxonomia/atributos necessários;
- definir prazo e critérios;
- preparar roteiro de QA.

### 7.2 Cadastrar

- criar cada registro no novo painel;
- preencher origem e owner primeiro;
- usar campos estruturados e unidades aprovadas;
- criar relações somente entre entidades novas aprovadas;
- carregar originais autorizados;
- salvar como rascunho.

### 7.3 Revisar

- revisão técnica das especificações e compatibilidades;
- revisão comercial de nome, resumo, benefícios e CTA;
- revisão editorial de clareza, gramática e consistência;
- revisão de mídia e direitos;
- revisão SEO e URL;
- revisão de privacidade/jurídico quando necessária.

O mesmo usuário não deve cadastrar e aprovar conteúdo técnico crítico quando houver equipe suficiente para segregação.

### 7.4 Homologar

- preview desktop, tablet e mobile;
- lista, detalhe, busca, filtro e relações;
- documentos e downloads;
- imagem principal, galeria, ALT e recortes;
- SEO, canonical, schema e sitemap;
- links e CTAs;
- acessibilidade e performance;
- auditoria e restauração.

### 7.5 Publicar

- lote completo e aprovado;
- publicação transacional;
- cache invalidado;
- smoke test;
- monitoramento;
- rollback preparado.

Não publicar página vazia para “completar depois”.

---

## 8. Checklist de produto

- [ ] Nome comercial aprovado.
- [ ] Fabricante, linha, modelo e variante corretamente separados.
- [ ] SKU/código interno definido, não derivado de ID antigo.
- [ ] Taxonomia nova aplicada.
- [ ] Descrição curta e conteúdo técnico novos.
- [ ] Atributos tipados com unidade.
- [ ] Faixas, precisão, materiais, comunicação e certificações comprovadas.
- [ ] Aplicações e setores justificados.
- [ ] Produtos similares/complementares revisados.
- [ ] Documento vigente e hash registrado.
- [ ] Imagem original correta e autorizada.
- [ ] Galeria, legenda, ALT e ponto focal aprovados.
- [ ] Palavras-chave/sinônimos revisados.
- [ ] Slug e SEO novos.
- [ ] Preview e comparação responsiva aprovados.
- [ ] Fonte, cadastrador, revisor e datas registrados.

---

## 9. Checklist de serviço

- [ ] Nome e categoria novos aprovados.
- [ ] Escopo e entregáveis reais.
- [ ] Pré-requisitos e limites claros.
- [ ] Descrição comercial e técnica revisadas.
- [ ] Setores/aplicações/produtos relacionados com justificativa.
- [ ] CTA e fluxo de atendimento validados.
- [ ] Imagem/documentos novos e autorizados.
- [ ] SEO e URL novos.
- [ ] Owner operacional identificado.
- [ ] Preview, publicação e auditoria testados.

---

## 10. Checklist de imagem

- [ ] Arquivo não foi copiado do site atual.
- [ ] Origem e licença conhecidas.
- [ ] Produto/modelo representado foi conferido.
- [ ] Sem marca/modelo incorreto ou conteúdo enganoso.
- [ ] Original preservado em área controlada.
- [ ] MIME, malware, dimensões e tamanho validados.
- [ ] Fundo, orientação e qualidade adequados ao novo design.
- [ ] Recortes desktop/mobile aprovados.
- [ ] WebP/AVIF e variantes geradas.
- [ ] ALT descreve a imagem sem keyword stuffing.
- [ ] Legenda/crédito quando necessários.
- [ ] Ponto focal configurado.
- [ ] Mapa de usos registrado.

---

## 11. Regras para URLs e SEO

O conteúdo atual não será preservado, mas o patrimônio de URL deve ser tratado conscientemente:

- inventariar URL, tráfego, backlink e indexação;
- nova URL nasce do modelo novo;
- redirect 301 somente quando existe destino novo semanticamente equivalente;
- URL sem equivalente recebe 410 ou 404 conforme decisão SEO;
- não redirecionar tudo para homepage/categoria genérica;
- impedir cadeia e loop;
- canonical aponta para a URL nova publicada;
- mapa de redirect é independente da migração de conteúdo.

---

## 12. Importação futura

Importação em massa não será usada no primeiro recadastro.

Ela só poderá ser desenvolvida depois de:

- schema estabilizado por lotes manuais;
- dicionário de dados aprovado;
- validações server-side completas;
- dry-run com relatório por linha;
- idempotência e prevenção de duplicatas;
- rollback e auditoria;
- aprovação explícita do Product Owner e Tech Lead.

Mesmo no futuro, importação aceitará apenas dados novos preparados no template oficial. Nunca será usada para carregar exportações do site atual.

---

## 13. Gates

### Gate C0 — ambiente limpo

- banco/storage vazios de conteúdo atual;
- importadores desabilitados;
- auth/RBAC/audit operacionais;
- schemas e fontes aprovados.

### Gate C1 — lote pronto para revisão

- 100% dos registros com fonte e owner;
- nenhum arquivo atual reutilizado;
- campos obrigatórios completos;
- zero relação órfã.

### Gate C2 — lote pronto para publicação

- aprovação técnica/comercial/editorial;
- mídia e direitos aprovados;
- E2E/SEO/a11y/responsivo aprovados;
- rollback e redirects preparados.

### Gate C3 — retirada do conteúdo anterior

- projeção nova estável;
- métricas e smoke tests aprovados;
- mapa de URLs aplicado;
- nenhuma consulta/fallback ao conteúdo atual;
- arquivos/tabelas antigos fora do caminho de produção.

---

## 14. Critérios de sucesso

- zero produto, serviço ou mídia atual importado;
- 100% do conteúdo publicado criado no novo painel;
- 100% dos registros com fonte, cadastrador e aprovador;
- zero relação sem justificativa/entidade válida;
- zero imagem sem origem, correspondência e ALT;
- zero página publicada vazia ou incompleta;
- zero fallback editorial para dados antigos;
- redirects aprovados e sem cadeia;
- rollback técnico testado;
- auditoria permite reconstruir quem cadastrou, revisou e publicou.

---

## 15. Responsabilidade

O Product Owner responde pela aplicação desta política. Os responsáveis de Portfólio, Comercial, Engenharia e Marketing aprovam os respectivos domínios. O Tech Lead deve impedir tecnicamente importações, fallbacks e consumidores que violem a decisão de recadastro limpo.

Qualquer exceção exige decisão formal, fonte comprovada, impacto, aprovadores e prazo. Não existe exceção implícita por conveniência ou volume.
