const labels: Record<string, string> = {
  schemaVersion: "Formato do cadastro",
  consumerId: "Tipo de cadastro",
  contentType: "Tipo de conteúdo",
  title: "Título",
  summary: "Resumo",
  route: "Rota da página",
  path: "Endereço público",
  blocks: "Blocos da página",
  payload: "Conteúdo",
  specifications: "Especificações",
  relations: "Relações",
  media: "Mídia",
  models: "Modelos",
  variants: "Variantes",
  skus: "SKUs",
  type: "Tipo",
  data: "Conteúdo do bloco",
  seo: "SEO",
  canonicalPath: "Endereço canônico",
  description: "Descrição",
  indexable: "Indexação",
  provenance: "Proveniência e direitos",
  authorizationReference: "Referência da autorização",
  authorizationDate: "Data da autorização",
  rightsScope: "Escopo dos direitos",
  rightsConfirmed: "Direitos de uso confirmados",
  governanceState: "Estado de governança",
  approval: "Aprovação",
  navigation: "Navegação",
  socialLinks: "Redes sociais",
  form: "Formulário",
  // Campos obrigatórios do construtor de páginas. Sem rótulo aqui, a pendência sai como
  // "Campo do cadastro" e o operador não descobre o que preencher.
  sourceKind: "Origem do conteúdo",
  commercialOwner: "Owner comercial",
  technicalOwner: "Owner técnico",
  verifiedAt: "Verificado em",
  businessOwner: "Owner de negócio",
  editorialReviewer: "Revisor editorial",
  approvedAt: "Data de aprovação",
  pageKind: "Tipo de página",
  templateKey: "Template",
  navigationLabel: "Rótulo de navegação",
  breadcrumbLabel: "Rótulo do breadcrumb",
  ogImageId: "Imagem de compartilhamento",
  retirement: "Comportamento ao sair do ar",
  mode: "Comportamento",
  destinationPath: "Destino do redirecionamento",
  productIds: "Produtos",
  serviceIds: "Serviços",
  industryIds: "Indústrias",
  applicationIds: "Aplicações",
  solutionIds: "Soluções",
  // Campos internos dos blocos.
  heading: "Título do bloco",
  text: "Texto",
  items: "Itens",
  label: "Rótulo",
  link: "Link",
  href: "Endereço do link",
  hidden: "Oculto no site",
  anchor: "Âncora",
  formKey: "Formulário publicado",
};

export function humanValidationPath(path: readonly PropertyKey[]): string {
  if (!path.length) return "Cadastro";
  return path
    .map((part) => {
      if (typeof part === "number" || /^\d+$/.test(String(part))) return `item ${Number(part) + 1}`;
      return labels[String(part)] ?? "Campo do cadastro";
    })
    .join(" › ");
}

export function humanValidationFields(fields: readonly string[]): string {
  return Array.from(
    new Set(fields.map((field) => humanValidationPath(field.split(/[.[\]]/).filter(Boolean)))),
  ).join(", ");
}

export type OperatorValidationIssue = {
  path: readonly PropertyKey[];
  code?: string;
};

export function humanValidationMessage(issue?: OperatorValidationIssue): string {
  switch (issue?.code) {
    case "too_small":
      return "informe um valor que atenda ao mínimo permitido.";
    case "too_big":
      return "reduza o valor até o limite permitido.";
    case "invalid_type":
      return "informe um valor válido para este campo.";
    case "invalid_format":
    case "invalid_string":
      return "revise o formato do valor informado.";
    case "invalid_value":
    case "invalid_enum_value":
      return "selecione uma das opções permitidas.";
    case "unrecognized_keys":
      return "remova os dados que não pertencem a este cadastro.";
    default:
      return "revise o valor informado.";
  }
}

export function humanValidationIssue(issue?: OperatorValidationIssue): string {
  return `${humanValidationPath(issue?.path ?? [])}: ${humanValidationMessage(issue)}`;
}
