import { z } from "zod";

export const EngineeringSignalSchema = z
  .object({
    schemaVersion: z.literal(1),
    correlationId: z.string().uuid(),
    release: z.string().min(1).max(80),
    route: z.string().startsWith("/").max(160),
    signal: z.enum([
      "api.request",
      "publication.result",
      "queue.depth",
      "frontend.error",
      "feature_flag.evaluated",
      "release.command",
      "draft_v2.command",
    ]),
    outcome: z.enum(["ok", "error"]),
    durationMs: z.number().nonnegative().finite().optional(),
    count: z.number().int().nonnegative().optional(),
  })
  .strict();

export type EngineeringSignal = z.infer<typeof EngineeringSignalSchema>;
