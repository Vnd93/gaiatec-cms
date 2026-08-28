import { render, waitFor } from "@testing-library/react";
import { SEO } from "../../src/app/components/SEO";

describe("SEO component", () => {
  it("writes canonical metadata and noindex for a private route", async () => {
    render(<SEO title="Preview" description="Ambiente isolado" path="/preview/demo" noindex />);

    await waitFor(() => expect(document.title).toBe("Preview — Gaiatec Sistemas"));
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://gaiatecsistemas.com.br/preview/demo",
    );
  });
});
