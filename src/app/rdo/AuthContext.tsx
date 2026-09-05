import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthState {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  hasRdoAccess: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  requestOtp: (email: string) => Promise<{ error: string | null }>;
  verifyOtp: (email: string, code: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<{ active: boolean; role: "rdo_admin" | "rdo_member" } | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const userId = session?.user.id;

  useEffect(() => {
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]') ?? document.head.appendChild(document.createElement("meta"));
    robots.name = "robots";
    const previous = robots.content;
    const previousTitle = document.title;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonicalHref = canonical?.getAttribute("href") ?? null;
    canonical?.remove();
    robots.content = "noindex, nofollow, noarchive";
    document.title = "Relatório Diário de Obra | GAIATEC";
    return () => {
      robots.content = previous || "index, follow";
      document.title = previousTitle;
      if (canonicalHref && !document.querySelector('link[rel="canonical"]')) {
        const restoredCanonical = document.createElement("link");
        restoredCanonical.rel = "canonical";
        restoredCanonical.href = canonicalHref;
        document.head.appendChild(restoredCanonical);
      }
    };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setAccess(null);
      setAccessLoading(false);
      return;
    }
    setAccessLoading(true);
    supabase
      .from("rdo_user_access")
      .select("active,role")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        setAccess(!error && data ? (data as { active: boolean; role: "rdo_admin" | "rdo_member" }) : null);
        setAccessLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { error: error ? traduzErro(error.message) : null };
  }

  /** Solicita OTP somente para usuário previamente convidado e ativo. */
  async function requestOtp(email: string) {
    const { error } = await supabase.functions.invoke("rdo-otp", {
      body: { email: email.trim().toLowerCase() },
    });
    if (error) {
      let msg = "Não foi possível enviar o código. Tente novamente.";
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx) {
          const j = await ctx.json();
          if (j?.error) msg = j.error;
        }
      } catch {
        /* ignore */
      }
      return { error: msg };
    }
    return { error: null };
  }

  /** Verifica o código de 6 dígitos e cria a sessão. */
  async function verifyOtp(email: string, code: string) {
    const e = email.trim().toLowerCase();
    const token = code.replace(/\D/g, "").trim();
    let res = await supabase.auth.verifyOtp({ email: e, token, type: "email" });
    if (res.error) res = await supabase.auth.verifyOtp({ email: e, token, type: "magiclink" });
    return { error: res.error ? traduzErro(res.error.message) : null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const user = session?.user ?? null;
  const hasRdoAccess = access?.active === true;
  const isAdmin = hasRdoAccess && access?.role === "rdo_admin";

  return (
    <AuthCtx.Provider value={{ session, user, isAdmin, hasRdoAccess, loading: loading || accessLoading, signIn, requestOtp, verifyOtp, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}

function traduzErro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "E-mail ainda não confirmado.";
  if (m.includes("rate limit")) return "Muitas tentativas. Aguarde um momento.";
  if (m.includes("expired") || m.includes("invalid") || m.includes("token")) return "Código inválido ou expirado.";
  return "Não foi possível entrar. Tente novamente.";
}
