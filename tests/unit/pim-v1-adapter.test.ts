import { describe, expect, it } from "vitest";
import { comprehensiveProductPayload } from "../fixtures/product-payload";
import {
  comparePimV1Projection,
  PimProjectionError,
  type PimProjectionErrorCode,
  pimGraphToV1,
} from "../../src/admin/pim-v1-adapter";
import { CmsProductContentSchema } from "../../src/shared/contracts/cms-content";
import { Ev2PimProductInputSchema } from "../../src/shared/contracts/ev2-pim";

const id = (suffix: number) => `45000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const controlledOptions = (masterIds: string[]) =>
  Object.fromEntries(
    masterIds.map((masterId, index) => [
      masterId,
      { id: id(900 + index), slug: `opcao-${index + 1}`, label: `Opção ${index + 1}` },
    ]),
  );

function expectProjectionError(run: () => unknown, code: PimProjectionErrorCode) {
  try {
    run();
  } catch (caught) {
    expect(caught).toBeInstanceOf(PimProjectionError);
    expect(caught).toMatchObject({ code });
    expect((caught as Error).message).not.toContain(code);
    return;
  }
  throw new Error(`Era esperada uma falha PIM classificada como ${code}.`);
}

describe("PIM v1 adapter", () => {
  const identityFixture = () => ({
    id: id(700),
    name: "Produto de identidade",
    slug: "produto-de-identidade",
    masterData: {
      manufacturerId: id(701),
      categoryId: id(702),
      monitoredElementIds: [id(703)],
    },
    models: [
      {
        id: id(704),
        name: "Modelo A",
        primary: true,
        position: 0,
        variants: [
          {
            id: id(705),
            name: "DN50",
            code: "DN50",
            position: 0,
            axes: [{ axisKey: "diametro", axisLabel: "Diâmetro", optionKey: "dn50", optionLabel: "DN50" }],
          },
        ],
      },
      {
        id: id(706),
        name: "Modelo B",
        primary: false,
        position: 1,
        variants: [
          {
            id: id(707),
            name: "DN50",
            code: "dn50",
            position: 0,
            axes: [{ axisKey: "diametro", axisLabel: "Diâmetro", optionKey: "dn50", optionLabel: "DN50" }],
          },
        ],
      },
    ],
    provenance: [
      { id: id(708), sourceKind: "owner_authored" as const, sourceRef: "Owner", rightsConfirmed: true },
    ],
  });

  it("normalizes identities and allows the same variant code only across different models", () => {
    expect(Ev2PimProductInputSchema.safeParse(identityFixture()).success).toBe(true);

    const duplicateInsideModel = identityFixture();
    duplicateInsideModel.models[0].variants.push({
      id: id(709),
      name: "DN50 duplicada",
      code: " dn50 ",
      position: 1,
      axes: [{ axisKey: "diametro", axisLabel: "Diâmetro", optionKey: "dn50-b", optionLabel: "DN50 B" }],
    });
    expect(Ev2PimProductInputSchema.safeParse(duplicateInsideModel).success).toBe(false);

    const caseInsensitiveCollision = identityFixture();
    caseInsensitiveCollision.models[1].id = caseInsensitiveCollision.models[0].variants[0].id.toUpperCase();
    expect(Ev2PimProductInputSchema.safeParse(caseInsensitiveCollision).success).toBe(false);
  });

  it("binds attribute and external identifier owners to their declared graph type", () => {
    const wrongAttributeOwner = {
      ...identityFixture(),
      attributes: [
        {
          id: id(710),
          definitionId: id(711),
          scope: "model" as const,
          ownerId: id(705),
          value: "inválido",
        },
      ],
    };
    expect(Ev2PimProductInputSchema.safeParse(wrongAttributeOwner).success).toBe(false);

    const wrongIdentifierOwner = {
      ...identityFixture(),
      externalIdentifiers: [
        {
          id: id(712),
          ownerType: "variant" as const,
          ownerId: id(704),
          kind: "erp" as const,
          value: "ERP-INVALID",
        },
      ],
    };
    expect(Ev2PimProductInputSchema.safeParse(wrongIdentifierOwner).success).toBe(false);
  });

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
              code: "DN50",
              position: 0,
              axes: [{ axisKey: "diametro", axisLabel: "Diâmetro", optionKey: "dn50", optionLabel: "DN50" }],
            },
          ],
        },
        {
          id: id(16),
          name: "UFX-200",
          mpn: "MPN-200",
          primary: false,
          position: 1,
          variants: [
            {
              id: id(17),
              name: "DN50",
              code: "DN50",
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
        {
          id: id(18),
          definitionId: id(20),
          scope: "product",
          ownerId: id(1),
          value: "IP68",
          homologated: true,
        },
        {
          id: id(19),
          definitionId: id(21),
          scope: "variant",
          ownerId: id(12),
          value: true,
          homologated: true,
        },
      ],
      externalIdentifiers: [
        {
          id: id(22),
          ownerType: "product",
          ownerId: id(1),
          kind: "erp",
          value: "ERP-UFX",
          sourceType: "manual",
        },
        {
          id: id(23),
          ownerType: "model",
          ownerId: id(11),
          kind: "other",
          value: "MODEL-UFX-100",
          sourceType: "manual",
        },
        {
          id: id(24),
          ownerType: "variant",
          ownerId: id(12),
          kind: "gtin",
          value: "7891234567895",
          sourceType: "manual",
        },
      ],
      provenance: [
        {
          id: id(15),
          sourceKind: "official_manufacturer",
          sourceRef: "https://manufacturer.example.test/public.pdf",
          rightsConfirmed: true,
          verifiedAt: "2026-08-29T03:00:00.000Z",
        },
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
    const projected = pimGraphToV1(
      product,
      base,
      labels,
      {
        [id(11)]: "GAI-UFX-MODEL",
        [id(12)]: "GAI-UFX-000001",
        [id(16)]: "GAI-UFX-MODEL-2",
        [id(17)]: "GAI-UFX-000002",
      },
      controlledOptions([id(5), id(6), id(7), id(8), id(9)]),
      {
        [id(14)]: {
          attributeKey: "faixa-de-medicao",
          label: "Faixa de medição",
          dataType: "range",
          required: false,
          filterable: true,
          comparable: true,
          searchable: true,
        },
        [id(20)]: {
          attributeKey: "protecao",
          label: "Proteção",
          dataType: "text",
          required: true,
          filterable: true,
          comparable: true,
          searchable: true,
        },
        [id(21)]: {
          attributeKey: "certificado",
          label: "Certificado",
          dataType: "boolean",
          required: false,
          filterable: true,
          comparable: true,
          searchable: false,
        },
      },
    );
    expect(CmsProductContentSchema.parse(projected)).toEqual(projected);
    expect(projected.models[0]).toMatchObject({
      model: "UFX-100",
      manufacturerReference: "MPN-100",
      sku: "GAI-UFX-MODEL",
    });
    expect(projected.models[0].variants[0].sku).toBe("GAI-UFX-000001");
    expect(projected.models[1].variants[0]).toMatchObject({ code: "DN50", sku: "GAI-UFX-000002" });
    expect(projected.controlledClassification?.monitoredElement).toMatchObject({
      id: id(904),
      label: "Opção 5",
    });
    expect(projected.controlledClassification?.monitoredElement.id).not.toBe(id(9));
    expect(projected.specifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "model", ownerId: id(11), type: "range", unit: "m3/h" }),
        expect.objectContaining({ scope: "product", type: "text", value: "IP68" }),
        expect.objectContaining({ scope: "variant", ownerId: id(12), type: "boolean", value: true }),
      ]),
    );
    expect(projected.externalIdentifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ owner: { type: "product" }, value: "ERP-UFX" }),
        expect.objectContaining({ owner: { type: "model", id: id(11) } }),
        expect.objectContaining({ owner: { type: "variant", id: id(12) } }),
      ]),
    );
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
    expectProjectionError(() => pimGraphToV1(product, base, {}), "CMS_PIM_PUBLIC_DATA_REQUIRED");
  });

  it("sanitizes even a technical message passed directly to the typed PIM error", () => {
    const error = new PimProjectionError(
      "CMS_PIM_ATTRIBUTE_INVALID",
      "CMS_PIM_ATTRIBUTE_INVALID para 45000000-0000-4000-8000-000000000001",
    );

    expect(error.code).toBe("CMS_PIM_ATTRIBUTE_INVALID");
    expect(error.message).toBe("Revise os dados do produto antes de continuar.");
    expect(error.message).not.toMatch(/CMS_|45000000/);
  });

  it("fails closed instead of inventing a public brand when the source has no brand", () => {
    const base = comprehensiveProductPayload();
    const product = Ev2PimProductInputSchema.parse({
      id: id(30),
      name: "Produto sem marca identificada",
      slug: "produto-sem-marca-identificada",
      masterData: { manufacturerId: id(31), categoryId: id(32), monitoredElementIds: [id(33)] },
      models: [{ id: id(34), name: "Modelo documental", primary: true, position: 0 }],
      provenance: [
        { id: id(35), sourceKind: "import", sourceRef: "Portfólio mestre", rightsConfirmed: true },
      ],
    });
    const labels = Object.fromEntries(
      [
        [id(31), "Fabricante documental"],
        [id(32), "Categoria documental"],
        [id(33), "Elemento a confirmar"],
      ].map(([key, name]) => [key, { id: key, name }]),
    );

    expectProjectionError(
      () => pimGraphToV1(product, base, labels, { [id(34)]: "GAI-DOC-000001" }),
      "CMS_PIM_PUBLIC_DATA_REQUIRED",
    );
  });

  it("fails closed instead of materializing a placeholder when an active model has no active SKU", () => {
    const base = comprehensiveProductPayload();
    const product = Ev2PimProductInputSchema.parse({
      id: id(40),
      name: "Produto sem SKU",
      slug: "produto-sem-sku",
      masterData: {
        manufacturerId: id(41),
        brandId: id(46),
        lineId: id(47),
        categoryId: id(42),
        magnitudeIds: [id(48)],
        technologyIds: [id(49)],
        installationIds: [id(58)],
        monitoredElementIds: [id(43)],
      },
      models: [
        {
          id: id(44),
          name: "Modelo sem SKU",
          mpn: "MPN-44",
          primary: true,
          position: 0,
          variants: [
            {
              id: id(57),
              name: "Variante sem SKU",
              position: 0,
              axes: [{ axisKey: "tipo", axisLabel: "Tipo", optionKey: "padrao", optionLabel: "Padrão" }],
            },
          ],
        },
      ],
      provenance: [{ id: id(45), sourceKind: "owner_authored", sourceRef: "Owner", rightsConfirmed: true }],
    });
    const labels = Object.fromEntries(
      [
        [id(41), "Fabricante"],
        [id(42), "Categoria"],
        [id(43), "Elemento"],
        [id(46), "Marca"],
        [id(47), "Linha"],
        [id(48), "Grandeza"],
        [id(49), "Tecnologia"],
        [id(58), "Instalação"],
      ].map(([key, name]) => [key, { id: key, name }]),
    );

    expectProjectionError(
      () =>
        pimGraphToV1(product, base, labels, {}, controlledOptions([id(42), id(48), id(49), id(58), id(43)])),
      "CMS_PIM_ACTIVE_SKU_REQUIRED",
    );
  });

  it("requires an active SKU for every active variant", () => {
    const base = comprehensiveProductPayload();
    const product = Ev2PimProductInputSchema.parse({
      id: id(50),
      name: "Produto com cobertura parcial",
      slug: "produto-cobertura-parcial",
      masterData: {
        manufacturerId: id(51),
        brandId: id(59),
        lineId: id(60),
        categoryId: id(52),
        magnitudeIds: [id(61)],
        technologyIds: [id(62)],
        installationIds: [id(63)],
        monitoredElementIds: [id(53)],
      },
      models: [
        {
          id: id(54),
          name: "Modelo com variantes",
          mpn: "MPN-54",
          primary: true,
          position: 0,
          variants: [
            {
              id: id(55),
              name: "A",
              position: 0,
              axes: [{ axisKey: "tipo", axisLabel: "Tipo", optionKey: "tipo-a", optionLabel: "A" }],
            },
            {
              id: id(56),
              name: "B",
              position: 1,
              axes: [{ axisKey: "tipo", axisLabel: "Tipo", optionKey: "tipo-b", optionLabel: "B" }],
            },
          ],
        },
      ],
      provenance: [{ id: id(57), sourceKind: "owner_authored", sourceRef: "Owner", rightsConfirmed: true }],
    });
    const labels = Object.fromEntries(
      [
        [id(51), "Fabricante"],
        [id(52), "Categoria"],
        [id(53), "Elemento"],
        [id(59), "Marca"],
        [id(60), "Linha"],
        [id(61), "Grandeza"],
        [id(62), "Tecnologia"],
        [id(63), "Instalação"],
      ].map(([key, name]) => [key, { id: key, name }]),
    );

    expectProjectionError(
      () =>
        pimGraphToV1(
          product,
          base,
          labels,
          { [id(54)]: "GAI-MODEL-000001", [id(55)]: "GAI-PARCIAL-000001" },
          controlledOptions([id(52), id(61), id(62), id(63), id(53)]),
        ),
      "CMS_PIM_ACTIVE_SKU_REQUIRED",
    );
  });
});
