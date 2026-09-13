import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  APPROVED_OPENROUTER_MODEL,
  generateOpenRouterProposal,
} from "../../supabase/functions/_shared/openrouter";

declare global {
  var Deno: {
    env: {
      get(name: string): string | undefined;
    };
  };
}

const input = {
  prompt: "Resuma a fonte.",
  sourceTitle: "Manual sintético",
  sourceVersion: "v1",
  sourceLocator: "seção 1",
  sourceExcerpt: "O instrumento mede pressão de zero a dez bar.",
  proposalKind: "draft_patch" as const,
};

const completion = (confidence: unknown = 0.86) => ({
  choices: [
    {
      message: {
        content: JSON.stringify({
          summary: "Resumo fiel à fonte",
          value: "Faixa de medição de zero a dez bar.",
          confidence,
        }),
      },
    },
  ],
  usage: { prompt_tokens: 21, completion_tokens: 13 },
});

beforeEach(() => {
  vi.stubGlobal("Deno", {
    env: {
      get(name: string) {
        return {
          OPENROUTER_API_KEY: "synthetic-test-key",
          OPENROUTER_MODEL: APPROVED_OPENROUTER_MODEL,
          CMS_AI_EXTERNAL_PROVIDER_ENABLED: "true",
        }[name];
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OpenRouter adapter", () => {
  it("sends only the pinned free model through deny plus ZDR", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(completion()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateOpenRouterProposal(input)).resolves.toMatchObject({
      model: APPROVED_OPENROUTER_MODEL,
      confidence: 0.86,
      inputTokens: 21,
      outputTokens: 13,
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.model).toBe(APPROVED_OPENROUTER_MODEL);
    expect(body.provider).toEqual({ data_collection: "deny", zdr: true });
    expect(body).not.toHaveProperty("models");
    expect(body).not.toHaveProperty("response_format");
    expect(request.headers).toMatchObject({ "X-OpenRouter-Metadata": "enabled" });
  });

  it("distinguishes a policy-filtered 404 from a generic 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 404 },
            openrouter_metadata: { requested: APPROVED_OPENROUTER_MODEL, attempt: 0 },
          }),
          { status: 404 },
        ),
      ),
    );
    await expect(generateOpenRouterProposal(input)).rejects.toThrow("OPENROUTER_NO_ALLOWED_PROVIDER");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 404 },
            openrouter_metadata: { requested: APPROVED_OPENROUTER_MODEL, attempt: 1 },
          }),
          { status: 404 },
        ),
      ),
    );
    await expect(generateOpenRouterProposal(input)).rejects.toThrow("OPENROUTER_HTTP_404");
  });

  it.each([true, null, "0.9"])("rejects a non-numeric confidence value: %j", async (confidence) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(completion(confidence)), { status: 200 })),
    );
    await expect(generateOpenRouterProposal(input)).rejects.toThrow("OPENROUTER_OUTPUT_INVALID");
  });

  it("normalizes malformed successful envelopes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    await expect(generateOpenRouterProposal(input)).rejects.toThrow("OPENROUTER_OUTPUT_INVALID");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), {
          status: 200,
        }),
      ),
    );
    await expect(generateOpenRouterProposal(input)).rejects.toThrow("OPENROUTER_OUTPUT_INVALID");
  });

  it("normalizes its bounded abort without exposing transport details", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      ),
    );
    const result = expect(generateOpenRouterProposal(input)).rejects.toThrow("OPENROUTER_TIMEOUT");
    await vi.advanceTimersByTimeAsync(30_000);
    await result;
  });
});
