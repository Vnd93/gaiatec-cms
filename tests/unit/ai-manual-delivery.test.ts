import { afterEach, expect, it, vi } from "vitest";
import { externalAiDeliveryAllowed } from "../../supabase/functions/_shared/ai-delivery-policy";
import {
  generateOpenRouterProposal,
  openRouterConfigured,
} from "../../supabase/functions/_shared/openrouter";

afterEach(() => vi.unstubAllGlobals());

it("blocks provider configuration and inference even with legacy enabling secrets", async () => {
  const fetch = vi.fn();
  const get = vi.fn(() => "true");
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("Deno", { env: { get } });
  expect(externalAiDeliveryAllowed()).toBe(false);
  expect(openRouterConfigured()).toBe(false);
  await expect(
    generateOpenRouterProposal({
      prompt: "synthetic",
      sourceTitle: "synthetic",
      sourceVersion: "v1",
      sourceLocator: "section 1",
      sourceExcerpt: "synthetic",
      proposalKind: "extract",
    }),
  ).rejects.toThrow("CMS_AI_MANUAL_ONLY");
  expect(fetch).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
});
