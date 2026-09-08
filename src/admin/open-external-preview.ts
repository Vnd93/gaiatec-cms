import { operatorErrorMessage } from "./operator-error-message";

export type OpenExternalPreviewResult =
  { status: "opened"; url: string } | { status: "blocked"; url: string } | { status: "failed"; error: Error };

type PreviewWindow = Pick<Window, "close" | "document" | "location" | "opener">;

export async function openExternalAfterAsync(
  resolveUrl: () => Promise<string>,
  openWindow: () => Window | null = () => window.open("about:blank", "_blank"),
): Promise<OpenExternalPreviewResult> {
  const target = openWindow() as PreviewWindow | null;
  if (target) {
    target.opener = null;
    target.document.title = "Preparando visualização…";
    target.document.body.textContent = "Preparando a visualização segura. Aguarde…";
  }

  try {
    const url = await resolveUrl();
    if (!target) return { status: "blocked", url };
    target.location.replace(url);
    return { status: "opened", url };
  } catch (caught) {
    const error = new Error(
      operatorErrorMessage(caught, {
        fallback: "Não foi possível preparar a visualização.",
      }),
    );
    if (target) {
      target.document.title = "Visualização indisponível";
      target.document.body.textContent = `${error.message} Feche esta aba e tente novamente.`;
      window.setTimeout(() => target.close(), 8_000);
    }
    return { status: "failed", error };
  }
}

export function popupBlockedMessage(url: string): string {
  return `O navegador bloqueou a nova aba. Use o link de visualização disponível abaixo: ${url}`;
}
