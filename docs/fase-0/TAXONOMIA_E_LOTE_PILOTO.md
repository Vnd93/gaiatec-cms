# Taxonomia e lote piloto — definição G0

**Status:** aprovado para prova de arquitetura
**Data:** 28 de agosto de 2026
**Owner:** Comercial GAIATEC Sistemas; validação técnica interina de Pedro Nishida

## Regra de origem

Este recorte define somente o schema e o escopo do piloto. Não cria registros reais e não reutiliza nomes de modelo, SKU, textos, especificações, relações, documentos ou imagens do site atual.

Antes do recadastro real, cada item deverá receber fonte oficial vigente do fabricante, owner técnico, owner comercial, original de mídia autorizado e dupla aprovação.

## Taxonomia v0.1

```text
Segmento: Instrumentação e Controle de Processos
├── Categoria: Vazão
│   ├── Família piloto: Medição eletromagnética
│   └── Família piloto: Medição ultrassônica externa (clamp-on)
└── Categoria: Nível
    └── Família piloto: Medição contínua por radar
```

Campos transversais iniciais: identificação imutável, fabricante, linha, modelo/variante, função, meio, tecnologia, instalação, faixa, unidade, precisão, alimentação, saída, comunicação, condições de processo, documentos, mídia, relações, busca, SEO e proveniência.

## Lote `PILOTO-01`

| Código de trabalho | Entidade nova a selecionar | Objetivo arquitetural | Fonte exigida |
|---|---|---|---|
| `PILOTO-VZ-ELETRO-01` | uma família/modelo de vazão eletromagnética | atributos numéricos, conexão, meio, variantes e documentos | datasheet/manual oficial vigente |
| `PILOTO-VZ-CLAMP-01` | uma família/modelo ultrassônico clamp-on | instalação não intrusiva, acessórios, limitações e busca por sinônimo | datasheet/manual oficial vigente |
| `PILOTO-NV-RADAR-01` | uma família/modelo de nível por radar | alcance, processo, condições ambientais e comparação entre variantes | datasheet/manual oficial vigente |

## Critérios de entrada no recadastro

1. Modelo exato e fabricante selecionados pelos owners.
2. Fontes oficiais recebidas e registradas com versão/data/hash.
3. Direitos de imagem/documento confirmados.
4. Campos obrigatórios da categoria aprovados.
5. Nenhum dado extraído de arrays, tabelas ou arquivos atuais.

## Critério de saída futuro

O lote somente passa no Gate G4 após criação, revisão, preview, publicação, busca, SEO, restauração e autorização negativa completas em staging.
