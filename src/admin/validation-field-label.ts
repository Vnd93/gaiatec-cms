const labels: Record<string, string> = {
  schemaVersion: "Formato do cadastro",
  consumerId: "Tipo de cadastro",
  contentType: "Tipo de conteúdo",
  title: "Título",
  summary: "Resumo",
  route: "Endereço público",
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
  rightsConfirmed: "Confirmação dos direitos",
  governanceState: "Estado de governança",
  approval: "Aprovação",
  navigation: "Navegação",
  socialLinks: "Redes sociais",
  form: "Formulário",
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
