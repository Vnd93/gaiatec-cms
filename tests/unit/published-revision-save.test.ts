import { describe, expect, it, vi } from "vitest";
import {
  PUBLISHED_REVISION_NOT_SAVED,
  PUBLISHED_REVISION_RECONCILIATION_FAILED,
  saveWithPublishedRevisionReconciliation,
} from "../../src/admin/published-revision-save";

describe("published revision save reconciliation", () => {
  it("saves directly when no published revision needs to be reopened", async () => {
    const save = vi.fn().mockResolvedValue({ itemId: "item" });
    const invalidateSnapshot = vi.fn();
    const reconcile = vi.fn();

    await expect(
      saveWithPublishedRevisionReconciliation({
        reopen: null,
        save,
        invalidateSnapshot,
        reconcile,
      }),
    ).resolves.toEqual({ itemId: "item" });

    expect(save).toHaveBeenCalledOnce();
    expect(invalidateSnapshot).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("does not claim a new revision was opened when reopen itself fails", async () => {
    const reopenError = new Error("reopen failed");
    const save = vi.fn();
    const invalidateSnapshot = vi.fn();
    const reconcile = vi.fn();

    await expect(
      saveWithPublishedRevisionReconciliation({
        reopen: vi.fn().mockRejectedValue(reopenError),
        save,
        invalidateSnapshot,
        reconcile,
      }),
    ).rejects.toBe(reopenError);

    expect(save).not.toHaveBeenCalled();
    expect(invalidateSnapshot).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("invalidates the published snapshot and reconciles after the subsequent save fails", async () => {
    const events: string[] = [];

    await expect(
      saveWithPublishedRevisionReconciliation({
        reopen: vi.fn(async () => events.push("reopen")),
        save: vi.fn(async () => {
          events.push("save");
          throw new Error("save failed");
        }),
        invalidateSnapshot: vi.fn(() => events.push("invalidate")),
        reconcile: vi.fn(async () => {
          events.push("reconcile");
        }),
      }),
    ).rejects.toThrow(PUBLISHED_REVISION_NOT_SAVED);

    expect(events).toEqual(["reopen", "save", "invalidate", "reconcile"]);
  });

  it("requires a reload before continuing when authoritative reconciliation also fails", async () => {
    const invalidateSnapshot = vi.fn();

    await expect(
      saveWithPublishedRevisionReconciliation({
        reopen: vi.fn().mockResolvedValue(undefined),
        save: vi.fn().mockRejectedValue(new Error("save failed")),
        invalidateSnapshot,
        reconcile: vi.fn().mockRejectedValue(new Error("reload failed")),
      }),
    ).rejects.toThrow(PUBLISHED_REVISION_RECONCILIATION_FAILED);

    expect(invalidateSnapshot).toHaveBeenCalledOnce();
  });
});
