import { supabase } from "@/lib/supabase";
import {
  CatalogWorkspaceCommandSchema,
  CatalogWorkspaceSchema,
  type CatalogWorkspaceCommand,
} from "@/shared/contracts/catalog-workspace";
import { cmsEnvironment } from "../ev2-runtime";
import { z } from "zod";
import { CatalogWorkspaceProductSchema } from "@/shared/contracts/catalog-workspace";
import {
  CatalogEditorialCommandSchema,
  CatalogEditorialRevisionSchema,
  type CatalogEditorialCommand,
} from "@/shared/contracts/catalog-editorial-workspace";

const ConflictDetailSchema = z
  .object({
    author: z.enum(["self", "other"]),
    changedAt: z.string().datetime({ offset: true }),
    correlationId: z.uuid().nullable(),
  })
  .strict();
export type CatalogConflictDetail = z.infer<typeof ConflictDetailSchema>;

export class CatalogWorkspaceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly conflict: CatalogConflictDetail | null = null,
  ) {
    super(
      status === 409
        ? "O registro mudou. Compare as versões antes de salvar novamente."
        : status === 403
          ? "Operação indisponível para esta sessão ou para este ambiente."
          : status === 422
            ? "Revise os campos e as dependências deste registro."
            : "O catálogo está temporariamente indisponível. Suas alterações foram preservadas.",
    );
  }
}

function fail(error: { code?: string; details?: string } | null) {
  if (!error) return;
  const code = error.code ?? "unavailable";
  const status = ["40001", "23505", "PT409"].includes(code)
    ? 409
    : ["42501", "PT403"].includes(code)
      ? 403
      : ["22023", "23514", "23502", "22P02"].includes(code)
        ? 422
        : 503;
  let conflict: CatalogConflictDetail | null = null;
  if (status === 409 && error.details) {
    try {
      const parsed = ConflictDetailSchema.safeParse(JSON.parse(error.details));
      if (parsed.success) conflict = parsed.data;
    } catch {
      /* Never render untrusted database details. */
    }
  }
  throw new CatalogWorkspaceError(status, code, conflict);
}

/** PostgREST carries the current user JWT; all authorization and writes remain in RLS/RPC. */
export async function readCatalogWorkspace() {
  const environment = cmsEnvironment();
  if (environment === "production") throw new CatalogWorkspaceError(403, "production_gated");
  const { data, error } = await supabase.rpc("cms_catalog_workspace", { p_environment: environment });
  fail(error);
  const parsed = CatalogWorkspaceSchema.safeParse(data);
  if (!parsed.success) throw new CatalogWorkspaceError(503, "response_invalid");
  return parsed.data;
}

export async function executeCatalogWorkspaceCommand(command: CatalogWorkspaceCommand) {
  const environment = cmsEnvironment();
  if (environment === "production") throw new CatalogWorkspaceError(403, "production_gated");
  const body = CatalogWorkspaceCommandSchema.parse(command);
  const { error } = await supabase.rpc("cms_catalog_workspace_command", {
    p_environment: environment,
    p_command: body,
    p_correlation_id: crypto.randomUUID(),
  });
  fail(error);
  // Never retry a mutation automatically. Version conflicts are resolved by the operator.
}

const HistorySchema = z
  .array(
    z
      .object({
        revision: z.number().int().positive(),
        state: CatalogWorkspaceProductSchema.nullable(),
        changedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
  )
  .max(100);
export async function readCatalogProductHistory(id: string) {
  if (cmsEnvironment() === "production") throw new CatalogWorkspaceError(403, "production_gated");
  const { data, error } = await supabase.rpc("cms_catalog_product_history", {
    p_environment: cmsEnvironment(),
    p_product_id: z.uuid().parse(id),
  });
  fail(error);
  const parsed = HistorySchema.safeParse(data);
  if (!parsed.success) throw new CatalogWorkspaceError(503, "response_invalid");
  return parsed.data;
}
export async function readCatalogEditorialWorkspace() {
  if (cmsEnvironment() === "production") throw new CatalogWorkspaceError(403, "production_gated");
  const { data, error } = await supabase.rpc("cms_catalog_editorial_workspace", {
    p_environment: cmsEnvironment(),
  });
  fail(error);
  const parsed = z.array(CatalogEditorialRevisionSchema).max(200).safeParse(data);
  if (!parsed.success) throw new CatalogWorkspaceError(503, "response_invalid");
  return parsed.data;
}
export async function executeCatalogEditorialCommand(command: CatalogEditorialCommand) {
  if (cmsEnvironment() === "production") throw new CatalogWorkspaceError(403, "production_gated");
  const { error } = await supabase.rpc("cms_catalog_editorial_command", {
    p_environment: cmsEnvironment(),
    p_command: CatalogEditorialCommandSchema.parse(command),
    p_correlation_id: crypto.randomUUID(),
  });
  fail(error);
}
