# Programa Executivo F11 — UX/UI global, clareza operacional e consistência

**Data:** 2026-08-31

**Ambientes autorizados:** local e staging

**Produção:** vedada
**Gate:** G11 em execução; não altera o estado de G9 ou G10

## Objetivo

Transformar todas as superfícies do CMS GAIATEC em uma experiência administrativa previsível para operadores não técnicos, sem alterar contratos de conteúdo, RBAC, MFA, RLS, projeções públicas ou a persistência de rascunhos da F10.

## Limites invioláveis

- preservar o worktree legítimo e a branch `Remodelagem`;
- não reutilizar o painel antigo nem seu conteúdo;
- não criar controles sem contrato e permissão reais;
- manter fabricante/OEM, referência, SKU, proveniência e campos internos fora da projeção pública;
- manter eventos de renovação do mesmo usuário sem desmontar editores;
- publicar somente no projeto Cloudflare de staging depois da suíte local verde;
- não alterar produção, `main`, banco legado ou Supabase produtivo.

## Frentes internas

| Frente               | Resultado observável                                                                   | Evidência                              |
| -------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- |
| F11.1 Inventário     | rotas, personas, tarefas e lacunas registradas                                         | `INVENTARIO_TELAS_E_COMPONENTES.md`    |
| F11.2 Sistema visual | tokens, grid, foco, estados, motion e breakpoints comuns                               | `DESIGN_SYSTEM_ADMIN_GAIATEC.md` e CSS |
| F11.3 Shell          | topo enxuto, busca real, conta, sidebar agrupada/recolhível, mobile e breadcrumb       | Browser + testes estruturais           |
| F11.4 Componentes    | cabeçalho, ações, cards, campos, etapas, status, estados, tabela, alerta e confirmação | `AdminUI.tsx` + Vitest                 |
| F11.5 Migração       | autenticação, listagens, editores e operação usam a linguagem comum                    | inventário por rota                    |
| F11.6 Conteúdo       | labels, ajuda, erros e confirmações em português simples                               | guia operacional                       |
| F11.7 Qualidade      | desktop, tablet, mobile, teclado, foco, contraste, zoom e overflow                     | matriz e validação                     |
| F11.8 Staging        | artefato imutável implantado e validado                                                | URL e evidências G11                   |

## Estratégia de implementação

1. preservar os componentes contratuais existentes e criar uma camada compartilhada de apresentação;
2. aplicar o shell e a orientação contextual a todas as rotas protegidas;
3. migrar autenticação e páginas representativas para componentes React compartilhados;
4. padronizar as demais telas pela mesma API de classes e tokens, eliminando improvisos por rota;
5. manter ações de workflow condicionadas aos estados e permissões já existentes;
6. comprovar regressões por testes estruturais F11, Vitest, E2E e navegador real.

## Matriz mínima de testes

| Risco                    | Automatizado                      | Manual/browser                                |
| ------------------------ | --------------------------------- | --------------------------------------------- |
| perda de sessão/rascunho | testes F10 preservados            | troca de aba autenticada                      |
| ação indevida            | testes de contrato existentes     | estados/permite/nega por perfil               |
| inconsistência visual    | teste estrutural F11              | rotas em 1440×900, 1280×800, tablet e 390×844 |
| acessibilidade           | axe/E2E, semântica de componentes | teclado, foco, zoom e leitor de tela          |
| overflow                 | E2E + métricas DOM                | páginas longas, tabelas e drawers             |
| vazamento interno        | projeção e contratos              | busca, SEO, sitemap e JSON-LD de staging      |

## Riscos e respostas

- **Refatoração desmontar editor:** shell não recebe chaves por rota; `Outlet` e contexto de auth são preservados.
- **CSS quebrar telas longas:** overrides finais são responsivos e não alteram o DOM contratual dos editores.
- **Tabela ilegível no mobile:** overflow fica contido na região rotulada, nunca no documento.
- **Orientação ficar verbosa:** cada rota usa quatro frases curtas: tarefa, impacto, interno e próximo passo.
- **Controle decorativo:** busca, conta, recolhimento e ações existem somente quando executam comportamento real.

## Rollback

Reimplantar o artefato imutável anterior do staging; remover o import de `admin-f11.css`, restaurar o shell anterior e manter os contratos/banco intactos. Nenhuma migration é necessária para a F11.

## Gate G11

G11 exige 100% das rotas inventariadas sem P0/P1, suíte completa verde, validação responsiva e acessível, staging implantado, jornada autenticada com MFA e ausência de regressão de sessão, rascunho, segurança e projeção pública. Até isso ocorrer, o gate permanece **NÃO APROVADO**.
