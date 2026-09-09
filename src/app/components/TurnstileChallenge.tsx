import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset?: (widgetId?: string) => void;
};

type TurnstileState =
  | "loading"
  | "ready"
  | "verified"
  | "error"
  | "expired"
  | "timeout"
  | "invalid"
  | "unsupported";

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SELECTOR = 'script[data-gaiatec-turnstile="true"]';
const SCRIPT_SOURCE = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_LOAD_TIMEOUT_MS = 10_000;
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATE_MESSAGES: Record<TurnstileState, string> = {
  loading: "Carregando a verificação de segurança…",
  ready: "Verificação de segurança pronta. Conclua o desafio para continuar.",
  verified: "Verificação de segurança concluída.",
  error: "Não foi possível carregar a verificação de segurança. Tente novamente.",
  expired: "A verificação de segurança expirou. Tente novamente.",
  timeout: "O tempo da verificação de segurança terminou. Tente novamente.",
  invalid: "A identificação da verificação de segurança é inválida.",
  unsupported: "Este navegador não oferece suporte à verificação de segurança.",
};

function safelyRemoveWidget(api: TurnstileApi | undefined, widgetId: string | null) {
  if (!api || !widgetId) return;
  try {
    api.remove(widgetId);
  } catch {
    // A remoção é apenas uma limpeza defensiva; o novo render continua isolado.
  }
}

export function TurnstileChallenge({
  onToken,
  cData,
  tone = "light",
  refreshKey = 0,
}: {
  onToken: (token: string) => void;
  cData: string;
  tone?: "light" | "dark";
  refreshKey?: string | number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const validCData = CANONICAL_UUID_PATTERN.test(cData);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const [state, setState] = useState<TurnstileState>(
    siteKey ? (validCData ? "loading" : "invalid") : "unsupported",
  );

  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !validCData || !containerRef.current) {
      onTokenRef.current("");
      return;
    }

    let active = true;
    let ownedWidgetId: string | null = null;
    let observedScript: HTMLScriptElement | null = null;
    let scriptLoadTimeout: number | null = null;

    const clearToken = () => onTokenRef.current("");
    const clearScriptLoadTimeout = () => {
      if (scriptLoadTimeout === null) return;
      window.clearTimeout(scriptLoadTimeout);
      scriptLoadTimeout = null;
    };
    const showFailure = (
      nextState: Extract<TurnstileState, "error" | "expired" | "timeout" | "unsupported">,
    ) => {
      if (!active) return;
      clearToken();
      setState(nextState);
    };
    const renderWidget = () => {
      if (!active || !window.turnstile || !containerRef.current || ownedWidgetId) return;
      try {
        setState("ready");
        const widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: "lead_capture",
          cData,
          language: "pt-br",
          theme: tone,
          "response-field": false,
          retry: "never",
          "refresh-expired": "manual",
          "refresh-timeout": "manual",
          callback: (token: string) => {
            if (!active) return;
            if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
              showFailure("error");
              return;
            }
            onTokenRef.current(token);
            setState("verified");
          },
          "expired-callback": () => showFailure("expired"),
          "timeout-callback": () => showFailure("timeout"),
          "error-callback": () => {
            showFailure("error");
            return true;
          },
          "unsupported-callback": () => showFailure("unsupported"),
        });
        ownedWidgetId = widgetId;
        widgetIdRef.current = widgetId;
      } catch {
        showFailure("error");
      }
    };
    const handleScriptLoad = () => {
      clearScriptLoadTimeout();
      if (!active || !observedScript) return;
      observedScript.dataset.gaiatecTurnstileState = "ready";
      if (window.turnstile) renderWidget();
      else showFailure("unsupported");
    };
    const handleScriptError = () => {
      clearScriptLoadTimeout();
      if (observedScript) observedScript.dataset.gaiatecTurnstileState = "error";
      showFailure("error");
    };
    const handleScriptTimeout = () => {
      scriptLoadTimeout = null;
      observedScript?.removeEventListener("load", handleScriptLoad);
      observedScript?.removeEventListener("error", handleScriptError);
      if (observedScript) observedScript.dataset.gaiatecTurnstileState = "error";
      showFailure("timeout");
    };

    clearToken();
    setState("loading");
    const existing = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    if (window.turnstile) {
      renderWidget();
    } else if (existing?.dataset.gaiatecTurnstileState === "ready") {
      showFailure("unsupported");
    } else if (existing?.dataset.gaiatecTurnstileState === "error") {
      showFailure("error");
    } else {
      observedScript = existing ?? document.createElement("script");
      observedScript.addEventListener("load", handleScriptLoad, { once: true });
      observedScript.addEventListener("error", handleScriptError, { once: true });
      scriptLoadTimeout = window.setTimeout(handleScriptTimeout, SCRIPT_LOAD_TIMEOUT_MS);
      if (!existing) {
        observedScript.src = SCRIPT_SOURCE;
        observedScript.async = true;
        observedScript.defer = true;
        observedScript.dataset.gaiatecTurnstile = "true";
        observedScript.dataset.gaiatecTurnstileState = "loading";
        document.head.appendChild(observedScript);
      }
    }

    return () => {
      active = false;
      clearScriptLoadTimeout();
      observedScript?.removeEventListener("load", handleScriptLoad);
      observedScript?.removeEventListener("error", handleScriptError);
      safelyRemoveWidget(window.turnstile, ownedWidgetId);
      if (widgetIdRef.current === ownedWidgetId) widgetIdRef.current = null;
    };
  }, [cData, refreshKey, renderAttempt, siteKey, tone, validCData]);

  const retry = () => {
    onTokenRef.current("");
    setState("loading");

    const api = window.turnstile;
    const widgetId = widgetIdRef.current;
    if (api?.reset && widgetId) {
      try {
        api.reset(widgetId);
        setState("ready");
        return;
      } catch {
        // Se reset não estiver operacional, recriamos o widget abaixo.
      }
    }

    safelyRemoveWidget(api, widgetId);
    widgetIdRef.current = null;
    const script = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    if (!api && script && script.dataset.gaiatecTurnstileState !== "loading") script.remove();
    setRenderAttempt((current) => current + 1);
  };

  const missingConfiguration = !siteKey;
  const invalidCData = !validCData;
  const visibleState = missingConfiguration ? "unsupported" : invalidCData ? "invalid" : state;
  const containerKey = `${typeof refreshKey}:${String(refreshKey)}:${tone}:${renderAttempt}:${cData}`;
  const message = missingConfiguration
    ? "A verificação antiabuso não está configurada neste ambiente."
    : STATE_MESSAGES[visibleState];
  const isFailure = ["error", "expired", "timeout", "invalid", "unsupported"].includes(
    visibleState,
  );

  return (
    <div
      role="group"
      aria-label="Verificação de segurança"
      aria-busy={visibleState === "loading"}
      data-turnstile-state={visibleState}
      className="space-y-2"
    >
      {!missingConfiguration && !invalidCData && <div key={containerKey} ref={containerRef} />}
      <p
        role={isFailure ? "alert" : "status"}
        aria-live={isFailure ? "assertive" : "polite"}
        className={`text-sm ${
          isFailure
            ? tone === "dark"
              ? "text-red-300"
              : "text-red-700"
            : tone === "dark"
              ? "text-slate-300"
              : "text-slate-600"
        }`}
      >
        {message}
      </p>
      {!missingConfiguration &&
        (visibleState === "error" ||
          visibleState === "expired" ||
          visibleState === "timeout" ||
          visibleState === "unsupported") && (
        <button type="button" onClick={retry} className="text-sm font-semibold underline">
          Tentar novamente
        </button>
      )}
    </div>
  );
}
