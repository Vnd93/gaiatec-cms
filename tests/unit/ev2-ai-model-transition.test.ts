import { describe, expect, it } from "vitest";

import {
  EV2_AI_ACTIVE_OPENROUTER_MODEL,
  EV2_AI_COMPATIBLE_RESPONSE_MODELS,
  Ev2AiCapabilitySchema,
  Ev2AiCompatibleResponseModelSchema,
  Ev2AiSessionCreatedSchema,
} from "@/shared/contracts/ev2-ai";
import {
  Ev2AiExecutionCapabilitySchema,
  Ev2AiExecutionMutationResultSchema,
} from "@/shared/contracts/ev2-ai-execute";

const LEGACY_MODEL = "nvidia/nemotron-3.5-lightning:free";
const NEXT_MODEL = "inclusionai/ling-3.0-flash-vl:free";

describe("AI model transition bridge", () => {
  it("accepts exactly the legacy and next zero-cost models", () => {
    expect(EV2_AI_ACTIVE_OPENROUTER_MODEL).toBe(NEXT_MODEL);
    expect(EV2_AI_COMPATIBLE_RESPONSE_MODELS).toEqual([LEGACY_MODEL, NEXT_MODEL]);
    expect(Ev2AiCompatibleResponseModelSchema.safeParse(LEGACY_MODEL).success).toBe(true);
    expect(Ev2AiCompatibleResponseModelSchema.safeParse(NEXT_MODEL).success).toBe(true);
    expect(Ev2AiCompatibleResponseModelSchema.safeParse("openrouter/auto").success).toBe(false);
  });

  it("rejects mixed capability envelopes during the bridge", () => {
    const assistCapability = {
      schemaVersion: 1,
      enabled: true,
      source: "database",
      environment: "staging",
      siteKey: "main",
      providerMode: "openrouter",
      providerModel: NEXT_MODEL,
      allowedProvider: "openrouter",
      allowedModel: LEGACY_MODEL,
      externalProviderEnabled: true,
      externalProviderReady: true,
      aiExecute: false,
      realDataAllowed: false,
      decisionKey: "EV2-D04",
      decisionStatus: "approved",
      policyVersion: 1,
      toolCatalogVersion: 1,
      retentionHours: 24,
      maxSessionMinutes: 30,
      maxSessionTokens: 8000,
      manualFallback: true,
      correlationId: "44444444-4444-4444-8444-444444444444",
    };
    expect(Ev2AiCapabilitySchema.safeParse(assistCapability).success).toBe(false);

    const executionCapability = {
      schemaVersion: 1,
      enabled: true,
      source: "database",
      environment: "staging",
      siteKey: "main",
      providerMode: "openrouter",
      providerModel: NEXT_MODEL,
      allowedProvider: "openrouter",
      allowedModel: LEGACY_MODEL,
      externalProviderEnabled: true,
      externalProviderReady: true,
      realDataAllowed: false,
      syntheticOnly: true,
      requiresAiAssist: true,
      planHashRequired: true,
      reviewerSeparationRequired: true,
      compensationRequired: true,
      maxPlanSteps: 20,
      approvalMinutes: 10,
      manualFallback: true,
      correlationId: "55555555-5555-4555-8555-555555555555",
    };
    expect(Ev2AiExecutionCapabilitySchema.safeParse(executionCapability).success).toBe(false);
  });

  it.each([LEGACY_MODEL, NEXT_MODEL])("keeps assist and execution responses compatible with %s", (model) => {
    expect(
      Ev2AiSessionCreatedSchema.safeParse({
        schemaVersion: 1,
        sessionId: "11111111-1111-4111-8111-111111111111",
        status: "active",
        providerMode: "openrouter",
        providerModel: model,
        externalProviderEnabled: true,
        expiresAt: "2026-09-13T12:00:00.000Z",
        correlationId: "22222222-2222-4222-8222-222222222222",
      }).success,
    ).toBe(true);
    expect(
      Ev2AiExecutionMutationResultSchema.safeParse({
        schemaVersion: 1,
        action: "create_target",
        targetRef: "g14x-model-transition",
        planId: null,
        runId: null,
        status: "created",
        planHash: null,
        applied: false,
        published: false,
        syntheticOnly: true,
        providerMode: "openrouter",
        providerModel: model,
        realDataAllowed: false,
        correlationId: "33333333-3333-4333-8333-333333333333",
      }).success,
    ).toBe(true);
  });
});
