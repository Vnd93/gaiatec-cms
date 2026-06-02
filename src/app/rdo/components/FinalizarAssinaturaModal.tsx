import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Checkbox from "@radix-ui/react-checkbox";
import { Check, ChevronDown, FileCheck2, Loader2, PenLine, Upload, X } from "lucide-react";
import { SignaturePad } from "./SignaturePad";
import { TERMOS_TEXTO, TERMOS_TITULO, TERMOS_VERSAO } from "../lib/terms";
import type { AssinaturaPayload } from "../lib/assinatura";

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function FinalizarAssinaturaModal({
  open,
  onClose,
  onConfirm,
  busy,
  cliente,
  contrato,
  defaultGaiatecNome,
  defaultClienteNome,
  defaultClienteEmail,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (p: AssinaturaPayload) => void;
  busy?: boolean;
  cliente: string;
  contrato: string;
  defaultGaiatecNome?: string;
  defaultClienteNome?: string;
  defaultClienteEmail?: string;
}) {
  const [gaiatecMetodo, setGaiatecMetodo] = useState<"desenho" | "importado">("desenho");
  const [gaiatecAssinatura, setGaiatecAssinatura] = useState<string | null>(null);
  const [gaiatecPdf, setGaiatecPdf] = useState<File | null>(null);
  const [gaiatecNome, setGaiatecNome] = useState("");
  const [aceite, setAceite] = useState(false);
  const [verTermos, setVerTermos] = useState(false);
  const [presente, setPresente] = useState<boolean | null>(null);
  const [clienteAssinatura, setClienteAssinatura] = useState<string | null>(null);
  const [clienteNome, setClienteNome] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [erro, setErro] = useState("");

  // Reseta ao abrir
  useEffect(() => {
    if (open) {
      setGaiatecMetodo("desenho");
      setGaiatecAssinatura(null);
      setGaiatecPdf(null);
      setGaiatecNome(defaultGaiatecNome || "");
      setAceite(false);
      setVerTermos(false);
      setPresente(null);
      setClienteAssinatura(null);
      setClienteNome(defaultClienteNome || "");
      setClienteEmail(defaultClienteEmail || "");
      setErro("");
    }
  }, [open, defaultGaiatecNome, defaultClienteNome, defaultClienteEmail]);

  function confirmar() {
    setErro("");
    if (!gaiatecNome.trim()) return setErro("Informe o nome do responsável Gaiatec.");
    if (gaiatecMetodo === "desenho" && !gaiatecAssinatura) return setErro("A assinatura do responsável Gaiatec é obrigatória.");
    if (gaiatecMetodo === "importado" && !gaiatecPdf) return setErro("Envie o PDF assinado da Gaiatec.");
    if (!aceite) return setErro("É necessário aceitar os termos e condições.");
    if (presente === null) return setErro("Informe se o cliente vai assinar agora.");

    const gaiatecPart = {
      gaiatecMetodo,
      gaiatecNome: gaiatecNome.trim(),
      gaiatecAssinatura: gaiatecMetodo === "desenho" ? gaiatecAssinatura : null,
      gaiatecPdf: gaiatecMetodo === "importado" ? gaiatecPdf : null,
    };

    if (presente) {
      if (!clienteAssinatura) return setErro("A assinatura do cliente é obrigatória.");
      if (!clienteNome.trim()) return setErro("Informe o nome de quem assina pelo cliente.");
      onConfirm({ ...gaiatecPart, modo: "presencial", clienteAssinatura, clienteNome: clienteNome.trim() });
    } else {
      if (!isEmail(clienteEmail)) return setErro("Informe um e-mail válido para enviar o link ao cliente.");
      onConfirm({ ...gaiatecPart, modo: "remoto", clienteEmail: clienteEmail.trim().toLowerCase() });
    }
  }

  const inputCls =
    "w-full rounded-md border border-[var(--rdo-line)] bg-white px-3 py-2 text-[13px] text-[var(--rdo-ink)] outline-none transition-colors placeholder:text-[var(--rdo-ghost)] focus:border-[var(--rdo-blue)] focus:ring-2 focus:ring-[var(--rdo-blue-soft)]";
  const labelCls = "mb-1.5 block text-[12px] font-medium text-[var(--rdo-ink-2)]";

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/45" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] flex max-h-[92dvh] w-[94vw] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--rdo-line)] bg-white shadow-[var(--rdo-shadow)] outline-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--rdo-line)] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <PenLine size={17} className="text-[var(--rdo-blue)]" />
            <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--rdo-ink)]">
              Finalizar e assinar
            </Dialog.Title>
          </div>
          <Dialog.Close asChild>
            <button
              aria-label="Fechar"
              disabled={busy}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--rdo-ink-3)] transition-colors hover:bg-[var(--rdo-bg-2)] disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </Dialog.Close>
        </div>

        {/* Body */}
        <div className="rdo-scroll flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <p className="text-[12.5px] text-[var(--rdo-ink-3)]">
            <span className="font-semibold text-[var(--rdo-ink-2)]">{cliente || "Sem cliente"}</span>
            {contrato ? ` · ${contrato}` : ""}
          </p>

          {/* Assinatura Gaiatec */}
          <div>
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--rdo-ink-3)]">
              Responsável Gaiatec Sistemas
            </span>
            <label className={labelCls}>Nome de quem assina</label>
            <input
              className={inputCls}
              value={gaiatecNome}
              onChange={(e) => setGaiatecNome(e.target.value)}
              placeholder="Nome do responsável"
            />

            {/* Método da Gaiatec */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { v: "desenho" as const, icon: <PenLine size={15} />, label: "Assinar aqui" },
                { v: "importado" as const, icon: <Upload size={15} />, label: "Enviar PDF assinado" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => {
                    setGaiatecMetodo(o.v);
                    setErro("");
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[12.5px] font-medium transition-colors ${
                    gaiatecMetodo === o.v
                      ? "border-[var(--rdo-blue)] bg-[var(--rdo-blue-soft)] text-[var(--rdo-blue)]"
                      : "border-[var(--rdo-line)] bg-white text-[var(--rdo-ink-2)] hover:border-[var(--rdo-ink-3)]"
                  }`}
                >
                  {o.icon}
                  {o.label}
                </button>
              ))}
            </div>

            {gaiatecMetodo === "desenho" ? (
              <div className="mt-3">
                <SignaturePad onChange={setGaiatecAssinatura} disabled={busy} />
              </div>
            ) : (
              <div className="mt-3">
                <label className="block cursor-pointer">
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      setGaiatecPdf(e.target.files?.[0] ?? null);
                      setErro("");
                    }}
                  />
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[var(--rdo-line-strong)] bg-[var(--rdo-bg-2)] px-3 py-2.5 text-[12.5px] font-medium text-[var(--rdo-ink-2)] transition-colors hover:border-[var(--rdo-blue)]">
                    {gaiatecPdf ? <FileCheck2 size={14} className="text-[#1a7f43]" /> : <Upload size={14} />}
                    {gaiatecPdf ? gaiatecPdf.name : "Escolher PDF assinado"}
                  </span>
                </label>
                <p className="mt-1.5 text-[11.5px] text-[var(--rdo-ghost)]">
                  Envie o PDF que você assinou no gov.br, certificado digital ou outro assinador.
                </p>
              </div>
            )}
          </div>

          {/* Termos */}
          <div className="rounded-md border border-[var(--rdo-line)] bg-[var(--rdo-bg-2)] p-3">
            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox.Root
                checked={aceite}
                onCheckedChange={(c) => setAceite(c === true)}
                className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-[var(--rdo-line-strong)] bg-white data-[state=checked]:border-[var(--rdo-blue)] data-[state=checked]:bg-[var(--rdo-blue)]"
              >
                <Checkbox.Indicator>
                  <Check size={13} strokeWidth={3} className="text-white" />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <span className="text-[12.5px] leading-snug text-[var(--rdo-ink-2)]">
                Li e aceito os <strong>termos e condições</strong> de assinatura eletrônica.
              </span>
            </label>
            <button
              type="button"
              onClick={() => setVerTermos((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 pl-7 text-[12px] font-medium text-[var(--rdo-blue)] transition-colors hover:text-[var(--rdo-blue-strong)]"
            >
              <ChevronDown size={13} className={`transition-transform ${verTermos ? "rotate-180" : ""}`} />
              {verTermos ? "Ocultar termos" : "Ler os termos"}
            </button>
            {verTermos && (
              <div className="rdo-scroll mt-2 max-h-44 overflow-y-auto rounded-md border border-[var(--rdo-line)] bg-white p-3">
                <p className="mb-1.5 text-[11px] font-semibold text-[var(--rdo-ink-2)]">
                  {TERMOS_TITULO} <span className="font-normal text-[var(--rdo-ghost)]">({TERMOS_VERSAO})</span>
                </p>
                <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-[var(--rdo-ink-3)]">{TERMOS_TEXTO}</p>
              </div>
            )}
          </div>

          {/* Cliente presente? */}
          <div>
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--rdo-ink-3)]">
              O cliente está presente e vai assinar agora?
            </span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: true, label: "Sim, assina agora" },
                { v: false, label: "Não, enviar por e-mail" },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  onClick={() => setPresente(o.v)}
                  className={`rounded-md border px-3 py-2 text-[13px] font-medium transition-colors ${
                    presente === o.v
                      ? "border-[var(--rdo-blue)] bg-[var(--rdo-blue-soft)] text-[var(--rdo-blue)]"
                      : "border-[var(--rdo-line)] bg-white text-[var(--rdo-ink-2)] hover:border-[var(--rdo-ink-3)]"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {presente === true && (
              <div className="mt-3">
                <label className={labelCls}>Nome de quem assina pelo cliente</label>
                <input
                  className={inputCls}
                  value={clienteNome}
                  onChange={(e) => setClienteNome(e.target.value)}
                  placeholder="Nome do responsável do cliente"
                />
                <div className="mt-3">
                  <SignaturePad onChange={setClienteAssinatura} disabled={busy} />
                </div>
              </div>
            )}

            {presente === false && (
              <div className="mt-3">
                <label className={labelCls}>E-mail do cliente</label>
                <input
                  type="email"
                  inputMode="email"
                  className={inputCls}
                  value={clienteEmail}
                  onChange={(e) => setClienteEmail(e.target.value)}
                  placeholder="cliente@empresa.com.br"
                />
                <p className="mt-1.5 text-[11.5px] text-[var(--rdo-ghost)]">
                  Enviaremos um link seguro para o cliente assinar o relatório remotamente.
                </p>
              </div>
            )}
          </div>

          {erro && <p className="text-[12.5px] font-medium text-[#d4453e]">{erro}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--rdo-line)] px-5 py-3.5">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-[var(--rdo-line)] bg-white px-4 py-2 text-[13px] font-medium text-[var(--rdo-ink)] transition-colors hover:border-[var(--rdo-ink-3)] disabled:opacity-55"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--rdo-blue)] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--rdo-blue-strong)] disabled:opacity-55"
          >
            {busy ? <Loader2 size={15} className="rdo-spin" /> : <Check size={15} />}
            Finalizar e assinar
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
