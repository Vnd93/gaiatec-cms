import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntityPicker } from "@/admin/components/EntityPicker";

describe("entity picker base", () => {
  it("offers a named combobox and returns the selected governed entity", async () => {
    const onChange = vi.fn();
    render(
      <EntityPicker
        label="Categoria de produto"
        value=""
        options={[{ id: "category-1", label: "Detector de gás", secondaryLabel: "detector-gas" }]}
        onChange={onChange}
      />,
    );
    const picker = screen.getByRole("combobox", { name: "Categoria de produto" });
    expect(picker).toHaveAttribute("aria-controls");
    fireEvent.change(picker, { target: { value: "Detector de gás" } });
    expect(onChange).toHaveBeenLastCalledWith(
      { id: "category-1", label: "Detector de gás", secondaryLabel: "detector-gas" },
      "Detector de gás",
    );
  });

  it("explains an unavailable empty state", () => {
    render(<EntityPicker label="Fabricante" value="" options={[]} onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Fabricante" })).toBeDisabled();
    expect(screen.getByText("Lista indisponível")).toBeInTheDocument();
  });
});
