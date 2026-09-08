import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "@/lib/supabase";
import type { Ev2CapabilityManifest } from "@/shared/contracts/ev2-foundation";

export type AdminAuthStatus =
  | "loading"
  | "signed_out"
  | "password_update"
  | "unauthorized"
  | "temporarily_unavailable"
  | "mfa_enroll"
  | "mfa_challenge"
  | "ready";

export type SessionSnapshot = {
  userId: string;
  status: "invited" | "active" | "suspended";
  roles: string[];
  permissions: string[];
  mfaRequired: boolean;
  mfaVerified: boolean;
  accessGranted: boolean;
  activated: boolean;
  ev2Capabilities?: Ev2CapabilityManifest;
  rbacScoped?: boolean;
  scope?: {
    siteKey: "main";
    environment: "local" | "staging" | "production";
    effectiveUntil: string | null;
  };
};

type Enrollment = { factorId: string; qrCode: string; secret: string };
type Result = { error: string | null };

type AdminAuthValue = {
  session: Session | null;
  user: User | null;
  status: AdminAuthStatus;
  profile: SessionSnapshot | null;
  retryAccess(): Promise<void>;
  signIn(email: string, password: string): Promise<Result>;
  signOut(): Promise<void>;
  requestRecovery(email: string): Promise<Result>;
  updatePassword(password: string): Promise<Result>;
  beginMfaEnrollment(): Promise<{ enrollment: Enrollment | null; error: string | null }>;
  verifyMfa(code: string, factorId?: string): Promise<Result>;
};

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

class SessionInvocationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SessionInvocationError";
  }
}

function isTransientSessionError(error: unknown): boolean {
  return !(error instanceof SessionInvocationError) || error.status === 429 || error.status >= 500;
}

function friendlyError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (normalized.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos.";
  if (normalized.includes("expired") || normalized.includes("token")) return "O link ou código expirou.";
  if (normalized.includes("factor")) return "Não foi possível validar o autenticador.";
  return "Não foi possível concluir a operação. Tente novamente.";
}

function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  const roles = snapshot.roles;
  const permissions = snapshot.permissions;
  if (
    typeof snapshot.userId !== "string" ||
    !["invited", "active", "suspended"].includes(String(snapshot.status)) ||
    !Array.isArray(roles) ||
    roles.some((role) => typeof role !== "string") ||
    !Array.isArray(permissions) ||
    permissions.some((permission) => typeof permission !== "string") ||
    typeof snapshot.mfaRequired !== "boolean" ||
    typeof snapshot.mfaVerified !== "boolean" ||
    typeof snapshot.accessGranted !== "boolean" ||
    typeof snapshot.activated !== "boolean"
  )
    return false;
  if (
    snapshot.accessGranted &&
    (snapshot.status !== "active" || roles.length === 0 || (snapshot.mfaRequired && !snapshot.mfaVerified))
  )
    return false;
  return true;
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
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    const remoteError =
      body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : "SESSION_REJECTED";
    throw new SessionInvocationError(remoteError, response.status);
  }
  if (!isSessionSnapshot(body) || body.userId !== session.user.id)
    throw new SessionInvocationError("SESSION_RESPONSE_INVALID", 503);
  return body;
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AdminAuthStatus>("loading");
  const [profile, setProfile] = useState<SessionSnapshot | null>(null);
  const requestId = useRef(0);
  const capabilityRefreshInFlight = useRef(false);
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
        const [factorResult, assuranceResult] = await Promise.all([
          supabase.auth.mfa.listFactors(),
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        ]);
        if (currentRequest !== requestId.current) return;
        if (
          factorResult.error ||
          assuranceResult.error ||
          !assuranceResult.data ||
          !["aal1", "aal2"].includes(String(assuranceResult.data.currentLevel))
        )
          throw new SessionInvocationError("MFA_STATE_UNAVAILABLE", 503);
        const factors = factorResult.data;
        const assurance = assuranceResult.data;
        const verified = factors?.totp?.some((factor) => factor.status === "verified") ?? false;
        if (assurance?.currentLevel === "aal2") {
          const refreshed = await supabase.auth.refreshSession();
          if (refreshed.error || !refreshed.data.session)
            throw new SessionInvocationError("MFA_SESSION_REFRESH_FAILED", 503);
          const verifiedSnapshot = await invokeSession(refreshed.data.session, "mfa");
          if (currentRequest !== requestId.current) return;
          updateSession(refreshed.data.session);
          setProfile(verifiedSnapshot);
          updateStatus(verifiedSnapshot.accessGranted ? "ready" : "unauthorized");
          return;
        }
        updateStatus(verified ? "mfa_challenge" : "mfa_enroll");
      } catch (error) {
        if (currentRequest !== requestId.current) return;
        setProfile(null);
        updateStatus(isTransientSessionError(error) ? "temporarily_unavailable" : "unauthorized");
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
      } catch (error) {
        if (currentRequest !== requestId.current) return;
        if (statusRef.current === "ready" && isTransientSessionError(error)) {
          setProfile((current) => (current ? { ...current, ev2Capabilities: undefined } : current));
          return;
        }
        setProfile(null);
        updateStatus(isTransientSessionError(error) ? "temporarily_unavailable" : "unauthorized");
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

  useEffect(() => {
    if (status !== "ready") return;
    const refreshCapabilities = () => {
      const current = sessionRef.current;
      if (!current || capabilityRefreshInFlight.current) return;
      capabilityRefreshInFlight.current = true;
      void refreshSameUserInBackground(current).finally(() => {
        capabilityRefreshInFlight.current = false;
      });
    };
    const interval = window.setInterval(refreshCapabilities, 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshCapabilities();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshSameUserInBackground, status]);

  const value = useMemo<AdminAuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      status,
      profile,
      async retryAccess() {
        const current = sessionRef.current;
        if (!current) {
          updateStatus("signed_out");
          return;
        }
        await resolveSession(current);
      },
      async signIn(email, password) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password,
          });
          if (error || !data.session) return { error: friendlyError(error?.message ?? "SESSION_MISSING") };
          await resolveSession(data.session);
          return { error: null };
        } catch {
          return { error: "Não foi possível concluir a operação. Tente novamente." };
        }
      },
      async signOut() {
        const current = sessionRef.current;
        if (current) await invokeSession(current, "logout").catch(() => undefined);
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          // O estado local do CMS ainda deve ser encerrado mesmo se o SDK falhar.
        } finally {
          requestId.current += 1;
          updateSession(null);
          setProfile(null);
          updateStatus("signed_out");
        }
      },
      async requestRecovery(email) {
        try {
          const response = await fetch(`${SUPABASE_URL}/functions/v1/cms-recovery`, {
            method: "POST",
            headers: {
              apikey: SUPABASE_ANON_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email: email.trim().toLowerCase() }),
            signal: AbortSignal.timeout(10_000),
          });
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (!response.ok) return { error: friendlyError(body.error ?? "RECOVERY_FAILED") };
          return { error: null };
        } catch {
          return { error: "Não foi possível concluir a operação. Tente novamente." };
        }
      },
      async updatePassword(password) {
        try {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) return { error: friendlyError(error.message) };
          const current = await supabase.auth.getSession();
          if (!current.data.session) return { error: "A sessão do convite expirou. Solicite um novo link." };
          await resolveSession(current.data.session, "recovery");
          return { error: null };
        } catch {
          return { error: "Não foi possível concluir a operação. Tente novamente." };
        }
      },
      async beginMfaEnrollment() {
        try {
          const factorResult = await supabase.auth.mfa.listFactors();
          if (factorResult.error)
            return { enrollment: null, error: "Não foi possível consultar o autenticador." };
          for (const factor of factorResult.data?.all ?? []) {
            if (factor.factor_type === "totp" && factor.status === "unverified") {
              const removal = await supabase.auth.mfa.unenroll({ factorId: factor.id });
              if (removal.error)
                return { enrollment: null, error: "Não foi possível preparar o autenticador." };
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
        } catch {
          return { enrollment: null, error: "Não foi possível preparar o autenticador." };
        }
      },
      async verifyMfa(code, factorId) {
        try {
          let selectedId = factorId;
          if (!selectedId) {
            const factorResult = await supabase.auth.mfa.listFactors();
            if (factorResult.error) return { error: "Não foi possível consultar o autenticador." };
            selectedId = factorResult.data?.totp?.find((factor) => factor.status === "verified")?.id;
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
          if (refreshed.error || !refreshed.data.session)
            return { error: "Não foi possível atualizar a sessão segura." };
          await resolveSession(refreshed.data.session, "mfa");
          return { error: null };
        } catch {
          return { error: "Não foi possível confirmar sua identidade." };
        }
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
