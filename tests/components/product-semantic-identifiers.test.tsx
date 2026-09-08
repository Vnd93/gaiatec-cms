import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  ProductIdentifiersEditor,
  ProductSpecificationsEditor,
} from "../../src/admin/components/ProductSemanticEditors";
import { ProductModelsEditor } from "../../src/admin/components/ProductModelsEditor";

const modelId = "10000000-0000-4000-8000-000000000001";
const variantId = "10000000-0000-4000-8000-000000000002";
const models = [
  {
    id: modelId,
    model: "GATFLOW-B",
    manufacturerReference: "KF700E",
    sku: "GAI-GATFLOW-B",
    status: "active" as const,
    variants: [{ id: variantId, name: "DN50", code: "DN50", order: 0 }],
  },
];

function IdentifierHarness() {
  const [value, setValue] = useState("[]");
  return (
    <>
      <ProductIdentifiersEditor value={value} modelsValue={JSON.stringify(models)} onChange={setValue} />
      <output data-testid="identifier-value">{value}</output>
    </>
  );
}

function ModelHarness() {
  const [value, setValue] = useState(JSON.stringify(models));
  return (
    <>
      <ProductModelsEditor value={value} onChange={setValue} />
      <output data-testid="model-value">{value}</output>
    </>
  );
}

const definitionId = "10000000-0000-4000-8000-000000000101";
const controlledDefinition = {
  id: definitionId,
  attributeKey: "pressao-maxima",
  label: "Pressão máxima",
  description: "Pressão máxima homologada",
  dataType: "decimal" as const,
  canonicalUnitCode: "bar",
  enumOptions: [],
  filterable: true,
  comparable: true,
  searchable: true,
  required: true,
  inherited: false,
  position: 1,
};
const enumDefinition = {
  ...controlledDefinition,
  id: "10000000-0000-4000-8000-000000000102",
  attributeKey: "material-corpo",
  label: "Material do corpo",
  description: "Material homologado",
  dataType: "enum" as const,
  canonicalUnitCode: null,
  enumOptions: ["Aço inoxidável", "Bronze"],
  required: false,
};
const units = [
  {
    code: "bar",
    label: "Bar",
    symbol: "bar",
    dimensionKey: "pressure",
    canonicalCode: "bar",
    factorToCanonical: 1,
    offsetToCanonical: 0,
  },
  {
    code: "kpa",
    label: "Quilopascal",
    symbol: "kPa",
    dimensionKey: "pressure",
    canonicalCode: "bar",
    factorToCanonical: 0.01,
    offsetToCanonical: 0,
  },
  {
    code: "celsius",
    label: "Celsius",
    symbol: "°C",
    dimensionKey: "temperature",
    canonicalCode: "celsius",
    factorToCanonical: 1,
    offsetToCanonical: 0,
  },
];

function SpecificationHarness() {
  const [value, setValue] = useState("[]");
  return (
    <>
      <ProductSpecificationsEditor
        value={value}
        modelsValue={JSON.stringify(models)}
        definitions={[controlledDefinition, enumDefinition]}
        units={units}
        onChange={setValue}
      />
      <output data-testid="specification-value">{value}</output>
    </>
  );
}

describe("semantic product identity editors", () => {
  it("creates a GTIN linked through a human-readable model selection", () => {
    render(<IdentifierHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar identificador" }));
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "gtin" } });
    fireEvent.change(screen.getByLabelText("Pertence a"), { target: { value: `model:${modelId}` } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "7891234567890" } });
    fireEvent.change(screen.getByLabelText("Divulgação"), { target: { value: "public" } });

    const [identifier] = JSON.parse(screen.getByTestId("identifier-value").textContent ?? "[]");
    expect(identifier).toMatchObject({
      owner: { type: "model", id: modelId },
      kind: "gtin",
      value: "7891234567890",
      visibility: "public",
      sourceType: "manual",
    });
    expect(screen.getByRole("option", { name: "Modelo GATFLOW-B" })).toBeInTheDocument();
    expect(screen.queryByText(modelId)).not.toBeInTheDocument();
  });

  it("keeps an optional variant SKU in the same canonical model structure", () => {
    render(<ModelHarness />);
    fireEvent.change(screen.getByLabelText("Código comercial da variante 1 do modelo 1"), {
      target: { value: "GAI-GATFLOW-B-DN50" },
    });
    const [model] = JSON.parse(screen.getByTestId("model-value").textContent ?? "[]");
    expect(model.variants[0].sku).toBe("GAI-GATFLOW-B-DN50");
  });

  it("persists the authoritative definition while exposing only semantic catalog labels", () => {
    render(<SpecificationHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar atributo" }));
    fireEvent.change(screen.getByLabelText("Atributo controlado"), {
      target: { value: definitionId },
    });

    expect(screen.getByLabelText("Tipo de valor")).toBeDisabled();
    expect(screen.getByLabelText("Obrigatório para publicação")).toBeDisabled();
    expect(screen.getByRole("option", { name: "Bar (bar)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Quilopascal (kPa)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Celsius (°C)" })).not.toBeInTheDocument();
    expect(screen.queryByText(definitionId)).not.toBeInTheDocument();

    let [specification] = JSON.parse(screen.getByTestId("specification-value").textContent ?? "[]");
    expect(specification).toMatchObject({
      definitionId,
      key: "pressao-maxima",
      label: "Pressão máxima",
      type: "number",
      value: 0,
      unit: "bar",
      required: true,
      filterable: true,
      comparable: true,
      searchable: true,
      homologated: false,
    });

    fireEvent.click(screen.getByLabelText("Valor técnico homologado"));
    [specification] = JSON.parse(screen.getByTestId("specification-value").textContent ?? "[]");
    expect(specification.homologated).toBe(true);
  });

  it("blocks new technical values when the selected category has no active catalog", () => {
    render(<ProductSpecificationsEditor value="[]" onChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "Adicionar atributo" })).toBeDisabled();
    expect(
      screen.getByText("Selecione primeiro uma categoria com conjunto de atributos ativo."),
    ).toBeInTheDocument();
  });

  it("restricts enum values to the authoritative options", async () => {
    const user = userEvent.setup();
    render(<SpecificationHarness />);
    await user.click(screen.getByRole("button", { name: "Adicionar atributo" }));
    await user.selectOptions(screen.getByLabelText("Atributo controlado"), enumDefinition.id);

    const values = screen.getByLabelText("Valores aprovados");
    expect(screen.getByRole("option", { name: "Aço inoxidável" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bronze" })).toBeInTheDocument();
    await user.selectOptions(values, "Aço inoxidável");

    const [specification] = JSON.parse(screen.getByTestId("specification-value").textContent ?? "[]");
    expect(specification.value).toEqual(["Aço inoxidável"]);
  });
});
