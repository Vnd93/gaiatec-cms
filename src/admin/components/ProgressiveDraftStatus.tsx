import type { ProgressiveDraftAutosaveState } from "../hooks/useProgressiveDraftAutosave";

const time = (value: string | null) =>
  value ? new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

export function ProgressiveDraftStatus<T extends object>({
  draft,
}: {
  draft: ProgressiveDraftAutosaveState<T>;
}) {
  if (draft.status === "disabled") return null;
  if (draft.recoverable) {
    return (
      <div className="admin-draft-recovery" role="status">
        <div>
          <strong>Rascunho recuperável no servidor</strong>
          <span>
            Sincronizado às {time(draft.recoverable.savedAt)}. Escolha qual versão deve continuar antes de
            editar.
          </span>
        </div>
        <div className="admin-actions">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={draft.keepLocalVersion}
          >
            Manter versão deste navegador
          </button>
          <button type="button" className="admin-button" onClick={draft.restoreServerVersion}>
            Restaurar versão do servidor
          </button>
        </div>
      </div>
    );
  }
  const isAlert = draft.status === "conflict" || draft.status === "error";
  return (
    <div className="admin-draft-indicator" role={isAlert ? "alert" : "status"} aria-live="polite">
      {draft.status === "checking" && "Verificando rascunhos progressivos…"}
      {draft.status === "creating" && "Criando rascunho privado…"}
      {draft.status === "idle" && "Rascunho progressivo pronto para sincronizar"}
      {draft.status === "syncing" && "Sincronizando alterações com o servidor…"}
      {draft.status === "saved" && `Rascunho salvo no servidor às ${time(draft.lastSavedAt)}`}
      {draft.status === "offline" &&
        "Sem conexão. A cópia local foi preservada e será sincronizada novamente."}
      {draft.status === "conflict" && (
        <>
          Existe uma versão mais recente no servidor
          {draft.currentVersion ? ` (versão ${draft.currentVersion})` : ""}. Nenhuma alteração foi
          sobrescrita.
        </>
      )}
      {draft.status === "error" && (
        <>
          Não foi possível sincronizar. A cópia local foi preservada.
          <button type="button" className="admin-button admin-button--secondary" onClick={draft.retry}>
            Tentar novamente
          </button>
        </>
      )}
    </div>
  );
}
