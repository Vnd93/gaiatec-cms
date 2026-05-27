import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { inviteUser } from "../lib/invite";

/** Botão + diálogo de convite. Renderizar apenas para admin. */
export function InviteDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      const sent = await inviteUser(email);
      toast.success(`Convite enviado para ${sent}.`);
      setEmail("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar o convite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13.5px] font-medium text-[var(--rdo-blue)] transition-colors hover:bg-[var(--rdo-blue-soft)]">
          <UserPlus size={18} strokeWidth={1.8} />
          Convidar acesso
        </button>
      </Dialog.Trigger>

      <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--rdo-line)] bg-white p-6 shadow-[var(--rdo-shadow)] outline-none">
        <Dialog.Title className="text-lg font-semibold tracking-[-0.02em] text-[var(--rdo-ink)]">
          Convidar acesso
        </Dialog.Title>
        <Dialog.Description className="mt-1.5 text-sm text-[var(--rdo-ink-2)]">
          A pessoa recebe um e-mail para criar a senha e acessar o sistema.
        </Dialog.Description>

        <form onSubmit={submit} className="mt-5">
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--rdo-ink-3)]">
            E-mail
          </label>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@gaiatecsistemas.com.br"
            className="w-full rounded-md border border-[var(--rdo-line)] bg-white px-3 py-2 text-sm text-[var(--rdo-ink)] outline-none transition-colors placeholder:text-[var(--rdo-ghost)] focus:border-[var(--rdo-blue)] focus:ring-2 focus:ring-[var(--rdo-blue-soft)]"
          />
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md px-4 py-2 text-[13px] font-medium text-[var(--rdo-ink-3)] transition-colors hover:text-[var(--rdo-ink)]"
              >
                Cancelar
              </button>
            </Dialog.Close>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[var(--rdo-blue)] px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--rdo-blue-strong)] disabled:opacity-55"
            >
              {busy ? "Enviando…" : "Enviar convite"}
            </button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
