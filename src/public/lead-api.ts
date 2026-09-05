import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import type { CmsFormVersion } from "@/shared/contracts/cms-content";

export type LeadFieldValue = string | boolean | string[];

export type LeadCaptureResult = {
  reference?: string;
  duplicate?: boolean;
  challengeRequired?: boolean;
  correlationId?: string;
};

export async function submitGovernedLead({
  form,
  fields,
  idempotencyKey,
  source,
  campaignId,
  productId,
  consentAccepted,
  honeypot = "",
  captchaToken,
}: {
  form: CmsFormVersion;
  fields: Record<string, LeadFieldValue>;
  idempotencyKey: string;
  source: string;
  campaignId?: string;
  productId?: string;
  consentAccepted: boolean;
  honeypot?: string;
  captchaToken?: string;
}): Promise<LeadCaptureResult> {
  const params = new URLSearchParams(window.location.search);
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
        source,
        ...(campaignId ? { campaignId } : {}),
        ...(productId ? { productId } : {}),
        utm: {
          source: params.get("utm_source") || undefined,
          medium: params.get("utm_medium") || undefined,
          campaign: params.get("utm_campaign") || undefined,
          term: params.get("utm_term") || undefined,
          content: params.get("utm_content") || undefined,
        },
      },
      consent: {
        accepted: consentAccepted,
        text: form.consent.text,
        version: form.consent.version,
      },
      honeypot,
      ...(captchaToken ? { captchaToken } : {}),
    }),
  });
  const result = (await response.json().catch(() => ({}))) as LeadCaptureResult & {
    error?: string;
  };
  if (!response.ok) {
    const error = new Error(result.error ?? "Não foi possível enviar. Tente novamente.");
    Object.assign(error, { challengeRequired: result.challengeRequired === true });
    throw error;
  }
  return result;
}
