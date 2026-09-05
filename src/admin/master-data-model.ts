import type { Ev2MasterCompatibility, Ev2MasterEntity } from "@/shared/contracts/ev2-master-data";

export type DependentOption = {
  id: string;
  label: string;
};

export type PreservedIncompatibility = DependentOption & {
  reason: "inactive" | "not_compatible" | "not_found";
  explanation: string;
};

export function resolveDependentOptions(
  entities: readonly Ev2MasterEntity[],
  compatibilities: readonly Ev2MasterCompatibility[],
  existingIds: readonly string[] = [],
): { options: DependentOption[]; preservedIncompatibilities: PreservedIncompatibility[] } {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const compatibleById = new Map<string, DependentOption>();

  for (const compatibility of compatibilities) {
    if (compatibility.status !== "active" || compatibility.target?.status !== "active") continue;
    compatibleById.set(compatibility.target.id, {
      id: compatibility.target.id,
      label: compatibility.target.canonicalName,
    });
  }

  const options = [...compatibleById.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base" }),
  );
  const preservedIncompatibilities = [...new Set(existingIds)]
    .filter((id) => !compatibleById.has(id))
    .map((id): PreservedIncompatibility => {
      const entity = entityById.get(id);
      if (!entity) {
        return {
          id,
          label: `Referência ${id.slice(0, 8)}`,
          reason: "not_found",
          explanation: "A referência histórica não foi localizada e foi preservada para revisão.",
        };
      }
      if (entity.status !== "active") {
        return {
          id,
          label: entity.canonicalName,
          reason: "inactive",
          explanation:
            "O valor está inativo; permanece no conteúdo atual, mas não pode ser escolhido novamente.",
        };
      }
      return {
        id,
        label: entity.canonicalName,
        reason: "not_compatible",
        explanation: "O valor não é compatível com a seleção atual e será removido somente após confirmação.",
      };
    });

  return { options, preservedIncompatibilities };
}
