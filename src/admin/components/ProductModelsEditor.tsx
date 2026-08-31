import { useMemo } from "react";

type Variant = { id: string; name: string; code: string; order: number };
type Model = {
  id: string;
  model: string;
  manufacturerReference: string;
  sku: string;
  status: "active" | "discontinued";
  variants: Variant[];
};
const uid = () => crypto.randomUUID();

export function ProductModelsEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}) {
  const parsed = useMemo(() => {
    try {
      const data = JSON.parse(value);
      return Array.isArray(data) ? (data as Model[]) : null;
    } catch {
      return null;
    }
  }, [value]);
  const update = (models: Model[]) => onChange(JSON.stringify(models, null, 2));
  if (!parsed)
    return (
      <div role="alert" className="admin-notice--error">
        A estrutura de modelos está inválida. Corrija-a na área avançada.
      </div>
    );
  return (
    <div className="admin-model-editor">
      <div className="admin-section-heading">
        <div>
          <h3>Modelos e variantes</h3>
          <p>Interface principal para ordenar, ativar e manter as configurações comerciais.</p>
        </div>
        <button
          type="button"
          className="admin-button admin-button--secondary"
          disabled={disabled}
          onClick={() =>
            update([
              ...parsed,
              {
                id: uid(),
                model: "",
                manufacturerReference: "",
                sku: "",
                status: "active",
                variants: [{ id: uid(), name: "", code: "", order: 0 }],
              },
            ])
          }
        >
          Adicionar modelo
        </button>
      </div>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ordem</th>
              <th>Modelo comercial</th>
              <th>Referência interna</th>
              <th>SKU interno</th>
              <th>Estado</th>
              <th>Variantes</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {parsed.map((model, index) => (
              <tr key={model.id}>
                <td>{index + 1}</td>
                <td>
                  <input
                    aria-label={`Modelo ${index + 1}`}
                    value={model.model}
                    disabled={disabled}
                    onChange={(event) =>
                      update(
                        parsed.map((entry, i) =>
                          i === index ? { ...entry, model: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={`Referência ${index + 1}`}
                    value={model.manufacturerReference}
                    disabled={disabled}
                    onChange={(event) =>
                      update(
                        parsed.map((entry, i) =>
                          i === index ? { ...entry, manufacturerReference: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={`SKU ${index + 1}`}
                    value={model.sku}
                    disabled={disabled}
                    onChange={(event) =>
                      update(
                        parsed.map((entry, i) =>
                          i === index ? { ...entry, sku: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </td>
                <td>
                  <select
                    aria-label={`Estado ${index + 1}`}
                    value={model.status}
                    disabled={disabled}
                    onChange={(event) =>
                      update(
                        parsed.map((entry, i) =>
                          i === index ? { ...entry, status: event.target.value as Model["status"] } : entry,
                        ),
                      )
                    }
                  >
                    <option value="active">Ativo</option>
                    <option value="discontinued">Inativo</option>
                  </select>
                </td>
                <td>
                  <div className="admin-variant-list">
                    {model.variants.map((variant, variantIndex) => (
                      <div key={variant.id}>
                        <input
                          aria-label={`Nome da variante ${variantIndex + 1} do modelo ${index + 1}`}
                          placeholder="Variante"
                          value={variant.name}
                          disabled={disabled}
                          onChange={(event) =>
                            update(
                              parsed.map((entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      variants: entry.variants.map((item, j) =>
                                        j === variantIndex ? { ...item, name: event.target.value } : item,
                                      ),
                                    }
                                  : entry,
                              ),
                            )
                          }
                        />
                        <input
                          aria-label={`Código da variante ${variantIndex + 1} do modelo ${index + 1}`}
                          placeholder="Código interno"
                          value={variant.code}
                          disabled={disabled}
                          onChange={(event) =>
                            update(
                              parsed.map((entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      variants: entry.variants.map((item, j) =>
                                        j === variantIndex ? { ...item, code: event.target.value } : item,
                                      ),
                                    }
                                  : entry,
                              ),
                            )
                          }
                        />
                        {model.variants.length > 1 && (
                          <button
                            type="button"
                            disabled={disabled}
                            aria-label={`Remover variante ${variantIndex + 1}`}
                            onClick={() => {
                              if (window.confirm("Remover esta variante do rascunho?"))
                                update(
                                  parsed.map((entry, i) =>
                                    i === index
                                      ? {
                                          ...entry,
                                          variants: entry.variants
                                            .filter((_, j) => j !== variantIndex)
                                            .map((item, order) => ({ ...item, order })),
                                        }
                                      : entry,
                                  ),
                                );
                            }}
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        update(
                          parsed.map((entry, i) =>
                            i === index
                              ? {
                                  ...entry,
                                  variants: [
                                    ...entry.variants,
                                    { id: uid(), name: "", code: "", order: entry.variants.length },
                                  ],
                                }
                              : entry,
                          ),
                        )
                      }
                    >
                      Adicionar variante
                    </button>
                  </div>
                </td>
                <td>
                  <div className="admin-table-actions">
                    <button
                      type="button"
                      disabled={disabled || index === 0}
                      aria-label={`Mover modelo ${index + 1} para cima`}
                      onClick={() => {
                        const next = [...parsed];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        update(next);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={disabled || index === parsed.length - 1}
                      aria-label={`Mover modelo ${index + 1} para baixo`}
                      onClick={() => {
                        const next = [...parsed];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        update(next);
                      }}
                    >
                      ↓
                    </button>
                    {parsed.length > 1 && (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (window.confirm("Remover este modelo e suas variantes do rascunho?"))
                            update(parsed.filter((_, i) => i !== index));
                        }}
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
