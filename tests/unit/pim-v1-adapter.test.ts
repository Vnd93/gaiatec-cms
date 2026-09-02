import { describe, expect, it } from "vitest";
import { comprehensiveProductPayload } from "../fixtures/product-payload";
import { comparePimV1Projection, pimGraphToV1 } from "../../src/admin/pim-v1-adapter";
import { CmsProductContentSchema } from "../../src/shared/contracts/cms-content";
import { Ev2PimProductInputSchema } from "../../src/shared/contracts/ev2-pim";

const id = (suffix: number) => `45000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

describe("PIM v1 adapter", () => {
  it("projects normalized identity, classifications, models and attributes into the v1 contract", () => {
    const base = comprehensiveProductPayload();
    const product = Ev2PimProductInputSchema.parse({
      id: id(1),
      name: "Medidor UFX",
      slug: "medidor-ufx",
      summary: "Resumo PIM",
      valueProposition: "Sem interrupção",
      masterData: {
        manufacturerId: id(2),
        brandId: id(3),
        lineId: id(4),
        categoryId: id(5),
        magnitudeIds: [id(6)],
        technologyIds: [id(7)],
        installationIds: [id(8)],
        monitoredElementIds: [id(9), id(10)],
      },
      models: [
        {
          id: id(11),
          name: "UFX-100",
          mpn: "MPN-100",
          primary: true,
          position: 0,
          variants: [
            {
              id: id(12),
              name: "DN50",
              position: 0,
              axes: [{ axisKey: "diametro", axisLabel: "Diâmetro", optionKey: "dn50", optionLabel: "DN50" }],
            },
          ],
        },
      ],
      attributes: [
        {
          id: id(13),
          definitionId: id(14),
          scope: "model",
          ownerId: id(11),
          value: { min: 0, max: 100 },
          unitCode: "m3/h",
          homologated: true,
        },
      ],
      provenance: [
        { id: id(15), sourceKind: "official_manufacturer", sourceRef: "Datasheet A", rightsConfirmed: true },
      ],
    });
    const labels = Object.fromEntries(
      [
        [id(2), "Fabricante"],
        [id(3), "Marca"],
        [id(4), "Linha"],
        [id(5), "Vazão"],
        [id(6), "Vazão volumétrica"],
        [id(7), "Ultrassônica"],
        [id(8), "Clamp-on"],
        [id(9), "Água"],
        [id(10), "Gás"],
        [id(14), "Faixa de medição"],
      ].map(([key, name]) => [key, { id: key, name }]),
    );
    const projected = pimGraphToV1(product, base, labels, { [id(12)]: "GAI-UFX-000001" });
    expect(CmsProductContentSchema.parse(projected)).toEqual(projected);
    expect(projected.models[0]).toMatchObject({
      model: "UFX-100",
      manufacturerReference: "MPN-100",
      sku: "GAI-UFX-000001",
    });
    expect(projected.controlledClassification?.monitoredElement.label).toBe("Água");
    expect(projected.specifications[0]).toMatchObject({ type: "range", unit: "m3/h", filterable: true });
    expect(comparePimV1Projection(projected, projected)).toEqual([]);
  });

  it("fails closed when a master identity cannot be resolved", () => {
    const base = comprehensiveProductPayload();
    const product = Ev2PimProductInputSchema.parse({
      id: id(20),
      name: "Produto",
      slug: "produto",
      masterData: { manufacturerId: id(21), categoryId: id(22), monitoredElementIds: [id(23)] },
      models: [{ id: id(24), name: "Único", primary: true, position: 0 }],
      provenance: [{ id: id(25), sourceKind: "owner_authored", sourceRef: "Owner", rightsConfirmed: true }],
    });
    expect(() => pimGraphToV1(product, base, {})).toThrow(/fabricante não resolvida/);
  });
});
