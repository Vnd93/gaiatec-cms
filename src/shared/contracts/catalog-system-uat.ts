import { z } from "zod";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const sha = z.string().regex(/^[0-9a-f]{40}$/);
const binding = z
  .object({
    candidateSha: sha,
    artifactDigest: digest,
    deploymentId: z.uuid(),
    backendSnapshotDigest: digest,
  })
  .strict();
const proof = z
  .object({
    binding,
    evidenceId: z.string().regex(/^CAT-UAT-[A-Z0-9-]{3,80}$/),
    evidenceDigest: digest,
  })
  .strict();
const check = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending"), proof: z.null() }).strict(),
  z.object({ status: z.literal("passed"), proof }).strict(),
]);

/**
 * Delivery of the empty manual system is separate from CAT-011 commercial
 * coverage. This validates evidence structure, not its authenticity: the
 * canonical evidence verifier and real Chrome still produce the proofs.
 * It grants no capability, indexing approval, publication or cutover.
 */
export const CatalogManualSystemUatSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.literal("manual-empty-system"),
    environment: z.literal("staging"),
    status: z.enum(["pending", "passed"]),
    binding,
    globalFeatureEnabled: z.literal(false),
    commercialProducts: z.literal(0),
    importedSkus: z.literal(0),
    productionMutations: z.literal(0),
    publication: z.literal(false),
    load: z.literal(false),
    cutover: z.literal(false),
    flows: z
      .object({
        manualRegistration: check,
        permissions: check,
        formValidation: check,
        reviewsAndConflicts: check,
        taxonomyAndRelations: check,
        editorial: check,
        emptyStatesAndErrors: check,
      })
      .strict(),
    gates: z
      .object({
        security: check,
        mfaAal2: check,
        rls: check,
        audit: check,
        accessibility: check,
        mobile: check,
        compatibility: check,
        rollback: check,
        zeroActiveResidue: check,
      })
      .strict(),
    recovery: z.discriminatedUnion("status", [
      z.object({ status: z.literal("pending"), manifestDigest: z.null() }).strict(),
      z
        .object({
          status: z.literal("passed"),
          manifestDigest: digest,
          preparedBeforeMutation: z.literal(true),
          activeOwnedEntities: z.literal(0),
          activeSessions: z.literal(0),
        })
        .strict(),
    ]),
    browser: z.discriminatedUnion("status", [
      z.object({ status: z.literal("pending"), proof: z.null() }).strict(),
      z
        .object({
          status: z.literal("passed"),
          engine: z.literal("chrome"),
          authenticated: z.literal(true),
          headless: z.literal(false),
          backend: z.literal("staging"),
          proof,
        })
        .strict(),
    ]),
  })
  .strict()
  .superRefine((record, context) => {
    const checks = [
      ...Object.entries(record.flows),
      ...Object.entries(record.gates),
      ["browser", record.browser] as const,
    ];
    for (const [name, result] of checks) {
      if (record.status === "passed" && result.status !== "passed") {
        context.addIssue({
          code: "custom",
          path: [name],
          message: "delivery requires every applicable gate",
        });
      }
      if (result.status === "passed") {
        for (const key of [
          "candidateSha",
          "artifactDigest",
          "deploymentId",
          "backendSnapshotDigest",
        ] as const) {
          if (result.proof.binding[key] !== record.binding[key]) {
            context.addIssue({
              code: "custom",
              path: [name, "proof", "binding", key],
              message: "changed bytes or state invalidate dependent evidence",
            });
          }
        }
      }
    }
    if (record.status === "passed" && record.recovery.status !== "passed") {
      context.addIssue({
        code: "custom",
        path: ["recovery"],
        message: "delivery requires durable recovery and terminal cleanup",
      });
    }
  });

export type CatalogManualSystemUat = z.infer<typeof CatalogManualSystemUatSchema>;
