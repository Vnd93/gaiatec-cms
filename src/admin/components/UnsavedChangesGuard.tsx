import { useEffect } from "react";
import { useBlocker } from "react-router";
import { ConfirmDialog } from "./AdminUI";

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

  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title="Sair sem salvar?"
      description="As alterações feitas nesta tela serão perdidas. Você pode continuar editando ou sair mesmo assim."
      confirmLabel="Sair sem salvar"
      cancelLabel="Continuar editando"
      dangerous
      onCancel={() => blocker.state === "blocked" && blocker.reset()}
      onConfirm={() => blocker.state === "blocked" && blocker.proceed()}
    />
  );
}
