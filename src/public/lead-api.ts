import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import type { PublicFormVersion } from "./catalog-api";
import { compatibleLeadRequest, normalizeCompatibleLeadSuccess } from "./form-backend-compatibility";

export type LeadFieldValue = string | boolean | string[];

export type LeadCaptureResult = {
  reference?: string;
  duplicate?: boolean;
  challengeRequired?: boolean;
};

const publicLeadFailureMessage = "Não foi possível enviar. Tente novamente.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function submitGovernedLead({
  form,
  fields,
  idempotencyKey,
  source,
  campaignPath,
  productSlug,
  consentAccepted,
  honeypot = "",
  captchaToken,
}: {
  form: PublicFormVersion;
  fields: Record<string, LeadFieldValue>;
  idempotencyKey: string;
  source: string;
  campaignPath?: string;
  productSlug?: string;
  consentAccepted: boolean;
  honeypot?: string;
  captchaToken?: string;
}): Promise<LeadCaptureResult> {
  const params = new URLSearchParams(window.location.search);
  const origin = {
    path: window.location.pathname,
    source,
    ...(campaignPath ? { campaignPath } : {}),
    ...(productSlug ? { productSlug } : {}),
    utm: {
      source: params.get("utm_source") || undefined,
      medium: params.get("utm_medium") || undefined,
      campaign: params.get("utm_campaign") || undefined,
      term: params.get("utm_term") || undefined,
      content: params.get("utm_content") || undefined,
    },
  };
  const request = compatibleLeadRequest({
    form,
    fields,
    idempotencyKey,
    origin,
    consentAccepted,
    honeypot,
    captchaToken,
  });
  if (!request) throw new Error(publicLeadFailureMessage);
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/lead-capture`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
    });
  } catch {
    throw new Error(publicLeadFailureMessage);
  }
  const result: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(publicLeadFailureMessage);
    Object.assign(error, { challengeRequired: isRecord(result) && result.challengeRequired === true });
    throw error;
  }
  const confirmation = normalizeCompatibleLeadSuccess(result, request.contract);
  if (response.status !== 201 || !confirmation)
    throw new Error("Não foi possível confirmar o envio. Tente novamente.");
  return confirmation;
}
