import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { DraftBackupNotice } from "@/admin/components/DraftBackupNotice";
import { draftBackupKey, useDraftBackup } from "@/admin/hooks/useDraftBackup";

function Harness({ ttlMs }: { ttlMs?: number }) {
  const [value, setValue] = useState({ title: "Servidor" });
  const [saved, setSaved] = useState(value);
  const backup = useDraftBackup({
    userId: "user-a",
    editorType: "product",
    itemKey: "item-a",
    value,
    dirty: JSON.stringify(value) !== JSON.stringify(saved),
    onRestore: setValue,
    ttlMs,
  });
  return (
    <>
      <label>
        Título
        <input value={value.title} onChange={(event) => setValue({ title: event.target.value })} />
      </label>
      <DraftBackupNotice backup={backup} />
      <button
        onClick={() => {
          setSaved(value);
          backup.clear();
        }}
      >
        Salvar
      </button>
    </>
  );
}

describe("cópia recuperável de rascunho", () => {
  it("usa namespace por usuário/editor/item, restaura conscientemente e limpa após salvar", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness />);
    await user.clear(screen.getByRole("textbox", { name: "Título" }));
    await user.type(screen.getByRole("textbox", { name: "Título" }), "Cópia local");
    await vi.advanceTimersByTimeAsync(600);
    const key = draftBackupKey("user-a", "product", "item-a");
    expect(localStorage.getItem(key)).toContain("Cópia local");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(localStorage.getItem(key)).toBeNull();
    vi.useRealTimers();
  });

  it("oferece restauração explícita e elimina cópia expirada", async () => {
    const key = draftBackupKey("user-a", "product", "item-a");
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        environment: "local",
        userId: "user-a",
        editorType: "product",
        itemKey: "item-a",
        savedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        value: { title: "Recuperado" },
      }),
    );
    const user = userEvent.setup();
    const view = render(<Harness />);
    await user.click(await screen.findByRole("button", { name: "Restaurar alterações" }));
    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue("Recuperado");
    view.unmount();
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        environment: "local",
        userId: "user-a",
        editorType: "product",
        itemKey: "item-a",
        savedAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        value: { title: "Expirado" },
      }),
    );
    render(<Harness />);
    expect(screen.queryByRole("button", { name: "Restaurar alterações" })).not.toBeInTheDocument();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("rejeita metadados locais que não pertencem ao namespace atual", () => {
    const key = draftBackupKey("user-a", "product", "item-a");
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        environment: "local",
        userId: "different-user",
        editorType: "product",
        itemKey: "item-a",
        savedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        value: { title: "Não restaurar" },
      }),
    );
    render(<Harness />);
    expect(screen.queryByRole("button", { name: "Restaurar alterações" })).not.toBeInTheDocument();
    expect(localStorage.getItem(key)).toBeNull();
  });
});
