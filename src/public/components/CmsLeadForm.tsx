import { useState } from "react";
import { TurnstileChallenge } from "@/app/components/TurnstileChallenge";
import type { CmsFormVersion } from "@/shared/contracts/cms-content";
import { submitGovernedLead, type LeadFieldValue } from "../lead-api";

type Props = {
  form: CmsFormVersion;
  campaignId?: string;
  productId?: string;
  heading?: string;
  showHeader?: boolean;
  appearance?: "default" | "contact";
  tone?: "brand" | "light";
  source?: string;
  initialValues?: Record<string, LeadFieldValue>;
};

function fieldAutocomplete(key: string, type: string) {
  if (type === "email") return "email";
  if (type === "tel") return "tel";
  if (["nome", "first-name", "given-name"].includes(key)) return "given-name";
  if (["sobrenome", "last-name", "family-name"].includes(key)) return "family-name";
  if (["empresa", "company", "organization"].includes(key)) return "organization";
  return undefined;
}

export function CmsLeadForm({
  form,
  campaignId,
  productId,
  heading,
  showHeader = true,
  appearance = "default",
  tone = "light",
  source,
  initialValues = {},
}: Props) {
  const [values, setValues] = useState<Record<string, LeadFieldValue>>(() => ({ ...initialValues }));
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
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
      const result = await submitGovernedLead({
        form,
        fields,
        idempotencyKey,
        source: source ?? (campaignId ? "campaign" : productId ? "product" : "site"),
        campaignId,
        productId,
        consentAccepted: consent,
        honeypot: String(values.website ?? ""),
        captchaToken: captchaToken || undefined,
      });
      setValues({ ...initialValues });
      setConsent(false);
      setCaptchaRequired(false);
      setCaptchaToken("");
      setIdempotencyKey(crypto.randomUUID());
      setMessage(`${form.successMessage}${result.reference ? ` Protocolo ${result.reference}.` : ""}`);
    } catch (caught) {
      if ((caught as Error & { challengeRequired?: boolean }).challengeRequired) setCaptchaRequired(true);
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={`cms-lead-form cms-lead-form--${appearance} cms-lead-form--${appearance}-${tone}`}
      onSubmit={submit}
      {...(showHeader
        ? { "aria-labelledby": `form-title-${form.versionId}` }
        : { "aria-label": heading ?? form.title })}
    >
      {showHeader && <h2 id={`form-title-${form.versionId}`}>{heading ?? form.title}</h2>}
      {showHeader && <p>{form.purpose}</p>}
      <div className="cms-lead-form__honeypot" aria-hidden="true">
        <label>
          Website
          <input
            name="website"
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
                  name={field.key}
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
            <label key={field.id} htmlFor={id} data-field-key={field.key} data-field-type={field.type}>
              {field.label}
              {field.required ? " *" : ""}
              {field.type === "textarea" ? (
                <textarea
                  id={id}
                  name={field.key}
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
                  name={field.key}
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
                  name={field.key}
                  type={field.type}
                  autoComplete={fieldAutocomplete(field.key, field.type)}
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
          name="consent"
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
