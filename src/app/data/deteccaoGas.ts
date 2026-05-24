/**
 * Linha Gaiatec de Detecção & Monitoramento de Gás.
 *
 * Catálogo apresentado como linha de produtos da própria Gaiatec
 * (representação exclusiva no Brasil). Sem qualquer referência a fabricante.
 *
 * A taxonomia (6 categorias) + textos curados de hub ficam aqui. Os ~43
 * produtos são carregados do catálogo coletado (deteccao-gas-catalog.draft.json)
 * — Vite resolve o import de JSON nativamente.
 */
import catalogData from "./deteccao-gas-catalog.draft.json";
import { DG_IMAGENS } from "./dgImagens";

export interface DgSpec {
  label: string;
  valor: string;
}

export interface DgProduto {
  slug: string;
  modelo: string;
  nome: string;
  descricao: string;
  categoriaSlug: string;
  specs: DgSpec[];
  features: string[];
  aplicacoes: string[];
  specsIncompletas: boolean;
  /** Foto própria da Gaiatec (a fornecer). Ausente → placeholder de marca. */
  imagem?: string;
}

export interface DgCategoria {
  slug: string;
  nome: string;
  /** Frase curta usada no card do hub. */
  resumo: string;
  /** Descrição mais longa usada na página de categoria. */
  descricao: string;
  /** Nome de ícone Lucide (PascalCase) — mapeado no componente. */
  icone: string;
}

export const HUB_BASE = "/deteccao-de-gas";

/* Slugs alinhados com o catálogo coletado para lookup direto. */
export const dgCategorias: DgCategoria[] = [
  {
    slug: "deteccao-movel",
    nome: "Detecção Móvel",
    resumo:
      "Veículos, drones e mochilas com laser para varrer grandes extensões de rede de gás em alta velocidade.",
    descricao:
      "Plataformas móveis de detecção a laser — veículos instrumentados, dispositivos embarcados em drone, mochilas portáteis e sensoriamento remoto à distância — para inspecionar quilômetros de rede enterrada e aérea com sensibilidade a nível ppb.",
    icone: "Truck",
  },
  {
    slug: "monitoramento-online",
    nome: "Monitoramento Online",
    resumo:
      "Sistemas fixos de monitoramento contínuo 24/7 de metano, pressão e válvulas, com transmissão remota.",
    descricao:
      "Estações e dispositivos fixos para vigilância ininterrupta da malha de gás — concentração de metano, pressão e válvulas inteligentes — com transmissão sem fio e integração a plataforma em nuvem.",
    icone: "Radio",
  },
  {
    slug: "localizacao-tubulacao-pe",
    nome: "Localização de Tubulação PE",
    resumo:
      "Localizadores para tubos de polietileno (PE) enterrados, que não respondem a métodos eletromagnéticos comuns.",
    descricao:
      "Equipamentos dedicados à localização precisa de tubulações de polietileno enterradas — um desafio clássico em redes de distribuição de gás, por não serem detectáveis por localizadores metálicos convencionais.",
    icone: "LocateFixed",
  },
  {
    slug: "deteccao-rede-enterrada-gas",
    nome: "Detecção de Rede Enterrada",
    resumo:
      "Inspeção e diagnóstico de redes de gás subterrâneas, identificando vazamentos ao longo do traçado.",
    descricao:
      "Instrumentos para inspeção de redes de gás enterradas, localizando pontos de vazamento ao longo do traçado e apoiando a manutenção preditiva da infraestrutura subterrânea.",
    icone: "Waypoints",
  },
  {
    slug: "detectores-portateis",
    nome: "Detectores Portáteis",
    resumo:
      "Handhelds para vazamento de gás, odorante (THT), multigás e pressão — para a rotina de campo.",
    descricao:
      "Detectores portáteis robustos para o dia a dia das equipes de campo: vazamento de gás, odorante (tetrahidrotiofeno/THT), medição multigás e pressão, com operação simples e resposta rápida.",
    icone: "Gauge",
  },
  {
    slug: "monitoramento-meteorologico",
    nome: "Monitoramento Meteorológico",
    resumo:
      "Estações meteorológicas portáteis e móveis para apoiar campanhas de detecção e dispersão de gases.",
    descricao:
      "Estações meteorológicas portáteis e móveis que fornecem dados de vento, temperatura e umidade — variáveis essenciais para interpretar a dispersão de gases e planejar campanhas de inspeção.",
    icone: "Wind",
  },
];

export function getDgCategoria(slug: string): DgCategoria | undefined {
  return dgCategorias.find((c) => c.slug === slug);
}

/* ─────────────────────────────────────────────────────────
   Carregamento dos produtos a partir do catálogo coletado.
   Gera slug único e estável por produto dentro de cada categoria.
   ───────────────────────────────────────────────────────── */
interface RawProduto {
  modelo: string;
  categoria: string;
  nome: string;
  descricao: string;
  specs: DgSpec[];
  features: string[];
  aplicacoes: string[];
  imagemUrlOrigem?: string;
  specsIncompletas?: boolean;
}
interface RawCategoria {
  slug: string;
  nome: string;
  produtos: RawProduto[];
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slug único por categoria; usa ppb/ppm/mini do nome como desambiguador. */
function uniqueSlug(modelo: string, nome: string, used: Set<string>): string {
  const base = slugify(modelo) || "item";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const disc = (nome.toLowerCase().match(/\b(ppb|ppm|mini|micro|pan-?tilt|bomba|solo|enterrad\w*)\b/) || [])[0];
  let cand = disc ? `${base}-${slugify(disc)}` : `${base}-2`;
  let n = 2;
  while (used.has(cand)) cand = `${base}-${n++}`;
  used.add(cand);
  return cand;
}

const rawCatalog = catalogData as unknown as { geradoEm: string; categorias: RawCategoria[] };

export const dgProdutos: DgProduto[] = rawCatalog.categorias.flatMap((cat) => {
  const used = new Set<string>();
  return cat.produtos.map((p) => {
    const slug = uniqueSlug(p.modelo, p.nome, used);
    return {
      slug,
      modelo: p.modelo,
      nome: p.nome,
      descricao: p.descricao,
      categoriaSlug: cat.slug,
      specs: p.specs ?? [],
      features: p.features ?? [],
      aplicacoes: p.aplicacoes ?? [],
      specsIncompletas: Boolean(p.specsIncompletas),
      imagem: DG_IMAGENS[slug],
    };
  });
});

export function getDgProdutosByCategoria(categoriaSlug: string): DgProduto[] {
  return dgProdutos.filter((p) => p.categoriaSlug === categoriaSlug);
}

export function getDgProduto(categoriaSlug: string, produtoSlug: string): DgProduto | undefined {
  return dgProdutos.find((p) => p.categoriaSlug === categoriaSlug && p.slug === produtoSlug);
}

export function countDgProdutos(categoriaSlug: string): number {
  return dgProdutos.filter((p) => p.categoriaSlug === categoriaSlug).length;
}

/** Produtos em destaque no hub — um representante de cada categoria. */
export const dgProdutosDestaque: DgProduto[] = dgCategorias
  .map((c) => getDgProdutosByCategoria(c.slug)[0])
  .filter((p): p is DgProduto => Boolean(p));

/** Diferenciais técnicos da linha (usados no hub). */
export const dgDiferenciais: { titulo: string; descricao: string }[] = [
  {
    titulo: "Tecnologia laser TDLAS",
    descricao:
      "Espectroscopia de absorção a laser sintonizável: seletiva, precisa e imune a falsos positivos de outros gases.",
  },
  {
    titulo: "Sensibilidade a nível ppb",
    descricao:
      "Detecção de metano e etano em partes por bilhão — ordens de grandeza acima dos métodos tradicionais.",
  },
  {
    titulo: "Posicionamento de alta precisão",
    descricao:
      "Satélite georreferenciando cada leitura, para mapear o vazamento exatamente onde ele está.",
  },
  {
    titulo: "Inspeção remota e à distância",
    descricao:
      "Medição de pontos de difícil acesso — vias movimentadas, prumadas e dutos elevados — a partir de zona segura.",
  },
];

/** Setores atendidos — slugs cruzam com /setores existentes. */
export const dgSetores: { label: string; slug: string }[] = [
  { label: "Gás e Petróleo", slug: "gas-petroleo" },
  { label: "Saneamento", slug: "saneamento" },
  { label: "Biogás e Biometano", slug: "biogas-biometano" },
  { label: "Segurança Operacional", slug: "seguranca-operacional" },
  { label: "Indústria", slug: "industria" },
  { label: "Controle Ambiental", slug: "controle-ambiental" },
];
