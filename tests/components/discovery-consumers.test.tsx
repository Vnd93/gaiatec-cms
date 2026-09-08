import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiscoveryEntityRenderer } from "../../src/public/components/DiscoveryEntityRenderer";
import {
  applicationPayload,
  industryPayload,
  servicePayload,
  solutionPayload,
} from "../fixtures/discovery-payloads";
const row = (content_type: any, payload: any) => ({
  key: `/sintetico-${content_type}`,
  kind: content_type,
  slug: "sintetico",
  path: "/sintetico",
  payload,
  seo: payload.seo,
  publishedAt: "2026-08-29T12:00:00.000Z",
});
describe("F5 field to consumer coverage", () => {
  it("renders every service commercial field", () => {
    const { container } = render(<DiscoveryEntityRenderer entity={row("service", servicePayload) as any} />);
    expect(screen.getByText("Escopo visível")).toBeInTheDocument();
    expect(screen.getByText("Entregável visível")).toBeInTheDocument();
    expect(screen.getByText("Etapa visível")).toBeInTheDocument();
    expect(container.querySelector("main")).not.toBeInTheDocument();
    expect(screen.getByText(/Serviço · visão geral/)).toBeVisible();
    expect(screen.queryByText(/aguardando owner/i)).not.toBeInTheDocument();
  });
  it("renders industry challenges and evidence", () => {
    render(<DiscoveryEntityRenderer entity={row("industry", industryPayload) as any} />);
    expect(screen.getByText("Desafio visível")).toBeInTheDocument();
    expect(screen.getByText("Evidência visível")).toBeInTheDocument();
  });
  it("renders application points without silent loss", () => {
    render(<DiscoveryEntityRenderer entity={row("application", applicationPayload) as any} />);
    for (const text of [
      "Ponto visível",
      "Necessidade visível",
      "Variável visível",
      "Função visível",
      "Benefício técnico visível",
      "Benefício operacional visível",
    ])
      expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
  });
  it("renders solution approach and components", () => {
    render(<DiscoveryEntityRenderer entity={row("solution", solutionPayload) as any} />);
    expect(screen.getByText("Abordagem sintética visível")).toBeInTheDocument();
    expect(screen.getByText("Componente visível")).toBeInTheDocument();
  });
  it("falls back to the contact route when a CTA path is not governed", () => {
    const payload = { ...servicePayload, cta: { label: "Falar conosco", href: "//attacker.invalid" } };
    render(<DiscoveryEntityRenderer entity={row("service", payload) as any} />);
    expect(screen.getByRole("link", { name: "Falar conosco" })).toHaveAttribute("href", "/contato");
  });
});
