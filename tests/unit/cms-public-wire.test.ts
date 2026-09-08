import { describe, expect, it } from "vitest";
import {
  governedFormBindingSelector,
  presentNavigation,
  presentPublicForm,
  presentPublicRow,
  presentRelatedRow,
  presentSiteSettings,
  publicMediaSlots,
  publicWireLeak,
} from "../../supabase/functions/_shared/cms-public-wire";

const itemId = "91000000-0000-4000-8000-000000000001";
const revisionId = "91000000-0000-4000-8000-000000000002";
const assetId = "91000000-0000-4000-8000-000000000003";
const blockId = "91000000-0000-4000-8000-000000000004";
const documentId = "91000000-0000-4000-8000-000000000005";
const formId = "91000000-0000-4000-8000-000000000006";
const formVersionId = "91000000-0000-4000-8000-000000000007";
const endpoint = "https://project-ref.supabase.co/functions/v1/cms-public";

describe("contrato de apresentação pública sem identificadores internos", () => {
  it("projeta conteúdo, mídia e documento sem UUID, hash ou caminho de Storage", () => {
    const row = {
      item_id: itemId,
      revision_id: revisionId,
      content_type: "product",
      slug: "produto-publico",
      path: "/produtos/produto-publico",
      payload: {
        schemaVersion: 1,
        consumerId: "cms.product.v1",
        contentType: "product",
        title: "Produto público",
        blocks: [
          {
            id: blockId,
            groupId: revisionId,
            type: "image",
            data: { assetId, alt: "Produto instalado" },
          },
          {
            id: revisionId,
            type: "form",
            data: { formKey: "contato-produto", formId, formVersionId, buttonLabel: "Enviar" },
          },
        ],
        media: [{ assetId, role: "primary", alt: "Produto instalado", order: 0 }],
        documents: [
          {
            id: documentId,
            kind: "manual",
            title: "Manual público",
            revision: "A",
            language: "pt-BR",
            visibility: "public",
          },
        ],
        relations: { serviceIds: [itemId] },
        seo: {
          title: "Produto público",
          description: "Descrição",
          canonicalPath: "/produtos/produto-publico",
          indexable: true,
          ogImageId: assetId,
        },
      },
      seo: {
        title: "Produto público",
        description: "Descrição",
        canonicalPath: "/produtos/produto-publico",
        indexable: true,
        ogImageId: assetId,
      },
      published_at: "2026-09-07T12:00:00.000Z",
      media_urls: { [`${assetId}:large.webp`]: `https://storage.invalid/${assetId}.webp` },
      document_urls: { [documentId]: "validated" },
    };

    const result = presentPublicRow(row, endpoint, {
      formBindings: new Map([
        [governedFormBindingSelector(formId, formVersionId), { key: "contato-produto", version: 2 }],
      ]),
    });
    expect(result).toMatchObject({
      kind: "product",
      slug: "produto-publico",
      path: "/produtos/produto-publico",
      payload: {
        title: "Produto público",
        blocks: [
          { group: "group-1", data: { image: { alt: "Produto instalado" } } },
          { data: { formKey: "contato-produto", governed: true, formVersion: 2 } },
        ],
        documents: [{ title: "Manual público", visibility: "public" }],
      },
      seo: { socialImage: expect.stringContaining("type=media") },
    });
    expect(JSON.stringify(result)).not.toContain(itemId);
    expect(JSON.stringify(result)).not.toContain(revisionId);
    expect(JSON.stringify(result)).not.toContain(assetId);
    expect(JSON.stringify(result)).not.toContain(documentId);
    expect(JSON.stringify(result)).not.toContain("storage/v1");
    expect(publicWireLeak(result)).toBeNull();
    expect(
      new URL((result.payload.documents as Array<{ href: string }>)[0].href).searchParams.get("position"),
    ).toBe("1");
  });

  it("preserva o ordinal público quando um documento anterior não está disponível", () => {
    const unavailableDocumentId = "91000000-0000-4000-8000-000000000008";
    const row = {
      item_id: itemId,
      revision_id: revisionId,
      content_type: "product",
      slug: "produto-documentos",
      path: "/produtos/produto-documentos",
      payload: {
        contentType: "product",
        title: "Produto com documentos",
        documents: [
          {
            id: unavailableDocumentId,
            kind: "manual",
            title: "Manual indisponível",
            revision: "A",
            language: "pt-BR",
            visibility: "public",
          },
          {
            id: documentId,
            kind: "certificate",
            title: "Certificado disponível",
            revision: "B",
            language: "pt-BR",
            visibility: "public",
          },
        ],
      },
      seo: {
        title: "Produto com documentos",
        description: "Documentação pública controlada.",
        canonicalPath: "/produtos/produto-documentos",
        indexable: true,
      },
      published_at: "2026-09-08T12:00:00.000Z",
      media_urls: {},
      document_urls: { [documentId]: "validated" },
    };

    const result = presentPublicRow(row, endpoint);
    const documents = result.payload.documents as Array<{ title: string; href: string }>;

    expect(documents).toHaveLength(1);
    expect(documents[0].title).toBe("Certificado disponível");
    expect(new URL(documents[0].href).searchParams.get("position")).toBe("2");
    expect(JSON.stringify(result)).not.toContain(unavailableDocumentId);
    expect(JSON.stringify(result)).not.toContain(documentId);
  });

  it("publica somente a versão ativa exata e preserva o recorte de relações por bloco", () => {
    const relatedA = "91000000-0000-4000-8000-000000000011";
    const relatedB = "91000000-0000-4000-8000-000000000012";
    const generalRelation = "91000000-0000-4000-8000-000000000013";
    const row = {
      item_id: itemId,
      content_type: "page",
      slug: "pagina-publica",
      path: "/pagina-publica",
      payload: {
        title: "Página pública",
        blocks: [
          {
            id: blockId,
            type: "form",
            data: { formKey: "contato", formId, formVersionId, heading: "Contato" },
          },
          { id: relatedA, type: "related_content", data: { itemIds: [relatedA] } },
          { id: relatedB, type: "related_content", data: { itemIds: [relatedB] } },
        ],
        relations: { pageIds: [generalRelation] },
      },
      seo: {
        title: "Página pública",
        description: "Descrição",
        canonicalPath: "/pagina-publica",
        indexable: true,
      },
      published_at: "2026-09-07T12:00:00.000Z",
    };
    const relatedPaths = new Map([
      [relatedA, "/servicos/primeiro"],
      [relatedB, "/solucoes/segundo"],
      [generalRelation, "/produtos/relacao-geral"],
    ]);

    const active = presentPublicRow(row, endpoint, {
      formBindings: new Map([
        [governedFormBindingSelector(formId, formVersionId), { key: "contato-canonico", version: 3 }],
      ]),
      relatedPaths,
    });
    const derivedWithoutPersistedKey = presentPublicRow(
      {
        ...row,
        payload: {
          ...row.payload,
          blocks: row.payload.blocks.map((block, index) =>
            index === 0 ? { ...block, data: { formId, formVersionId, heading: "Contato" } } : block,
          ),
        },
      },
      endpoint,
      {
        formBindings: new Map([
          [governedFormBindingSelector(formId, formVersionId), { key: "contato-canonico", version: 3 }],
        ]),
        relatedPaths,
      },
    );
    const inactive = presentPublicRow(row, endpoint, { relatedPaths });
    const tampered = presentPublicRow(
      {
        ...row,
        payload: {
          ...row.payload,
          blocks: row.payload.blocks.map((block, index) =>
            index === 0 ? { ...block, data: { ...block.data, formId: relatedA } } : block,
          ),
        },
      },
      endpoint,
      {
        formBindings: new Map([
          [governedFormBindingSelector(formId, formVersionId), { key: "contato-canonico", version: 3 }],
        ]),
        relatedPaths,
      },
    );

    expect(active.payload.blocks).toMatchObject([
      { data: { formKey: "contato-canonico", governed: true, formVersion: 3 } },
      { data: { itemPaths: ["/servicos/primeiro"] } },
      { data: { itemPaths: ["/solucoes/segundo"] } },
    ]);
    expect(derivedWithoutPersistedKey.payload.blocks[0].data).toEqual({
      heading: "Contato",
      formKey: "contato-canonico",
      governed: true,
      formVersion: 3,
    });
    expect(inactive.payload.blocks[0].data).toEqual({ heading: "Contato" });
    expect(tampered.payload.blocks[0].data).toEqual({ heading: "Contato" });
    expect(JSON.stringify(active)).not.toContain(generalRelation);
    expect(JSON.stringify(active)).not.toContain(formVersionId);
    expect(publicWireLeak(active)).toBeNull();
  });

  it("omite a referência de formulário legada do payload de campanha", () => {
    const result = presentPublicRow(
      {
        item_id: itemId,
        content_type: "campaign",
        slug: "campanha-publica",
        path: "/campanhas/campanha-publica",
        payload: {
          title: "Campanha pública",
          form: { formId, versionId: formVersionId, key: "contato-antigo" },
          blocks: [],
        },
        seo: {
          title: "Campanha pública",
          description: "Descrição",
          canonicalPath: "/campanhas/campanha-publica",
          indexable: false,
        },
        published_at: "2026-09-07T12:00:00.000Z",
      },
      endpoint,
    );

    expect(result.payload).not.toHaveProperty("form");
    expect(JSON.stringify(result)).not.toContain(formId);
    expect(JSON.stringify(result)).not.toContain(formVersionId);
    expect(publicWireLeak(result)).toBeNull();
  });

  it("usa os mesmos seletores públicos determinísticos para resolver mídia", () => {
    const payload = {
      media: [{ assetId, role: "primary" }],
      blocks: [{ data: { assetId } }, { data: { assetIds: [revisionId] } }],
    };
    expect(Object.fromEntries(publicMediaSlots(payload, { ogImageId: revisionId }))).toEqual({
      primary: assetId,
      "block-1": assetId,
      "block-2-image-1": revisionId,
      social: revisionId,
    });
  });

  it("converte menu em árvore e remove identificadores de site, formulários e relações", () => {
    const navigation = presentNavigation({
      title: "Menu principal",
      items: [
        {
          id: itemId,
          parentId: null,
          location: "header",
          label: "Produtos",
          href: "/produtos",
          order: 1,
          visible: true,
        },
        {
          id: revisionId,
          parentId: itemId,
          location: "header",
          label: "Catálogo",
          href: "/produtos/catalogo",
          order: 1,
          visible: true,
        },
      ],
    });
    const settings = presentSiteSettings({
      title: "Dados globais",
      company: {
        name: "GAIATEC",
        phone: "11",
        whatsapp: "11",
        email: "contato@example.test",
        address: "Rua teste",
      },
      socialLinks: [{ id: itemId, network: "LinkedIn", url: "https://example.test" }],
      defaultCta: { label: "Contato", href: "/contato" },
    });
    const form = presentPublicForm({
      schemaVersion: 1,
      formId,
      versionId: formVersionId,
      version: 2,
      key: "contato",
      title: "Contato",
      purpose: "Atendimento",
      fields: [
        { id: itemId, key: "nome", label: "Nome", type: "text", required: true, options: [], order: 0 },
        {
          id: revisionId,
          key: "segmento-interno",
          label: "Segmento interno",
          type: "hidden",
          required: false,
          options: [],
          order: 1,
        },
      ],
      consent: { required: true, text: "Aceito", version: "2026", privacyPath: "/privacidade" },
      successMessage: "Recebido",
      submitLabel: "Enviar",
    });
    const related = presentRelatedRow({
      item_id: itemId,
      content_type: "service",
      path: "/servicos/calibracao",
      payload: { title: "Calibração" },
    });

    for (const value of [navigation, settings, form, related]) expect(publicWireLeak(value)).toBeNull();
    expect(navigation?.items[0].children?.[0]).toMatchObject({ label: "Catálogo" });
    expect(settings?.socialLinks).toEqual([{ network: "LinkedIn", url: "https://example.test" }]);
    expect(form).toMatchObject({ key: "contato", version: 2, fields: [{ key: "nome" }] });
    expect(form?.fields).toHaveLength(1);
    expect(related).toEqual({ kind: "service", title: "Calibração", path: "/servicos/calibracao" });
  });

  it("detecta valores UUID, chaves editoriais e URLs diretas de Storage", () => {
    expect(publicWireLeak({ nested: { value: `prefix-${itemId}` } })).toContain("uuid");
    expect(publicWireLeak({ nested: { value: "00000000-0000-0000-0000-000000000000" } })).toContain("uuid");
    for (const length of [40, 64, 128])
      expect(publicWireLeak({ nested: { value: "a".repeat(length) } }), `${length}-hex`).toContain("hash");
    expect(publicWireLeak({ governanceState: "homologated" })).toContain("key");
    for (const key of [
      "owner_id",
      "documentHash",
      "storageBucket",
      "correlation_id",
      "lock_version",
      "schemaRevision",
    ])
      expect(publicWireLeak({ [key]: "opaque" }), key).toContain("key");
    expect(
      publicWireLeak({ href: "https://project.supabase.co/storage/v1/object/sign/private/file" }),
    ).toContain("storage");
  });

  it.each([
    [{ apiKey: "secret-value" }, "key"],
    [{ nested: { access_token: "secret-value" } }, "key"],
    [{ text: "Bearer eyJhbGciOiJIUzI1NiJ9.secret" }, "secret"],
    [{ text: '<img src=x onerror="alert(1)">' }, "executable"],
    [{ href: "javascript:alert(1)" }, "executable"],
    [{ href: "https://cdn.example.test/image.webp?token=secret" }, "secret"],
    [{ href: "https://127.0.0.1/private" }, "private-host"],
    [{ text: "github_pat_AAAAAAAAAAAAAAAAAAAA" }, "secret"],
    [{ text: "postgresql://operator:password@database.example.test/cms" }, "secret"],
    [{ privateKey: "opaque" }, "key"],
    [JSON.parse('{"__proto__":{"polluted":true}}'), "key"],
  ])("detecta material confidencial ou executável no wire: %j", (value, reason) => {
    expect(publicWireLeak(value)).toContain(reason);
  });

  it("permite somente o proxy local governado durante execução explicitamente local", () => {
    const runtime = globalThis as unknown as Record<string, unknown>;
    const previousDeno = runtime.Deno;
    runtime.Deno = {
      env: {
        get: (name: string) =>
          name === "CMS_ENVIRONMENT"
            ? "local"
            : name === "SUPABASE_URL"
              ? "http://127.0.0.1:54321"
              : undefined,
      },
    };
    try {
      expect(
        publicWireLeak({
          href: "http://127.0.0.1:54321/functions/v1/cms-public?type=media&kind=product&slug=produto-publico&slot=primary",
        }),
      ).toBeNull();
      expect(publicWireLeak({ href: "http://127.0.0.1:54321/private" })).toContain("private-host");
    } finally {
      if (previousDeno === undefined) delete runtime.Deno;
      else runtime.Deno = previousDeno;
    }
  });

  it("recusa respostas anormalmente profundas antes de serializá-las ao consumidor", () => {
    let nested: unknown = "conteúdo";
    for (let depth = 0; depth < 70; depth += 1) nested = { value: nested };
    expect(publicWireLeak(nested)).toContain("depth");
  });

  it("não publica score bruto e converte o motivo técnico de busca em rótulo humano", () => {
    const result = presentPublicRow(
      {
        content_type: "product",
        slug: "produto-publico",
        path: "/produtos/produto-publico",
        payload: { title: "Produto público", blocks: [], documents: [] },
        seo: {},
        published_at: "2026-09-07T12:00:00.000Z",
        score: 999,
        matched_by: "governed_synonym",
      },
      endpoint,
    );

    expect(result).not.toHaveProperty("score");
    expect(result).toHaveProperty("matchedBy", "Correspondência por termo relacionado");
    expect(JSON.stringify(result)).not.toContain("governed_synonym");
  });

  it("recusa uma definição de formulário que o consumidor não consegue concluir", () => {
    expect(
      presentPublicForm({
        key: "formulario-invalido",
        version: 1,
        title: "Formulário inválido",
        purpose: "Prova negativa",
        fields: [
          {
            key: "segmento",
            label: "Segmento",
            type: "select",
            required: true,
            options: [],
            order: 0,
          },
        ],
        consent: { required: true, text: "Aceito", version: "v1", privacyPath: "/privacidade" },
        successMessage: "Recebido",
        submitLabel: "Enviar",
      }),
    ).toBeNull();
  });
});
