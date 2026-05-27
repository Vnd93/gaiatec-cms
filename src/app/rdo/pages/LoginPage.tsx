import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { motion } from "motion/react";
import { useAuth } from "../AuthContext";
import "../rdo.css";

export default function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [show, setShow] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/relatorio-de-obra" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setBusy(true);
    const { error } = await signIn(email, senha);
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

        <form onSubmit={onSubmit} className="pt-9">
          <h1 className="text-[26px] font-semibold leading-none tracking-[-0.03em] text-[var(--rdo-ink)]">
            Entrar
          </h1>
          <p className="mt-2.5 text-sm text-[var(--rdo-ink-2)]">Acesse com seu e-mail e senha.</p>

          <div className="mt-8">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--rdo-ink-3)]">
              E-mail
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@gaiatecsistemas.com.br"
              className="w-full border border-[var(--rdo-line)] bg-white px-3.5 py-3 text-sm text-[var(--rdo-ink)] outline-none transition-colors placeholder:text-[var(--rdo-ghost)] focus:border-[var(--rdo-orange)]"
            />
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--rdo-ink-3)]">
                Senha
              </label>
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
              className="w-full border border-[var(--rdo-line)] bg-white px-3.5 py-3 text-sm text-[var(--rdo-ink)] outline-none transition-colors placeholder:text-[var(--rdo-ghost)] focus:border-[var(--rdo-orange)]"
            />
          </div>

          {erro && (
            <p className="mt-5 border-l-2 border-red-500 bg-red-50 py-2 pl-3 pr-2 text-[13px] font-medium text-red-600">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-8 w-full bg-[var(--rdo-orange)] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--rdo-orange-strong)] disabled:opacity-55"
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-10 text-[12px] text-[var(--rdo-ink-3)]">Acesso restrito à equipe Gaiatec Sistemas.</p>
      </motion.div>
    </div>
  );
}
