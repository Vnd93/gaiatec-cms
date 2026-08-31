import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "@/lib/supabase";

export type AdminAuthStatus =
  "loading" | "signed_out" | "password_update" | "unauthorized" | "mfa_enroll" | "mfa_challenge" | "ready";

type SessionSnapshot = {
  userId: string;
  status: "invited" | "active" | "suspended";
  roles: string[];
  permissions: string[];
  mfaRequired: boolean;
  mfaVerified: boolean;
  accessGranted: boolean;
  activated: boolean;
};

type Enrollment = { factorId: string; qrCode: string; secret: string };
type Result = { error: string | null };

type AdminAuthValue = {
  session: Session | null;
  user: User | null;
  status: AdminAuthStatus;
  profile: SessionSnapshot | null;
  signIn(email: string, password: string): Promise<Result>;
  signOut(): Promise<void>;
  requestRecovery(email: string): Promise<Result>;
  updatePassword(password: string): Promise<Result>;
  beginMfaEnrollment(): Promise<{ enrollment: Enrollment | null; error: string | null }>;
  verifyMfa(code: string, factorId?: string): Promise<Result>;
};

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

function friendlyError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (normalized.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos.";
  if (normalized.includes("expired") || normalized.includes("token")) return "O link ou código expirou.";
  if (normalized.includes("factor")) return "Não foi possível validar o autenticador.";
  return "Não foi possível concluir a operação. Tente novamente.";
}

async function invokeSession(session: Session, action: "resolve" | "mfa" | "recovery" | "logout") {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/cms-session`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action }),
  });
  const body = (await response.json().catch(() => ({}))) as SessionSnapshot & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "SESSION_REJECTED");
  return body;
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AdminAuthStatus>("loading");
  const [profile, setProfile] = useState<SessionSnapshot | null>(null);
  const requestId = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  const statusRef = useRef<AdminAuthStatus>("loading");

  const updateSession = useCallback((nextSession: Session | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  const updateStatus = useCallback((nextStatus: AdminAuthStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  useEffect(() => {
    let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.append(robots);
    }
    robots.content = "noindex,nofollow,noarchive";
    document.title = "CMS GAIATEC — acesso privado";
  }, []);

  const resolveSession = useCallback(
    async (nextSession: Session, action: "resolve" | "mfa" | "recovery" = "resolve") => {
      const currentRequest = ++requestId.current;
      updateSession(nextSession);
      updateStatus("loading");
      try {
        const snapshot = await invokeSession(nextSession, action);
        if (currentRequest !== requestId.current) return;
        setProfile(snapshot);
        if (snapshot.accessGranted) {
          updateStatus("ready");
          return;
        }
        if (!snapshot.mfaRequired) {
          updateStatus("unauthorized");
          return;
        }
        const [{ data: factors }, { data: assurance }] = await Promise.all([
          supabase.auth.mfa.listFactors(),
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        ]);
        if (currentRequest !== requestId.current) return;
        const verified = factors?.totp?.some((factor) => factor.status === "verified") ?? false;
        if (assurance?.currentLevel === "aal2") {
          const refreshed = await supabase.auth.refreshSession();
          if (refreshed.data.session) {
            const verifiedSnapshot = await invokeSession(refreshed.data.session, "mfa");
            if (currentRequest !== requestId.current) return;
            updateSession(refreshed.data.session);
            setProfile(verifiedSnapshot);
            updateStatus(verifiedSnapshot.accessGranted ? "ready" : "unauthorized");
          }
          return;
        }
        updateStatus(verified ? "mfa_challenge" : "mfa_enroll");
      } catch {
        if (currentRequest !== requestId.current) return;
        setProfile(null);
        updateStatus("unauthorized");
      }
    },
    [updateSession, updateStatus],
  );

  const refreshSameUserInBackground = useCallback(
    async (nextSession: Session) => {
      const currentRequest = ++requestId.current;
      updateSession(nextSession);
      try {
        const snapshot = await invokeSession(nextSession, "resolve");
        if (currentRequest !== requestId.current) return;
        setProfile(snapshot);
        if (snapshot.accessGranted) {
          updateStatus("ready");
          return;
        }
        // A renovação silenciosa só permanece silenciosa enquanto a autorização
        // efetiva continua válida. Qualquer downgrade volta ao fluxo completo.
        await resolveSession(nextSession);
      } catch {
        if (currentRequest !== requestId.current) return;
        setProfile(null);
        updateStatus("unauthorized");
      }
    },
    [resolveSession, updateSession, updateStatus],
  );

  useEffect(() => {
    let active = true;
    const applySession = (event: string, nextSession: Session | null) => {
      if (!active) return;
      if (!nextSession) {
        requestId.current += 1;
        updateSession(null);
        setProfile(null);
        updateStatus("signed_out");
        return;
      }
      const passwordRoute = window.location.pathname === "/admin/definir-senha";
      if (event === "PASSWORD_RECOVERY" || passwordRoute) {
        updateSession(nextSession);
        updateStatus("password_update");
        return;
      }
      const sameUser = sessionRef.current?.user.id === nextSession.user.id;
      const passiveSameUserEvent = event === "TOKEN_REFRESHED" || event === "SIGNED_IN";
      if (sameUser && passiveSameUserEvent && statusRef.current === "ready") {
        void refreshSameUserInBackground(nextSession);
        return;
      }
      void resolveSession(nextSession, event === "MFA_CHALLENGE_VERIFIED" ? "mfa" : "resolve");
    };

    void supabase.auth.getSession().then(({ data }) => applySession("INITIAL_SESSION", data.session));
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      queueMicrotask(() => applySession(event, nextSession));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [refreshSameUserInBackground, resolveSession, updateSession, updateStatus]);

  const value = useMemo<AdminAuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      status,
      profile,
      async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error || !data.session) return { error: friendlyError(error?.message ?? "SESSION_MISSING") };
        await resolveSession(data.session);
        return { error: null };
      },
      async signOut() {
        if (session) await invokeSession(session, "logout").catch(() => undefined);
        await supabase.auth.signOut({ scope: "local" });
        requestId.current += 1;
        updateSession(null);
        setProfile(null);
        updateStatus("signed_out");
      },
      async requestRecovery(email) {
        const redirectTo = `${window.location.origin}/admin/definir-senha`;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo,
        });
        return { error: error ? friendlyError(error.message) : null };
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return { error: friendlyError(error.message) };
        const current = await supabase.auth.getSession();
        if (!current.data.session) return { error: "A sessão do convite expirou. Solicite um novo link." };
        await resolveSession(current.data.session, "recovery");
        return { error: null };
      },
      async beginMfaEnrollment() {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        for (const factor of factors?.all ?? []) {
          if (factor.factor_type === "totp" && factor.status === "unverified") {
            await supabase.auth.mfa.unenroll({ factorId: factor.id });
          }
        }
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "CMS GAIATEC",
        });
        if (error || !data)
          return { enrollment: null, error: friendlyError(error?.message ?? "MFA_ENROLL_FAILED") };
        return {
          enrollment: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret },
          error: null,
        };
      },
      async verifyMfa(code, factorId) {
        let selectedId = factorId;
        if (!selectedId) {
          const { data } = await supabase.auth.mfa.listFactors();
          selectedId = data?.totp?.find((factor) => factor.status === "verified")?.id;
        }
        if (!selectedId) return { error: "Autenticador não encontrado." };
        const challenge = await supabase.auth.mfa.challenge({ factorId: selectedId });
        if (challenge.error || !challenge.data)
          return { error: friendlyError(challenge.error?.message ?? "MFA_CHALLENGE_FAILED") };
        const verification = await supabase.auth.mfa.verify({
          factorId: selectedId,
          challengeId: challenge.data.id,
          code: code.replace(/\D/g, ""),
        });
        if (verification.error) return { error: "Código inválido ou expirado." };
        const refreshed = await supabase.auth.refreshSession();
        if (!refreshed.data.session) return { error: "Não foi possível atualizar a sessão segura." };
        await resolveSession(refreshed.data.session, "mfa");
        return { error: null };
      },
    }),
    [profile, resolveSession, session, status, updateSession, updateStatus],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error("useAdminAuth requer AdminAuthProvider");
  return context;
}
