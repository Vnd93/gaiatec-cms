import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditorialArchiveAction } from "@/admin/components/EditorialArchiveAction";

describe("ação editorial de arquivamento", () => {
  it("confirma a retirada de um conteúdo publicado antes de executar", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <EditorialArchiveAction
        state="published"
        entityLabel="conteúdo"
        allowed
        busy={false}
        onArchive={onArchive}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Despublicar e arquivar conteúdo" }));

    expect(confirmation).toHaveBeenCalledWith(
      expect.stringContaining("sairá do site público e continuará preservado no histórico e na auditoria"),
    );
    expect(onArchive).toHaveBeenCalledOnce();
  });

  it("mantém a operação cancelável e distingue o arquivamento sem publicação", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <EditorialArchiveAction
        state="in_review"
        entityLabel="produto"
        allowed
        busy={false}
        onArchive={onArchive}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Arquivar produto" }));
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("usa o artigo correto na confirmação de entidades femininas", async () => {
    const user = userEvent.setup();
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <EditorialArchiveAction
        state="published"
        entityLabel="campanha"
        article="A"
        allowed
        busy={false}
        onArchive={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Despublicar e arquivar campanha" }));
    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining("A campanha sairá do site público"));
  });

  it("não expõe a ação sem permissão crítica ou fora do workflow arquivável", () => {
    const { rerender } = render(
      <EditorialArchiveAction
        state="published"
        entityLabel="produto"
        allowed={false}
        busy={false}
        onArchive={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(
      <EditorialArchiveAction
        state="archived"
        entityLabel="produto"
        allowed
        busy={false}
        onArchive={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
