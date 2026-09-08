import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProgressiveDraftStatus } from "@/admin/components/ProgressiveDraftStatus";
import type { ProgressiveDraftAutosaveState } from "@/admin/hooks/useProgressiveDraftAutosave";

function state(
  overrides: Partial<ProgressiveDraftAutosaveState<{ title: string }>> = {},
): ProgressiveDraftAutosaveState<{ title: string }> {
  return {
    active: true,
    status: "saved",
    fallbackReason: null,
    draftId: crypto.randomUUID(),
    lockVersion: 2,
    lastSavedAt: "2026-09-02T12:00:00.000Z",
    correlationId: crypto.randomUUID(),
    currentVersion: null,
    diffRef: null,
    recoverable: null,
    restoreServerVersion: vi.fn(),
    keepLocalVersion: vi.fn(),
    retry: vi.fn(),
    flush: vi.fn(async () => true),
    promote: vi.fn(async () => crypto.randomUUID()),
    ...overrides,
  };
}

describe("progressive draft status", () => {
  it("announces saved and conflict states without relying on color", () => {
    const view = render(<ProgressiveDraftStatus draft={state()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Rascunho salvo no servidor");
    view.rerender(<ProgressiveDraftStatus draft={state({ status: "conflict", currentVersion: 7 })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("versão 7");
    expect(screen.getByRole("alert")).toHaveTextContent("Nenhuma alteração foi sobrescrita");
  });

  it("requires an explicit recovery choice", async () => {
    const restore = vi.fn();
    const keep = vi.fn();
    const user = userEvent.setup();
    render(
      <ProgressiveDraftStatus
        draft={state({
          status: "recovery_available",
          restoreServerVersion: restore,
          keepLocalVersion: keep,
          recoverable: {
            draftId: crypto.randomUUID(),
            value: { title: "Servidor" },
            savedAt: "2026-09-02T12:00:00.000Z",
            lockVersion: 4,
          },
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Restaurar versão do servidor" }));
    expect(restore).toHaveBeenCalledOnce();
    expect(keep).not.toHaveBeenCalled();
  });

  it("warns when the candidate falls back to the legacy editor", () => {
    render(
      <ProgressiveDraftStatus
        draft={state({
          active: false,
          status: "disabled",
          fallbackReason: "capability_unavailable",
        })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("não está ativa ou expirou");
    expect(screen.getByRole("alert")).toHaveTextContent("editor legado está ativo");
  });

  it("stays silent when the candidate build is intentionally disabled", () => {
    const { container } = render(
      <ProgressiveDraftStatus draft={state({ active: false, status: "disabled", fallbackReason: null })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
