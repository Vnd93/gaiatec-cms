export function isCanonicalDocumentWriteFence(error: unknown): boolean {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  // Accept the legacy code only for the exact fence during a staged rollout.
  // A real serialization failure, another conflict, or an auth refusal is not
  // proof that cleanup is safely scheduled.
  return record.message === "CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE" &&
    (record.code === "PT409" || record.code === "40001");
}
