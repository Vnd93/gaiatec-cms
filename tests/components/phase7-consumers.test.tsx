import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SUPABASE_URL } from "../../src/lib/supabase";
import { CmsStructuredArticle } from "../../src/shared/components/CmsStructuredArticle";
import { CmsLeadForm } from "../../src/public/components/CmsLeadForm";
import { submitGovernedLead } from "../../src/public/lead-api";
import type { CmsFormVersion } from "../../src/shared/contracts/cms-content";

vi.mock("../../src/public/lead-api", () => ({ submitGovernedLead: vi.fn() }));

describe("F7 public consumers", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });
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

  it("serializa JSON-LD como dados inertes mesmo quando o título contém fechamento de script", () => {
    const title = 'Artigo </script><script src="https://attacker.invalid/x.js">';
    const { container } = render(<CmsStructuredArticle payload={{ title, blocks: [] }} />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].textContent).not.toContain("</script>");
    expect(JSON.parse(scripts[0].textContent ?? "{}").headline).toBe(title);
  });

  it("keeps ungoverned links and direct media URLs inert", () => {
    render(
      <CmsStructuredArticle
        payload={{
          title: "Artigo seguro",
          blocks: [
            { id: "cta", type: "cta", data: { label: "Ação insegura", href: "//attacker.invalid" } },
            {
              id: "image",
              type: "image",
              data: {
                assetId: "image",
                url: "https://attacker.invalid/unmanaged.svg",
                alt: "Imagem externa",
              },
            },
            { id: "related", type: "related_content", data: {} },
          ],
        }}
        mediaUrls={{ "image:large.webp": "data:image/svg+xml,<svg><script>alert(1)</script></svg>" }}
        relatedItems={[{ title: "Relação insegura", path: "javascript:alert(1)" }]}
      />,
    );

    expect(screen.getByText("Ação insegura")).not.toHaveAttribute("href");
    expect(screen.getByText("Relação insegura")).not.toHaveAttribute("href");
    expect(screen.queryByRole("img", { name: "Imagem externa" })).not.toBeInTheDocument();
  });

  it("preserva a mídia assinada pelo backend governado no preview privado do artigo", () => {
    const supabaseOrigin = SUPABASE_URL.replace(/\/$/, "");
    render(
      <CmsStructuredArticle
        preview
        payload={{
          title: "Artigo em revisão",
          blocks: [{ id: "image", type: "image", data: { assetId: "image", alt: "Imagem revisada" } }],
        }}
        mediaUrls={{
          "image:large.webp": `${supabaseOrigin}/storage/v1/object/sign/cms-media-private/preview.webp?token=preview-signature-value`,
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "Imagem revisada" })).toBeVisible();
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
    expect(screen.getByRole("textbox", { name: /e-mail/i })).toHaveAttribute("name", "email");
    expect(screen.getByRole("textbox", { name: /e-mail/i })).toHaveAttribute("autocomplete", "email");
    expect(screen.getByRole("checkbox", { name: /aceito o tratamento/i })).toBeRequired();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeVisible();
  });

  it("blocks submission until the mandatory anti-abuse challenge is complete", () => {
    vi.stubEnv("VITE_CONTACT_CAPTCHA_ALWAYS", "true");
    const form: CmsFormVersion = {
      schemaVersion: 1,
      formId: "70000000-0000-4000-8000-000000000011",
      versionId: "70000000-0000-4000-8000-000000000012",
      version: 1,
      key: "captcha-sintetico",
      title: "Contato protegido",
      purpose: "Fixture local.",
      fields: [],
      consent: {
        required: true,
        text: "Aceito o tratamento.",
        version: "v1",
        privacyPath: "/politica-de-privacidade",
      },
      slaMinutes: 60,
      retentionDays: 30,
      successMessage: "Recebido.",
      submitLabel: "Enviar protegido",
      status: "published",
    };
    render(
      <MemoryRouter>
        <CmsLeadForm form={form} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Enviar protegido" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/antiabuso não está configurada/i);
  });

  it("keeps a governed website field separate from the anti-abuse honeypot", async () => {
    const user = userEvent.setup();
    vi.mocked(submitGovernedLead).mockResolvedValue({ reference: "LD-0123456789" });
    const form: CmsFormVersion = {
      schemaVersion: 1,
      formId: "70000000-0000-4000-8000-000000000021",
      versionId: "70000000-0000-4000-8000-000000000022",
      version: 1,
      key: "site-corporativo",
      title: "Contato corporativo",
      purpose: "Fixture local.",
      fields: [
        {
          id: "70000000-0000-4000-8000-000000000023",
          key: "website",
          label: "Site da empresa",
          type: "text",
          required: true,
          maxLength: 200,
          options: [],
          personalData: false,
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

    await user.type(screen.getByRole("textbox", { name: /site da empresa/i }), "https://cliente.example");
    await user.click(screen.getByRole("checkbox", { name: /aceito o tratamento/i }));
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(submitGovernedLead).toHaveBeenCalledOnce());
    expect(vi.mocked(submitGovernedLead).mock.calls[0]?.[0]).toMatchObject({
      fields: { website: "https://cliente.example" },
      honeypot: "",
    });
  });
});
