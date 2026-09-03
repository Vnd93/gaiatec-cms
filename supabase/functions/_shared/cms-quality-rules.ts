export type QualityFinding = {
  ruleKey: string;
  category: "seo" | "accessibility" | "links" | "media" | "content" | "pim";
  severity: "error" | "warning" | "recommendation";
  fieldPath: string;
  message: string;
};

type JsonRecord = Record<string, any>;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const finding = (
  ruleKey: string,
  category: QualityFinding["category"],
  severity: QualityFinding["severity"],
  fieldPath: string,
  message: string,
): QualityFinding => ({ ruleKey, category, severity, fieldPath, message });

function inspectLinks(value: unknown, path: string, findings: QualityFinding[], linkCandidate = false) {
  if (typeof value === "string" && linkCandidate && /^(?:https?:\/\/|\/)/.test(value)) {
    try {
      if (value.startsWith("/")) new URL(value, "https://gaiatecsistemas.com.br");
      else new URL(value);
    } catch {
      findings.push(finding("links.invalid_url", "links", "error", path, "URL inválida."));
    }
    return;
  }
  if (Array.isArray(value)) value.forEach((entry, index) => inspectLinks(entry, `${path}[${index}]`, findings, linkCandidate));
  else if (value && typeof value === "object")
    Object.entries(value as JsonRecord).forEach(([key, entry]) => {
      inspectLinks(entry, `${path}.${key}`, findings, linkCandidate || /url|href|link/i.test(key));
    });
}

export function evaluateQuality(payloadValue: unknown, seoValue: unknown = {}): QualityFinding[] {
  const payload = payloadValue && typeof payloadValue === "object" ? (payloadValue as JsonRecord) : {};
  const seo = seoValue && typeof seoValue === "object" ? (seoValue as JsonRecord) : {};
  const findings: QualityFinding[] = [];
  const title = text(payload.title);
  const summary = text(payload.summary);
  const seoTitle = text(seo.title) || title;
  const seoDescription = text(seo.description) || summary;

  if (!title) findings.push(finding("content.title_required", "content", "error", "payload.title", "Título obrigatório."));
  if (!summary) findings.push(finding("content.summary_required", "content", "warning", "payload.summary", "Resumo recomendado."));
  if (seoTitle.length > 60) findings.push(finding("seo.title_length", "seo", "warning", "seo.title", "Título SEO deve ter até 60 caracteres."));
  if (!seoDescription) findings.push(finding("seo.description_required", "seo", "error", "seo.description", "Descrição SEO obrigatória."));
  else if (seoDescription.length < 50 || seoDescription.length > 160)
    findings.push(finding("seo.description_length", "seo", "warning", "seo.description", "Descrição SEO recomendada entre 50 e 160 caracteres."));
  if (seo.indexable === true && !text(seo.canonicalPath ?? seo.canonical))
    findings.push(finding("seo.canonical_required", "seo", "error", "seo.canonicalPath", "Canonical obrigatório para conteúdo indexável."));

  const media = Array.isArray(payload.media) ? payload.media : [];
  media.forEach((asset: JsonRecord, index: number) => {
    if (!text(asset.alt)) findings.push(finding("media.alt_required", "accessibility", "error", `payload.media[${index}].alt`, "Texto alternativo obrigatório."));
    if (asset.rightsConfirmed === false) findings.push(finding("media.rights_required", "media", "error", `payload.media[${index}].rightsConfirmed`, "Direitos de mídia não confirmados."));
  });

  if (payload.contentType === "product") {
    const specifications = Array.isArray(payload.specifications) ? payload.specifications : [];
    if (!specifications.length)
      findings.push(finding("pim.specification_recommended", "pim", "recommendation", "payload.specifications", "Informe especificações técnicas homologadas."));
    specifications.forEach((spec: JsonRecord, index: number) => {
      if (spec.searchable === true && spec.homologated === false)
        findings.push(finding("pim.searchable_requires_homologation", "pim", "error", `payload.specifications[${index}]`, "Atributo pesquisável precisa estar homologado."));
    });
  }
  inspectLinks(payload, "payload", findings);
  return findings;
}

export function qualityStatus(findings: QualityFinding[]) {
  if (findings.some((entry) => entry.severity === "error")) return "blocked" as const;
  if (findings.some((entry) => entry.severity === "warning")) return "warning" as const;
  return "passed" as const;
}
