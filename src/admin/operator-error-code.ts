import { PAGE_BLOCK_LABELS } from "./page-builder-model";

/**
 * Frases escritas AQUI, no cliente, a partir de um código de um conjunto fechado.
 *
 * O servidor recusa uma publicação de página com códigos como `CMS_PAGE_APPROVAL_REQUIRED`, mas o
 * operador nunca os viu: a fronteira remota é tratada como não confiável e o texto dela é
 * descartado de propósito (`operatorErrorMessage(..., { source: "remote" })`), sobrando a frase por
 * status — "Revise os dados informados e tente novamente." Ela é verdadeira e inútil: não diz o que
 * revisar.
 *
 * O código, ao contrário do texto, é metadado tipado e já chega ao cliente. Mapear código → frase
 * escrita aqui dá ao operador o motivo real sem nunca renderizar texto vindo do servidor.
 *
 * Cada frase foi derivada da CONDIÇÃO que levanta o erro, lida na migration, não do nome do código.
 */

/** Sufixos aceitos. Tudo que não estiver aqui é descartado, inclusive identificadores. */
const BLOCK_TYPE_SUFFIXES = new Set(Object.keys(PAGE_BLOCK_LABELS));

const MESSAGES: Record<string, string> = {
  // --- publicação de página, migration 0026 ---
  CMS_PAGE_HOMOLOGATION_REQUIRED:
    "Para permitir indexação, a página precisa estar com o estado de governança em Homologado.",
  CMS_PAGE_APPROVAL_REQUIRED: "Página homologada exige a data de aprovação preenchida na aba Governança.",
  CMS_PAGE_PROVENANCE_INVALID:
    "Conteúdo de fonte externa exige o hash de verificação e o endereço de origem na aba Governança.",
  CMS_PAGE_RETIREMENT_INVALID:
    "O destino do redirecionamento precisa ser um endereço público existente e diferente do endereço atual.",
  CMS_PAGE_ORPHAN_RELATION:
    "Uma das relações aponta para um conteúdo que ainda não está publicado. Publique o conteúdo relacionado ou remova a relação.",
  CMS_PAGE_BLOCK_INVALID: "Um bloco da página está incompleto.",
  CMS_PAGE_SCHEMA_INVALID: "A estrutura da página não corresponde ao formato esperado.",
  CMS_ROUTE_CANONICAL_MISMATCH: "O endereço oficial precisa ser idêntico ao endereço público da página.",
  CMS_ROUTE_KIND_MISMATCH: "O endereço não corresponde ao tipo de página selecionado.",

  // --- navegação, migration 0026 ---
  CMS_NAVIGATION_CYCLE: "A navegação ficou circular: um item aponta para um ancestral dele mesmo.",
  CMS_NAVIGATION_DEPTH_EXCEEDED: "A navegação excede a profundidade permitida de níveis.",
  CMS_NAVIGATION_DUPLICATE_ID: "Há dois itens de navegação com o mesmo identificador.",
  CMS_NAVIGATION_PARENT_NOT_FOUND: "Um item de navegação aponta para um item pai que não existe.",
  CMS_NAVIGATION_LOCATION_MISMATCH: "Um item de navegação está numa área que não o comporta.",
  CMS_NAVIGATION_ITEM_INVALID: "Um item de navegação está incompleto.",
  CMS_NAVIGATION_INVALID: "A navegação não corresponde ao formato esperado.",
  CMS_SITE_SETTINGS_INVALID: "As configurações do site não correspondem ao formato esperado.",

  // --- comando editorial, migrations 0015 e 0026 ---
  CMS_CONTENT_SCHEMA_INVALID: "O cadastro não corresponde ao formato esperado.",
  CMS_CONTENT_PROVENANCE_INVALID: "A proveniência do conteúdo está incompleta.",
  CMS_TRANSITION_INVALID: "Esta transição não é permitida a partir do estado atual da página.",
  CMS_BLOCK_WITHOUT_RENDERER: "A página usa um bloco que ainda não tem apresentação no site público.",
  CMS_CONSUMER_UNAVAILABLE: "Este tipo de cadastro não está disponível nesta versão.",
  CMS_REVISION_NOT_FOUND: "A revisão solicitada não existe mais.",
};

/**
 * Devolve a frase escrita para um código, ou `null` quando o código é desconhecido — e aí a frase
 * por status continua valendo. Desconhecido nunca vira texto: um código novo, que este mapa não
 * conhece, jamais é mostrado.
 */
export function operatorMessageForCode(code: string | undefined): string | null {
  if (!code) return null;
  const [prefix, suffix] = code.split(":", 2);
  const base = MESSAGES[prefix];
  if (!base) return null;

  // O sufixo só entra se casar com forma fechada. `CMS_PAGE_BLOCK_INVALID:form` vira o rótulo do
  // bloco; `CMS_PAGE_ORPHAN_RELATION:<identificador>` tem o sufixo descartado, porque é dado.
  if (prefix === "CMS_PAGE_BLOCK_INVALID" && suffix && BLOCK_TYPE_SUFFIXES.has(suffix)) {
    const label = PAGE_BLOCK_LABELS[suffix as keyof typeof PAGE_BLOCK_LABELS];
    return `O bloco "${label}" está incompleto. Abra a aba Blocos e preencha os campos obrigatórios dele.`;
  }
  return base;
}
