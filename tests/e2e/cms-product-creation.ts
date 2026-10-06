import { expect, type Page } from "@playwright/test";
import { Ev2DraftCommandResultSchema, Ev2DraftCommandSchema } from "../../src/shared/contracts/ev2-draft";

// Only the isolated, same-run QA actor reaches this helper. Restore its private
// draft before filling: choosing the browser version would discard server work.
export async function prepareSyntheticProductDraft(page: Page) {
  const ready = page.locator(".admin-draft-indicator, .admin-draft-recovery", {
    hasText: /rascunho progressivo pronto|rascunho salvo no servidor|rascunho recuperável no servidor/i,
  });
  await expect(ready).toBeVisible({ timeout: 20_000 });
  const restore = page.getByRole("button", { name: "Restaurar versão do servidor", exact: true });
  if (await restore.isVisible()) {
    await restore.click();
    await expect(page.locator(".admin-draft-recovery")).toHaveCount(0);
  }
}

export function productPromotionReceipt(input: {
  status: number;
  request: unknown;
  response: unknown;
  environment: "local" | "staging" | "production";
}) {
  const command = Ev2DraftCommandSchema.safeParse(input.request);
  const receipt = Ev2DraftCommandResultSchema.safeParse(input.response);
  if (
    input.status < 200 ||
    input.status >= 300 ||
    !command.success ||
    command.data.action !== "promote" ||
    command.data.payload.contentType !== "product" ||
    command.data.envelope.actorContext.environment !== input.environment ||
    command.data.envelope.actorContext.siteKey !== "main" ||
    !receipt.success ||
    receipt.data.status !== "promoted" ||
    !receipt.data.itemId ||
    receipt.data.replayed ||
    receipt.data.commandId !== command.data.envelope.commandId ||
    receipt.data.correlationId !== command.data.envelope.correlationId ||
    receipt.data.draftId !== command.data.draftId ||
    receipt.data.lockVersion !== command.data.envelope.expectedVersion! + 1
  ) {
    // Never print a payload, backend message, actor, token or a raw Zod error.
    throw new Error("CMS_PRODUCT_PROMOTION_RECEIPT_INVALID");
  }
  return receipt.data.itemId;
}

export async function clickSyntheticProductCreation(
  page: Page,
  expectedApiOrigin: string,
  environment: "local" | "staging" | "production",
) {
  await expect(page.locator(".admin-draft-recovery")).toHaveCount(0);
  // Await this exact edit's autosave, not an arbitrary sleep or a previous save.
  const context = page.locator(".admin-editor-context");
  await expect(context).toBeVisible();
  await expect(context).not.toContainText("Alterações não salvas", {
    timeout: 20_000,
  });
  const responsePromise = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      if (
        url.origin !== expectedApiOrigin ||
        url.pathname !== "/functions/v1/cms-drafts-v2" ||
        response.request().method() !== "POST"
      )
        return false;
      try {
        return response.request().postDataJSON()?.action === "promote";
      } catch {
        return false;
      }
    },
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).first().click();
  const response = await responsePromise;
  const itemId = productPromotionReceipt({
    status: response.status(),
    request: response.request().postDataJSON(),
    response: await response.json().catch(() => null),
    environment,
  });
  return {
    itemId,
    evidence: {
      step: "promote",
      result: "passed" as const,
      backendStatus: "promoted",
      httpStatus: response.status(),
    },
  };
}
