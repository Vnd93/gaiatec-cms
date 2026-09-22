import { expect, type Page, type Response } from "@playwright/test";

type CmsSessionSnapshot = Record<string, unknown> & {
  status?: unknown;
  mfaVerified?: unknown;
  accessGranted?: unknown;
};

function isMfaSessionResolution(response: Response, expectedOrigin: string) {
  const url = new URL(response.url());
  if (
    response.request().method() !== "POST" ||
    url.origin !== expectedOrigin ||
    url.pathname !== "/functions/v1/cms-session"
  ) {
    return false;
  }
  try {
    const body = response.request().postDataJSON() as Record<string, unknown>;
    return body.action === "mfa";
  } catch {
    return false;
  }
}

export async function submitCmsMfaAndAwaitReady(
  page: Page,
  expectedOrigin: string,
  trigger: () => Promise<void>,
) {
  const canonicalOrigin = new URL(expectedOrigin).origin;
  const resolution = page.waitForResponse((response) => isMfaSessionResolution(response, canonicalOrigin), {
    timeout: 30_000,
  });
  await trigger();
  const response = await resolution;
  const snapshot = (await response.json().catch(() => null)) as CmsSessionSnapshot | null;
  expect(response.status(), "cms-session/mfa precisa concluir no backend real").toBe(200);
  expect(snapshot).toMatchObject({ status: "active", mfaVerified: true, accessGranted: true });
  await expect(page).toHaveURL(/\/admin(?:\/?|\?.*)$/, { timeout: 20_000 });
  await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
  return { response, snapshot: snapshot! };
}
