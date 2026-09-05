import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiagonalLine } from "@/app/components/DiagonalLine";
import UniqueLoading from "@/app/components/ui/grid-loading";

describe("final quality hardening", () => {
  it("renders the requested diagonal transition instead of an empty spacer", () => {
    const { container } = render(<DiagonalLine topColor="white" bottomColor="black" />);
    const divider = container.firstElementChild as HTMLElement | null;

    expect(divider).toHaveAttribute("aria-hidden", "true");
    const background = divider?.style.background ?? "";
    expect(background).toContain("linear-gradient(");
    expect(background).toContain("white 0 49.5%");
    expect(background).toContain("black 50.5% 100%");
  });

  it("announces the loading state without exposing duplicate visible copy", () => {
    render(<UniqueLoading text="Carregando conteúdo" />);

    const status = screen.getByRole("status");
    expect(status).toContainElement(screen.getByText("Carregando conteúdo"));
    expect(screen.getByText("Carregando conteúdo")).toHaveClass("sr-only");
  });
});
