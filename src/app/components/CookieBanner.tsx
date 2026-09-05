import { useState } from "react";
import { Link } from "react-router";

/* Versão do aviso. Incrementar força o banner a reaparecer para todos —
   use quando o texto ou o tratamento de dados mudar de forma relevante. */
const CONSENT_VERSION = "1";
const STORAGE_KEY = "gaiatec_cookie_consent";

interface StoredConsent {
  version: string;
  action: "accepted" | "dismissed";
  at: string;
}

/** Lê o consentimento salvo. Retorna false se ausente, corrompido ou de versão antiga. */
function hasValidConsent(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredConsent;
    return parsed?.version === CONSENT_VERSION;
  } catch {
    // localStorage bloqueado (modo privado//cookies desabilitados) ou JSON inválido
    return false;
  }
}

function persistConsent(action: StoredConsent["action"]) {
  try {
    const payload: StoredConsent = {
      version: CONSENT_VERSION,
      action,
      at: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Sem persistência disponível: o banner reaparecerá na próxima visita.
    // Preferimos isso a quebrar a navegação.
  }
}

export function CookieBanner() {
  // Inicializador lazy: avalia antes da primeira pintura, então quem já
  // aceitou nunca vê o banner piscar na tela.
  const [visible, setVisible] = useState(() => !hasValidConsent());

  if (!visible) return null;

  const close = (action: StoredConsent["action"]) => {
    persistConsent(action);
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-sm z-[200] border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
    >
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <p className="text-gray-700 text-[13px] leading-[1.6] flex-1">
          Utilizamos cookies e tecnologias semelhantes para manter o site funcionando e melhorar sua
          experiência. Não usamos cookies de publicidade nem de rastreamento de terceiros. Saiba mais na{" "}
          <Link
            to="/politica-de-privacidade"
            className="text-[#0057DE] underline hover:text-[#0046b3] transition-colors"
          >
            Política de Privacidade
          </Link>
          .
        </p>
        <div className="flex items-center gap-4 flex-shrink-0">
          <button
            onClick={() => close("accepted")}
            className="bg-[#0057DE] text-white px-6 py-2 text-[12px] tracking-wider hover:bg-[#0046b3] transition-all"
            style={{ fontWeight: 600 }}
          >
            Aceitar
          </button>
          <button
            onClick={() => close("dismissed")}
            className="text-gray-700 text-[13px] hover:text-gray-950 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
