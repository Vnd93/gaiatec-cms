const archivableStates = new Set(["draft", "in_review", "approved", "scheduled", "published"]);

export function EditorialArchiveAction({
  state,
  entityLabel,
  article = "O",
  allowed,
  busy,
  onArchive,
}: {
  state: string;
  entityLabel: string;
  article?: "O" | "A";
  allowed: boolean;
  busy: boolean;
  onArchive(): void;
}) {
  if (!allowed || !archivableStates.has(state)) return null;

  const published = state === "published";
  const label = published ? `Despublicar e arquivar ${entityLabel}` : `Arquivar ${entityLabel}`;
  const consequence = published
    ? `${article} ${entityLabel} sairá do site público e continuará preservado no histórico e na auditoria.`
    : `${article} ${entityLabel} continuará preservado no histórico e na auditoria.`;

  return (
    <button
      type="button"
      className="admin-danger-link"
      disabled={busy}
      title="Esta ação exige permissão de publicação e uma sessão confirmada com MFA."
      onClick={() => {
        if (!window.confirm(`${label}? ${consequence}`)) return;
        onArchive();
      }}
    >
      {label}
    </button>
  );
}
