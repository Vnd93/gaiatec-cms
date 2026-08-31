# Design System administrativo GAIATEC

## Fundamentos

- identidade: azul GAIATEC para ação/informação; laranja para foco e destaque; vermelho somente para perigo;
- fonte: Montserrat com fallback Inter/Arial;
- canvas `#f5f7fa`, superfície branca, texto `#142033`, texto secundário `#556579`;
- contraste alvo: WCAG 2.2 AA; foco laranja de 3,2 px com offset;
- nenhuma cor é o único indicador de estado.

## Tokens

| Grupo      | Tokens principais                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| cor        | `--admin-blue`, `--admin-blue-dark`, `--admin-orange`, `--admin-success`, `--admin-warning`, `--admin-danger` |
| superfície | `--admin-canvas`, `--admin-surface`, `--admin-surface-muted`                                                  |
| borda      | `--admin-line`, `--admin-line-strong`                                                                         |
| espaço     | 4, 8, 12, 16, 20, 24, 32 e 40 px                                                                              |
| raio       | 4, 7, 11 e 16 px                                                                                              |
| elevação   | `--admin-shadow-sm` e `--admin-shadow-md`                                                                     |
| estrutura  | topo 64 px; sidebar 272 px ou 80 px recolhida                                                                 |

## Tipografia e densidade

- H1: 26–36 px responsivo;
- H2 de card: 16–18 px;
- corpo: 14 px/1,55;
- ajuda: 11–12 px/1,4;
- label: 12 px, peso 700, sem caixa alta;
- eyebrow: 10–11 px, caixa alta e uso restrito.

Alvos interativos têm no mínimo 42–44 px. Formulários usam duas colunas somente acima de 680 px e quando os campos têm relação direta.

## Grid e breakpoints

- desktop amplo: 1440×900, sidebar aberta e rail lateral;
- notebook: 1280×800, mesma arquitetura com espaços menores;
- tablet: até 899 px, drawer e conteúdo em uma coluna;
- mobile: 390×844, topo em duas linhas, drawer modal e ações empilhadas;
- tabelas grandes ficam dentro de região rolável própria; o documento não ganha overflow horizontal.

## Componentes

- PageHeader: tarefa, descrição e ações de maior nível;
- breadcrumbs: localização, nunca usado como título;
- ActionBar: primária à direita; secundária antes; perigosa separada;
- SectionCard/FieldGroup: uma intenção operacional por grupo;
- StepTabs: ordem, seleção, setas do teclado e contagem de erros;
- StatusRail: status real, progresso contratual, pendências e atualização;
- estados: ícone, título, explicação e ação permitida;
- DataTable: caption, cabeçalho, linhas legíveis e overflow contido;
- confirmação: `alertdialog`, foco no cancelamento e Escape.

## Movimento

Transições de 160–200 ms são permitidas em drawer, recolhimento e chevrons. `prefers-reduced-motion: reduce` reduz animações e transições para duração mínima. Skeleton não provoca salto de layout.

## Regras de proibição

- sem sino, badge numérico ou CTA sem fonte transacional;
- sem HTML/CSS/JS editorial arbitrário;
- sem placeholder substituindo label;
- sem ação de publicar/arquivar quando estado ou permissão não permitem;
- sem fabricante/OEM, referência, SKU ou proveniência em superfícies públicas.
