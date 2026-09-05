import type { CmsProductContent } from "@/shared/contracts/cms-content";

type Specification = CmsProductContent["specifications"][number];

export function formatProductSpecification(spec: Specification) {
  const { value } = spec;
  let formatted: string;
  if (typeof value === "boolean") formatted = value ? "Sim" : "Não";
  else if (Array.isArray(value)) formatted = value.join(" · ");
  else if (typeof value === "object") formatted = `${value.min}–${value.max}`;
  else formatted = String(value);
  return spec.unit ? `${formatted} ${spec.unit}` : formatted;
}
