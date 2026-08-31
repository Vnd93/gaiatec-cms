import type { DraftBackupState } from "../hooks/useDraftBackup";

const time = (value: string | null) =>
  value ? new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

export function DraftBackupNotice<T>({ backup }: { backup: DraftBackupState<T> }) {
  if (backup.recoverable) {
    return (
      <div className="admin-draft-recovery" role="status">
        <div>
          <strong>Cópia automática recuperável</strong>
          <span>
            Salva nesta sessão às {time(backup.recoverable.savedAt)}. Restaure somente se reconhecer as
            alterações.
          </span>
        </div>
        <div className="admin-actions">
          <button type="button" className="admin-button admin-button--secondary" onClick={backup.discard}>
            Descartar cópia
          </button>
          <button type="button" className="admin-button" onClick={backup.restore}>
            Restaurar alterações
          </button>
        </div>
      </div>
    );
  }
  return (
    <span className="admin-draft-indicator" aria-live="polite">
      {backup.state === "saving" && "Criando cópia automática…"}
      {backup.state === "saved" && `Cópia automática salva às ${time(backup.lastSavedAt)}`}
      {backup.state === "restored" && "Cópia restaurada; salve para confirmar"}
      {backup.state === "unavailable" && "Cópia automática indisponível neste navegador"}
      {backup.state === "idle" && "Cópia automática pronta"}
    </span>
  );
}
