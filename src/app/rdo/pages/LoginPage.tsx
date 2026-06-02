import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { motion } from "motion/react";
import { useAuth } from "../AuthContext";
import "../rdo.css";

type Modo = "senha" | "codigo";
type OtpStep = "pedir" | "inserir";

const inputCls =
  "w-full border border-[var(--rdo-line)] bg-white px-3.5 py-3 text-sm text-[var(--rdo-ink)] outline-none transition-colors placeholder:text-[var(--rdo-ghost)] focus:border-[var(--rdo-orange)]";
const labelCls = "mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--rdo-ink-3)]";

export default function LoginPage() {
  const { session, loading, signIn, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();

  const [modo, setModo] = useState<Modo>("senha");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [show, setShow] = useState(false);

  const [otpStep, setOtpStep] = useState<OtpStep>("pedir");
  const [codigo, setCodigo] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  if (!loading && session) return <Navigate to="/relatorio-de-obra" replace />;

  function trocarModo(m: Modo) {
    setModo(m);
    setErro(null);
    setInfo(null);
  }

  async function onSubmitSenha(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setBusy(true);
    const { error } = await signIn(email, senha);
    setBusy(false);
    if (error) setErro(error);
    else navigate("/relatorio-de-obra", { replace: true });
  }

  async function enviarCodigo(e?: React.FormEvent) {
    e?.preventDefault();
    setErro(null);
    setInfo(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErro("Informe um e-mail válido.");
      return;
    }
    setBusy(true);
    const { error } = await requestOtp(email);
    setBusy(false);
    if (error) {
      setErro(error);
      return;
    }
    setOtpStep("inserir");
    setCodigo("");
    setCooldown(45);
    setInfo(`Código enviado para ${email.trim().toLowerCase()}.`);
  }

  async function confirmarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (codigo.replace(/\D/g, "").length < 6) {
      setErro("Digite o código de 6 dígitos.");
      return;
    }
    setBusy(true);
    const { error } = await verifyOtp(email, codigo);
    setBusy(false);
    if (error) setErro(error);
    else navigate("/relatorio-de-obra", { replace: true });
  }

  return (
    <div className="rdo-root flex min-h-[100dvh] items-center justify-center bg-[var(--rdo-surface)] px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[360px]"
      >
        {/* Marca */}
        <div className="mb-10">
          <img src="/logo-gaiatec.png" alt="Gaiatec Sistemas" className="h-12 w-auto" />
          <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--rdo-ink-3)]">
            Relatório Diário de Obra
          </div>
        </div>

        <div className="h-px w-full bg-[var(--rdo-line)]" />

        <div className="pt-9">
          <h1 className="text-[26px] font-semibold leading-none tracking-[-0.03em] text-[var(--rdo-ink)]">Entrar</h1>

          {/* Alternador de método */}
          <div className="mt-6 inline-flex w-full rounded-md border border-[var(--rdo-line)] bg-white p-0.5">
            {[
              { v: "senha" as Modo, label: "Senha" },
              { v: "codigo" as Modo, label: "Código por e-mail" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => trocarModo(o.v)}
                className={`flex-1 rounded-[5px] px-3 py-2 text-[12.5px] font-medium transition-colors ${
                  modo === o.v
                    ? "bg-[var(--rdo-blue-soft)] text-[var(--rdo-blue)]"
                    : "text-[var(--rdo-ink-3)] hover:text-[var(--rdo-ink)]"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* ── Senha ── */}
          {modo === "senha" && (
            <form onSubmit={onSubmitSenha} className="mt-6">
              <div>
                <label className={labelCls}>E-mail</label>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com.br"
                  className={inputCls}
                />
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <label className={labelCls + " mb-0"}>Senha</label>
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--rdo-ink-3)] transition-colors hover:text-[var(--rdo-ink)]"
                  >
                    {show ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                <input
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  className={inputCls}
                />
              </div>
              {erro && <Erro>{erro}</Erro>}
              <button
                type="submit"
                disabled={busy}
                className="mt-8 w-full bg-[var(--rdo-orange)] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--rdo-orange-strong)] disabled:opacity-55"
              >
                {busy ? "Entrando…" : "Entrar"}
              </button>
            </form>
          )}

          {/* ── Código por e-mail ── */}
          {modo === "codigo" && otpStep === "pedir" && (
            <form onSubmit={enviarCodigo} className="mt-6">
              <p className="mb-5 text-sm text-[var(--rdo-ink-2)]">
                Digite seu e-mail e enviaremos um código de 6 dígitos para acessar.
              </p>
              <label className={labelCls}>E-mail</label>
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com.br"
                className={inputCls}
              />
              {erro && <Erro>{erro}</Erro>}
              <button
                type="submit"
                disabled={busy}
                className="mt-8 w-full bg-[var(--rdo-orange)] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--rdo-orange-strong)] disabled:opacity-55"
              >
                {busy ? "Enviando…" : "Enviar código"}
              </button>
            </form>
          )}

          {modo === "codigo" && otpStep === "inserir" && (
            <form onSubmit={confirmarCodigo} className="mt-6">
              {info && (
                <p className="mb-5 border-l-2 border-[var(--rdo-blue)] bg-[var(--rdo-blue-soft)] py-2 pl-3 pr-2 text-[13px] font-medium text-[var(--rdo-blue)]">
                  {info}
                </p>
              )}
              <label className={labelCls}>Código de 6 dígitos</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className={`${inputCls} text-center text-[22px] font-semibold tracking-[0.5em]`}
              />
              {erro && <Erro>{erro}</Erro>}
              <button
                type="submit"
                disabled={busy || codigo.length < 6}
                className="mt-8 w-full bg-[var(--rdo-orange)] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--rdo-orange-strong)] disabled:opacity-55"
              >
                {busy ? "Entrando…" : "Entrar"}
              </button>
              <div className="mt-4 flex items-center justify-between text-[12px]">
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep("pedir");
                    setErro(null);
                    setInfo(null);
                  }}
                  className="font-medium text-[var(--rdo-ink-3)] transition-colors hover:text-[var(--rdo-ink)]"
                >
                  ← Trocar e-mail
                </button>
                <button
                  type="button"
                  disabled={cooldown > 0 || busy}
                  onClick={() => enviarCodigo()}
                  className="font-medium text-[var(--rdo-blue)] transition-colors hover:text-[var(--rdo-blue-strong)] disabled:text-[var(--rdo-ghost)]"
                >
                  {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-10 text-[12px] leading-relaxed text-[var(--rdo-ink-3)]">
          Qualquer pessoa pode acessar com o e-mail. Você vê apenas os seus relatórios.
        </p>
      </motion.div>
    </div>
  );
}

function Erro({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 border-l-2 border-red-500 bg-red-50 py-2 pl-3 pr-2 text-[13px] font-medium text-red-600">
      {children}
    </p>
  );
}
