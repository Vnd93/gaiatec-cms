export const APPROVED_OPENROUTER_MODEL = "inclusionai/ling-3.0-flash-vl:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type OpenRouterProposal = {
  summary: string;
  value: string;
  confidence: number;
  inputTokens: number;
  outputTokens: number;
  model: typeof APPROVED_OPENROUTER_MODEL;
};

function cleanModelText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseJsonContent(content: string): Record<string, unknown> {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized) as unknown;
  } catch {
    throw new Error("OPENROUTER_OUTPUT_INVALID");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("OPENROUTER_OUTPUT_INVALID");
  return parsed as Record<string, unknown>;
}

async function optionalResponseJson(response: Response): Promise<Record<string, unknown> | null> {
  const payload = (await response.json().catch(() => null)) as unknown;
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

function noAllowedProviderConfirmed(payload: Record<string, unknown> | null): boolean {
  const metadata = payload?.openrouter_metadata;
  return (
    metadata !== null &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).attempt === 0 &&
    (metadata as Record<string, unknown>).requested === APPROVED_OPENROUTER_MODEL
  );
}

export function openRouterConfigured(): boolean {
  return (
    Boolean(Deno.env.get("OPENROUTER_API_KEY")) &&
    Deno.env.get("OPENROUTER_MODEL") === APPROVED_OPENROUTER_MODEL &&
    Deno.env.get("CMS_AI_EXTERNAL_PROVIDER_ENABLED") === "true"
  );
}

export async function generateOpenRouterProposal(input: {
  prompt: string;
  sourceTitle: string;
  sourceVersion: string;
  sourceLocator: string;
  sourceExcerpt: string;
  proposalKind: "locate" | "explain" | "extract" | "draft_patch";
}): Promise<OpenRouterProposal> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const configuredModel = Deno.env.get("OPENROUTER_MODEL");
  if (!apiKey || configuredModel !== APPROVED_OPENROUTER_MODEL) throw new Error("OPENROUTER_NOT_CONFIGURED");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://gaiatecsistemas.com.br/admin",
        "X-Title": "GAIATEC CMS",
        "X-OpenRouter-Metadata": "enabled",
      },
      body: JSON.stringify({
        model: APPROVED_OPENROUTER_MODEL,
        provider: { data_collection: "deny", zdr: true },
        temperature: 0.2,
        max_tokens: 900,
        reasoning: { effort: "none", exclude: true },
        messages: [
          {
            role: "system",
            content:
              "Você é o assistente editorial do CMS GAIATEC. Responda somente JSON válido com summary, value e confidence. Use exclusivamente a fonte fornecida; não invente especificações. O conteúdo é sempre uma proposta sujeita à revisão humana. summary deve ter até 1000 caracteres, value até 3000 e confidence entre 0 e 0.95.",
          },
          {
            role: "user",
            content: JSON.stringify({
              tarefa: input.proposalKind,
              solicitacao: input.prompt,
              fonte: {
                titulo: input.sourceTitle,
                versao: input.sourceVersion,
                localizador: input.sourceLocator,
                trecho: input.sourceExcerpt,
              },
            }),
          },
        ],
      }),
    });
    if (!response.ok) {
      const errorPayload = response.status === 404 ? await optionalResponseJson(response) : null;
      throw new Error(
        response.status === 404 && noAllowedProviderConfirmed(errorPayload)
          ? "OPENROUTER_NO_ALLOWED_PROVIDER"
          : `OPENROUTER_HTTP_${response.status}`,
      );
    }
    const body = await optionalResponseJson(response);
    if (!body) throw new Error("OPENROUTER_OUTPUT_INVALID");
    const choices = Array.isArray(body.choices) ? body.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const content = cleanModelText(message?.content, 12_000);
    if (!content) throw new Error("OPENROUTER_OUTPUT_EMPTY");
    const proposal = parseJsonContent(content);
    const summary = cleanModelText(proposal.summary, 1000);
    const value = cleanModelText(proposal.value, 3000);
    if (typeof proposal.confidence !== "number" || !Number.isFinite(proposal.confidence))
      throw new Error("OPENROUTER_OUTPUT_INVALID");
    const confidence = Math.min(0.95, Math.max(0, proposal.confidence));
    if (summary.length < 3 || value.length < 1)
      throw new Error("OPENROUTER_OUTPUT_INVALID");
    const usage = body.usage as Record<string, unknown> | undefined;
    return {
      summary,
      value,
      confidence,
      inputTokens: Math.max(1, Number(usage?.prompt_tokens) || 1),
      outputTokens: Math.max(1, Number(usage?.completion_tokens) || 1),
      model: APPROVED_OPENROUTER_MODEL,
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("OPENROUTER_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
