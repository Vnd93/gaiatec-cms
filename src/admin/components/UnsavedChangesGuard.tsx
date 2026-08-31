import { useEffect } from "react";
import { useBlocker } from "react-router";

export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      `${currentLocation.pathname}${currentLocation.search}` !==
        `${nextLocation.pathname}${nextLocation.search}`,
  );

  useEffect(() => {
    if (!dirty) return;
    const protectUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnload);
    return () => window.removeEventListener("beforeunload", protectUnload);
  }, [dirty]);

  if (blocker.state !== "blocked") return null;
  return (
    <div className="admin-dialog-backdrop" role="presentation">
      <section
        className="admin-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-description"
      >
        <p className="admin-eyebrow">ALTERAÇÕES NÃO SALVAS</p>
        <h2 id="unsaved-changes-title">Sair sem salvar?</h2>
        <p id="unsaved-changes-description">
          As alterações feitas nesta tela serão perdidas. Você pode continuar editando ou sair mesmo assim.
        </p>
        <div className="admin-confirm-dialog__actions">
          <button type="button" className="admin-button" autoFocus onClick={() => blocker.reset()}>
            Continuar editando
          </button>
          <button
            type="button"
            className="admin-button admin-button--danger"
            onClick={() => blocker.proceed()}
          >
            Sair sem salvar
          </button>
        </div>
      </section>
    </div>
  );
}
