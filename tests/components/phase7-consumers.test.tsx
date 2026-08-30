import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { CmsStructuredArticle } from "../../src/shared/components/CmsStructuredArticle";
import { CmsLeadForm } from "../../src/public/components/CmsLeadForm";
import type { CmsFormVersion } from "../../src/shared/contracts/cms-content";

describe("F7 public consumers", () => {
  it("renders visible article metadata and Article JSON-LD", () => {
    const { container } = render(
      <CmsStructuredArticle
        payload={{
          title: "Artigo sintético",
          excerpt: "Resumo",
          author: { name: "Autora", slug: "autora" },
          category: { name: "Categoria", slug: "categoria" },
          tags: [{ name: "Tag", slug: "tag" }],
          readingMinutes: 3,
          blocks: [{ id: "1", type: "rich_text", data: { text: "Corpo sintético" } }],
        }}
        publishedAt="2026-08-29T12:00:00.000Z"
      />,
    );
    expect(screen.getByRole("heading", { name: "Artigo sintético" })).toBeVisible();
    expect(screen.getByText(/Autora/)).toBeVisible();
    const schema = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')?.textContent ?? "{}",
    );
    expect(schema["@type"]).toBe("Article");
    expect(schema.author.name).toBe("Autora");
  });

  it("renders a version-pinned accessible form and explicit consent", () => {
    const form: CmsFormVersion = {
      schemaVersion: 1,
      formId: "70000000-0000-4000-8000-000000000001",
      versionId: "70000000-0000-4000-8000-000000000002",
      version: 1,
      key: "contato-sintetico",
      title: "Contato sintético",
      purpose: "Fixture local.",
      fields: [
        {
          id: "70000000-0000-4000-8000-000000000003",
          key: "email",
          label: "E-mail",
          type: "email",
          required: true,
          maxLength: 254,
          options: [],
          personalData: true,
          order: 0,
        },
      ],
      consent: {
        required: true,
        text: "Aceito o tratamento.",
        version: "v1",
        privacyPath: "/politica-de-privacidade",
      },
      slaMinutes: 60,
      retentionDays: 30,
      successMessage: "Recebido.",
      submitLabel: "Enviar",
      status: "published",
    };
    render(
      <MemoryRouter>
        <CmsLeadForm form={form} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("textbox", { name: /e-mail/i })).toBeRequired();
    expect(screen.getByRole("checkbox", { name: /aceito o tratamento/i })).toBeRequired();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeVisible();
  });
});
