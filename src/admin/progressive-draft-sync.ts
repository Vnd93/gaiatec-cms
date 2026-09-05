import type { Ev2DraftPatch } from "@/shared/contracts/ev2-draft";

export type ProgressiveDraftSyncStatus =
  | "disabled"
  | "checking"
  | "creating"
  | "recovery_available"
  | "idle"
  | "syncing"
  | "saved"
  | "offline"
  | "conflict"
  | "error";

export function buildTopLevelDraftPatches(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Ev2DraftPatch[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const patches: Ev2DraftPatch[] = [];
  for (const key of [...keys].sort()) {
    const previousValue = previous[key];
    const nextValue = next[key];
    if (JSON.stringify(previousValue) === JSON.stringify(nextValue)) continue;
    if (!(key in next) || nextValue === undefined) patches.push({ operation: "remove", path: [key] });
    else patches.push({ operation: "set", path: [key], value: nextValue as never });
  }
  return patches;
}

export function progressiveDraftRetryDelay(attempt: number) {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, Math.min(attempt, 5)));
}
