import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { supabase } from "@/lib/supabase";
import "../rdo.css";

type Status = "checking" | "ready" | "nosession";

export default function DefinirSenhaPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [show, setShow] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    // O cliente processa o token do hash da URL (detectSessionInUrl) ao iniciar.
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setStatus("ready");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active && session) setStatus("ready");
    });
    const t = setTimeout(() => {
      if (active) setStatus((s) => (s === "checking" ? "nosession" : s));
    }, 3000);
    return () => {
      active = false;
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) return setErro("A senha deve ter ao menos 6 caracteres.");
    if (senha !== confirma) return setErro("As senhas não coincidem.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setBusy(false);
    if (error) return setErro("Não foi possível salvar. Abra o link do convite novamente.");
    setDone(true);
    setTimeout(() => navigate("/relatorio-de-obra", { replace: true }), 900);
  }

  const inputCls =
    "w-full border border-[var(--rdo-line)] bg-white px-3.5 py-3 text-sm text-[var(--rdo-ink)] outline-none transition-colors placeholder:text-[var(--rdo-ghost)] focus:border-[var(--rdo-orange)]";

  return (
    <div className="rdo-root flex min-h-[100dvh] items-center justify-center bg-[var(--rdo-surface)] px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[360px]"
      >
        <div className="mb-10">
          <img src="/logo-gaiatec.png" alt="Gaiatec Sistemas" className="h-12 w-auto" />
          <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--rdo-ink-3)]">
            Relatório Diário de Obra
          </div>
        </div>

        <div className="h-px w-full bg-[var(--rdo-line)]" />

        {status === "checking" && (
          <div className="flex justify-center pt-12">
            <span className="rdo-spin h-6 w-6 rounded-full border-2 border-[var(--rdo-line-strong)] border-t-[var(--rdo-orange)]" />
          </div>
        )}

        {status === "nosession" && (
          <div className="pt-9">
            <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--rdo-ink)]">
              Link inválido ou expirado
            </h1>
            <p className="mt-2 text-sm text-[var(--rdo-ink-2)]">
              Peça um novo convite ao administrador.
            </p>
            <button
              onClick={() => navigate("/relatorio-de-obra/login")}
              className="mt-6 w-full bg-[var(--rdo-orange-on-white)] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--rdo-orange-on-white-hover)]"
            >
              Ir para o login
            </button>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={submit} className="pt-9">
            <h1 className="text-[26px] font-semibold leading-none tracking-[-0.03em] text-[var(--rdo-ink)]">
              Definir senha
            </h1>
            <p className="mt-2.5 text-sm text-[var(--rdo-ink-2)]">Crie uma senha para acessar o app.</p>

            <div className="mt-8">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--rdo-ink-3)]">
                  Nova senha
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
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                className={inputCls}
              />
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--rdo-ink-3)]">
                Confirmar senha
              </label>
              <input
                type={show ? "text" : "password"}
                required
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                placeholder="••••••••"
                className={inputCls}
              />
            </div>

            {erro && (
              <p className="mt-5 border-l-2 border-red-500 bg-red-50 py-2 pl-3 pr-2 text-[13px] font-medium text-red-600">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || done}
              className="mt-8 w-full bg-[var(--rdo-orange-on-white)] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--rdo-orange-on-white-hover)] disabled:opacity-55"
            >
              {done ? "Pronto! Entrando…" : busy ? "Salvando…" : "Salvar e entrar"}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
