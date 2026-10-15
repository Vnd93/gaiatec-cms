import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it } from "vitest";
import { PageLoader } from "@/app/components/PageLoader";

describe("route loading accessibility (component test, not staging UAT)", () => {
  it("announces pending code without inventing a loaded heading", () => {
    function PendingRoute(): never {
      throw new Promise(() => {});
    }
    const { container } = render(
      <Suspense fallback={<PageLoader />}>
        <PendingRoute />
      </Suspense>,
    );
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Carregando conteúdo…");
    expect(screen.getByRole("status")).toHaveAttribute("data-route-loading", "true");
    expect(container.querySelector(".animate-spin")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
});
