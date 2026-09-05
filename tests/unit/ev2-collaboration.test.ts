import { describe, expect, it } from "vitest";
import {
  Ev2ReleaseDetailSchema,
  Ev2ReleaseSummarySchema,
  Ev2WorkTaskSchema,
  ev2AnchorPath,
  parseBulkTargets,
} from "@/shared/contracts/ev2-collaboration";

describe("EV2.7 collaboration contracts", () => {
  it("maps an anchored task to its exact administrative target", () => {
    expect(ev2AnchorPath({ route: "/admin/paginas/123" })).toBe("/admin/paginas/123");
    expect(ev2AnchorPath({ itemId: "27e57b61-88f2-4b90-8d83-f32c56bd0e92" })).toBe(
      "/admin/conteudo/27e57b61-88f2-4b90-8d83-f32c56bd0e92",
    );
    expect(ev2AnchorPath({ route: "https://example.com" })).toBeNull();
  });

  it("parses release and task batches without duplicates", () => {
    expect(
      parseBulkTargets(
        "27e57b61-88f2-4b90-8d83-f32c56bd0e92,3e91d04c-f133-4d76-b9df-54accc9f6e36",
        "add_to_release",
      ),
    ).toEqual([
      {
        id: "27e57b61-88f2-4b90-8d83-f32c56bd0e92",
        revisionId: "3e91d04c-f133-4d76-b9df-54accc9f6e36",
      },
    ]);
    expect(parseBulkTargets("27e57b61-88f2-4b90-8d83-f32c56bd0e92,4", "resolve_tasks")).toEqual([
      { id: "27e57b61-88f2-4b90-8d83-f32c56bd0e92", expectedVersion: 4 },
    ]);
    expect(() =>
      parseBulkTargets(
        "27e57b61-88f2-4b90-8d83-f32c56bd0e92,1\n27e57b61-88f2-4b90-8d83-f32c56bd0e92,1",
        "resolve_tasks",
      ),
    ).toThrow(/duplicado/);
  });

  it("rejects a release response without the frozen plan hash", () => {
    expect(
      Ev2ReleaseSummarySchema.safeParse({
        releaseId: "27e57b61-88f2-4b90-8d83-f32c56bd0e92",
        title: "Release G7",
        status: "validated",
        lockVersion: 2,
        updatedAt: new Date().toISOString(),
        itemCount: 2,
      }).success,
    ).toBe(false);
  });

  it("parses on-demand task history and release field differences", () => {
    const now = new Date().toISOString();
    const taskId = "27e57b61-88f2-4b90-8d83-f32c56bd0e92";
    expect(
      Ev2WorkTaskSchema.parse({
        id: taskId,
        sourceKind: "review",
        title: "Revisar bloco",
        description: "",
        status: "open",
        priority: "high",
        anchor: { route: "/admin/paginas/123" },
        lockVersion: 1,
        updatedAt: now,
        commentCount: 1,
        comments: [
          {
            id: "3e91d04c-f133-4d76-b9df-54accc9f6e36",
            authorId: taskId,
            body: "Conferido.",
            anchor: { route: "/admin/paginas/123" },
            createdAt: now,
          },
        ],
        history: [
          {
            id: "8b6f86b8-e7ba-495f-8eca-d5ea414b9d5b",
            actorId: taskId,
            eventType: "commented",
            eventData: {},
            occurredAt: now,
          },
        ],
      }).comments,
    ).toHaveLength(1);

    expect(
      Ev2ReleaseDetailSchema.safeParse({
        releaseId: taskId,
        title: "Release G7",
        reason: "Validação completa",
        status: "draft",
        planHash: "a".repeat(64),
        lockVersion: 1,
        updatedAt: now,
        items: [
          {
            id: "3e91d04c-f133-4d76-b9df-54accc9f6e36",
            itemId: taskId,
            revisionId: "8b6f86b8-e7ba-495f-8eca-d5ea414b9d5b",
            contentType: "page",
            slug: "pagina-g7",
            position: 1,
            dependencies: [],
            frozenHash: "b".repeat(64),
            validationStatus: "pending",
            diff: {
              toRevisionId: "8b6f86b8-e7ba-495f-8eca-d5ea414b9d5b",
              changedFields: ["blocks", "page"],
              seoChanged: true,
            },
          },
        ],
        validations: [],
        approvals: [],
      }).success,
    ).toBe(true);
  });
});
