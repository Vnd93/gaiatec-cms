import { useMemo, useState } from "react";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { TurnstileChallenge } from "@/app/components/TurnstileChallenge";
import type { CmsFormVersion } from "@/shared/contracts/cms-content";

type Props = {
  form: CmsFormVersion;
  campaignId?: string;
  productId?: string;
  heading?: string;
};

export function CmsLeadForm({ form, campaignId, productId, heading }: Props) {
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const utm = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      source: params.get("utm_source") || undefined,
      medium: params.get("utm_medium") || undefined,
      campaign: params.get("utm_campaign") || undefined,
      term: params.get("utm_term") || undefined,
      content: params.get("utm_content") || undefined,
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const fields = Object.fromEntries(
        form.fields
          .filter((field) => field.type !== "hidden")
          .map((field) => [field.key, values[field.key] ?? ""]),
      );
      const response = await fetch(`${SUPABASE_URL}/functions/v1/lead-capture`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          formId: form.formId,
          formVersionId: form.versionId,
          idempotencyKey,
          fields,
          origin: {
            path: window.location.pathname,
            source: campaignId ? "campaign" : productId ? "product" : "site",
            ...(campaignId ? { campaignId } : {}),
            ...(productId ? { productId } : {}),
            utm,
          },
          consent: { accepted: consent, text: form.consent.text, version: form.consent.version },
          honeypot: values.website ?? "",
          ...(captchaToken ? { captchaToken } : {}),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        reference?: string;
        challengeRequired?: boolean;
      };
      if (result.challengeRequired) setCaptchaRequired(true);
      if (!response.ok) throw new Error(result.error ?? "Não foi possível enviar. Tente novamente.");
      setValues({});
      setConsent(false);
      setCaptchaRequired(false);
      setCaptchaToken("");
      setIdempotencyKey(crypto.randomUUID());
      setMessage(`${form.successMessage}${result.reference ? ` Protocolo ${result.reference}.` : ""}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cms-lead-form" onSubmit={submit} aria-labelledby={`form-title-${form.versionId}`}>
      <h2 id={`form-title-${form.versionId}`}>{heading ?? form.title}</h2>
      <p>{form.purpose}</p>
      <div className="cms-lead-form__honeypot" aria-hidden="true">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={String(values.website ?? "")}
            onChange={(event) => setValues((current) => ({ ...current, website: event.target.value }))}
          />
        </label>
      </div>
      {form.fields
        .slice()
        .sort((a, b) => a.order - b.order)
        .filter((field) => field.type !== "hidden")
        .map((field) => {
          const id = `${form.versionId}-${field.key}`;
          if (field.type === "checkbox")
            return (
              <label className="cms-lead-form__checkbox" key={field.id} htmlFor={id}>
                <input
                  id={id}
                  type="checkbox"
                  checked={Boolean(values[field.key])}
                  required={field.required}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.key]: event.target.checked }))
                  }
                />
                <span>{field.label}</span>
              </label>
            );
          return (
            <label key={field.id} htmlFor={id}>
              {field.label}
              {field.required ? " *" : ""}
              {field.type === "textarea" ? (
                <textarea
                  id={id}
                  required={field.required}
                  maxLength={field.maxLength}
                  value={String(values[field.key] ?? "")}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              ) : field.type === "select" ? (
                <select
                  id={id}
                  required={field.required}
                  value={String(values[field.key] ?? "")}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                >
                  <option value="">Selecione</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  type={field.type}
                  required={field.required}
                  maxLength={field.maxLength}
                  value={String(values[field.key] ?? "")}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              )}
            </label>
          );
        })}
      <label className="cms-lead-form__checkbox">
        <input
          type="checkbox"
          checked={consent}
          required
          onChange={(event) => setConsent(event.target.checked)}
        />
        <span>
          {form.consent.text} <a href={form.consent.privacyPath}>Política de privacidade</a>.
        </span>
      </label>
      {captchaRequired && <TurnstileChallenge onToken={setCaptchaToken} />}
      <button className="cms-page-button" type="submit" disabled={busy}>
        {busy ? "Enviando…" : form.submitLabel}
      </button>
      {message && (
        <p role="status" className="cms-lead-form__success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="cms-lead-form__error">
          {error}
        </p>
      )}
    </form>
  );
}
