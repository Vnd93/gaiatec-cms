import { useCallback, useEffect, useRef, useState } from "react";
import { CmsFormVersionSchema } from "@/shared/contracts/cms-content";
import { leadCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { EditorialArchiveAction } from "../components/EditorialArchiveAction";
import { Badge, ErrorState, RecordDrawer } from "../components/AdminUI";
import { UnsavedChangesGuard } from "../components/UnsavedChangesGuard";
import { urlSegmentFromText } from "../url-segment";

type FormRow = {
  id: string;
  form_key: string;
  title: string;
  purpose: string;
  status: string;
  active_version_id: string | null;
  lock_version: number;
  cms_form_versions: Array<{
    id: string;
    version: number;
    status: string;
    definition: { fields?: Field[]; successMessage?: string; submitLabel?: string };
    consent_text: string;
    consent_version: string;
    privacy_path: string;
    sla_minutes: number;
    retention_days: number;
  }>;
};
type Field = {
  id: string;
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "checkbox" | "hidden";
  required: boolean;
  maxLength?: number;
  options: string[];
  personalData: boolean;
  order: number;
};
const newField = (): Field => ({
  id: crypto.randomUUID(),
  key: "",
  label: "",
  type: "text",
  required: false,
  maxLength: 200,
  options: [],
  personalData: false,
  order: 0,
});

const corporatePrivacyPath = "/politica-de-privacidade";

type FormDraft = {
  key: string;
  title: string;
  purpose: string;
  fields: Field[];
  consentText: string;
  consentVersion: string;
  privacyPath: string;
  slaMinutes: number | "";
  retentionDays: number | "";
  submitLabel: string;
  successMessage: string;
  reason: string;
};

function createEmptyFormDraft(): FormDraft {
  return {
    key: "",
    title: "",
    purpose: "",
    fields: [newField()],
    consentText: "",
    consentVersion: "",
    privacyPath: corporatePrivacyPath,
    slaMinutes: "",
    retentionDays: "",
    submitLabel: "",
    successMessage: "",
    reason: "",
  };
}

function formDraftFingerprint(draft: FormDraft) {
  return JSON.stringify(draft);
}

const formStatusLabels: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicado",
  retired: "Retirado",
  archived: "Arquivado",
};

function normalizedFields(fields: Field[]): Field[] {
  const used = new Set<string>();
  return fields.map((field, index) => {
    const base = field.key || urlSegmentFromText(field.label, 100) || `campo-${index + 1}`;
    let key = base;
    let suffix = 2;
    while (used.has(key)) key = `${base}-${suffix++}`;
    used.add(key);
    return { ...field, key, order: index };
  });
}

export default function AdminFormsPage() {
  const { session, profile } = useAdminAuth();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [forms, setForms] = useState<FormRow[]>([]),
    [selected, setSelected] = useState<FormRow | null>(null),
    [previewed, setPreviewed] = useState<FormRow | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [key, setKey] = useState(""),
    [title, setTitle] = useState(""),
    [purpose, setPurpose] = useState(""),
    [fields, setFields] = useState<Field[]>([newField()]),
    [consentText, setConsentText] = useState(""),
    [consentVersion, setConsentVersion] = useState(""),
    [privacyPath, setPrivacyPath] = useState(corporatePrivacyPath),
    [slaMinutes, setSlaMinutes] = useState<number | "">(""),
    [retentionDays, setRetentionDays] = useState<number | "">(""),
    [submitLabel, setSubmitLabel] = useState(""),
    [successMessage, setSuccessMessage] = useState(""),
    [reason, setReason] = useState(""),
    [lifecycleReason, setLifecycleReason] = useState("");
  const currentDraft: FormDraft = {
    key,
    title,
    purpose,
    fields,
    consentText,
    consentVersion,
    privacyPath,
    slaMinutes,
    retentionDays,
    submitLabel,
    successMessage,
    reason,
  };
  const currentFingerprint = formDraftFingerprint(currentDraft);
  const [cleanFingerprint, setCleanFingerprint] = useState(currentFingerprint);
  const dirty = currentFingerprint !== cleanFingerprint;
  const applyDraft = useCallback((next: FormDraft) => {
    setKey(next.key);
    setTitle(next.title);
    setPurpose(next.purpose);
    setFields(next.fields);
    setConsentText(next.consentText);
    setConsentVersion(next.consentVersion);
    setPrivacyPath(next.privacyPath);
    setSlaMinutes(next.slaMinutes);
    setRetentionDays(next.retentionDays);
    setSubmitLabel(next.submitLabel);
    setSuccessMessage(next.successMessage);
    setReason(next.reason);
    setCleanFingerprint(formDraftFingerprint(next));
  }, []);
  const choose = useCallback(
    (form: FormRow) => {
      const version = form.cms_form_versions.slice().sort((a, b) => b.version - a.version)[0];
      setSelected(form);
      setLifecycleReason("");
      applyDraft({
        key: form.form_key,
        title: form.title,
        purpose: form.purpose,
        fields: version?.definition.fields ?? [newField()],
        consentText: version?.consent_text ?? "",
        consentVersion: version?.consent_version ?? "",
        privacyPath: version?.privacy_path ?? corporatePrivacyPath,
        slaMinutes: version?.sla_minutes ?? "",
        retentionDays: version?.retention_days ?? "",
        submitLabel: version?.definition.submitLabel ?? "",
        successMessage: version?.definition.successMessage ?? "",
        reason: "",
      });
    },
    [applyDraft],
  );
  const load = useCallback(
    async (editorId?: string) => {
      setError("");
      const activeSession = sessionRef.current;
      if (!activeSession) return [];
      let loaded: FormRow[];
      try {
        const result = await leadCommand<{ items: FormRow[] }>(activeSession, {
          action: "list_forms",
          limit: 500,
        });
        loaded = result.items ?? [];
      } catch {
        setError("A lista de formulários não respondeu. Verifique sua sessão e tente carregar novamente.");
        return [];
      }
      setForms(loaded);
      setSelected((current) => loaded.find((form) => form.id === current?.id) ?? current);
      setPreviewed((current) => loaded.find((form) => form.id === current?.id) ?? current);
      const editor = editorId ? loaded.find((form) => form.id === editorId) : undefined;
      if (editor) choose(editor);
      return loaded;
    },
    [choose],
  );
  useEffect(() => {
    void load();
  }, [load]);
  function confirmDraftReplacement() {
    return (
      !dirty ||
      window.confirm(
        "Descartar as alterações não salvas? Esta ação substituirá o formulário que está em edição.",
      )
    );
  }
  function startNewForm() {
    if (!confirmDraftReplacement()) return;
    setSelected(null);
    setPreviewed(null);
    setLifecycleReason("");
    applyDraft(createEmptyFormDraft());
  }
  function chooseForEditing(form: FormRow) {
    if (!confirmDraftReplacement()) return false;
    choose(form);
    return true;
  }
  async function save() {
    if (!session || !canEdit) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const resolvedKey = key || urlSegmentFromText(title, 100) || "formulario";
      const resolvedFields = normalizedFields(fields);
      const preview = {
        schemaVersion: 1 as const,
        formId: selected?.id ?? crypto.randomUUID(),
        versionId: crypto.randomUUID(),
        version: 1,
        key: resolvedKey,
        title,
        purpose,
        fields: resolvedFields,
        consent: { required: true as const, text: consentText, version: consentVersion, privacyPath },
        slaMinutes,
        retentionDays,
        successMessage,
        submitLabel,
        status: "draft" as const,
      };
      const parsed = CmsFormVersionSchema.safeParse(preview);
      if (!parsed.success)
        throw new Error("Revise os campos, o consentimento, o prazo de atendimento e a retenção.");
      const result = await leadCommand<{
        formId: string;
        versionId: string;
        version: number;
        correlationId: string;
      }>(session, {
        action: "save_form",
        formId: selected?.id ?? null,
        expectedLockVersion: selected?.lock_version ?? null,
        formKey: resolvedKey,
        title,
        purpose,
        definition: { fields: resolvedFields, successMessage, submitLabel },
        consentText,
        consentVersion,
        privacyPath,
        slaMinutes: parsed.data.slaMinutes,
        retentionDays: parsed.data.retentionDays,
        reason,
      });
      setMessage(`Versão ${result.version} salva e registrada na auditoria.`);
      const loaded = await load(result.formId);
      if (!loaded.some((form) => form.id === result.formId)) setCleanFingerprint(currentFingerprint);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar formulário.");
    } finally {
      setBusy(false);
    }
  }
  async function publish(versionId: string) {
    if (!session || !selected || !canEdit) return;
    setBusy(true);
    setError("");
    try {
      await leadCommand(session, {
        action: "publish_form",
        formId: selected.id,
        versionId,
        expectedLockVersion: selected.lock_version,
      });
      setMessage("Versão publicada e disponível para campanhas aprovadas.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao publicar.");
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!session || !selected || !canEdit) return;
    if (lifecycleReason.trim().length < 3) {
      setError("Informe o motivo da retirada com pelo menos 3 caracteres.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await leadCommand(session, {
        action: "archive_form",
        formId: selected.id,
        expectedLockVersion: selected.lock_version,
        reason: lifecycleReason,
      });
      setMessage(
        `${selected.status === "published" ? "Formulário despublicado e arquivado" : "Formulário arquivado"}. A alteração foi registrada na auditoria.`,
      );
      setLifecycleReason("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao retirar o formulário.");
    } finally {
      setBusy(false);
    }
  }
  async function restore(sourceVersionId: string) {
    if (!session || !selected || !canEdit) return;
    if (lifecycleReason.trim().length < 3) {
      setError("Informe o motivo da restauração com pelo menos 3 caracteres.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await leadCommand<{
        status: string;
        lockVersion: number;
        correlationId: string;
      }>(session, {
        action: "restore_form",
        formId: selected.id,
        sourceVersionId,
        expectedLockVersion: selected.lock_version,
        reason: lifecycleReason,
      });
      setMessage(
        `${result.status === "published" ? "Versão restaurada e republicada" : "Formulário reaberto como rascunho"}. A alteração foi registrada na auditoria.`,
      );
      setLifecycleReason("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao restaurar o formulário.");
    } finally {
      setBusy(false);
    }
  }
  const canEdit = profile?.permissions.includes("cms:forms.edit"),
    canPublish = profile?.permissions.includes("cms:forms.publish");
  return (
    <section>
      <UnsavedChangesGuard dirty={dirty && !busy} />
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">MARKETING · FORMULÁRIOS</p>
          <h1>Formulários versionados</h1>
          <p className="admin-help">Definição, consentimento, SLA e retenção ficam congelados por versão.</p>
        </div>
        {canEdit && (
          <button className="admin-button" type="button" disabled={busy} onClick={startNewForm}>
            Novo formulário
          </button>
        )}
      </div>
      {error && (
        <ErrorState
          title="Não foi possível carregar os formulários"
          description={error}
          action={
            <button
              className="admin-button admin-button--secondary"
              type="button"
              onClick={() => void load()}
            >
              Tentar novamente
            </button>
          }
        />
      )}
      {message && (
        <p className="admin-notice admin-notice--success" role="status">
          {message}
        </p>
      )}
      <div className="admin-editor-grid">
        <aside className="admin-workflow">
          <h2>Definições</h2>
          {forms.length === 0 ? (
            <p>Nenhum formulário novo cadastrado.</p>
          ) : (
            forms.map((form) => (
              <button key={form.id} type="button" onClick={() => setPreviewed(form)}>
                <strong>{form.title}</strong>
                <br />
                <small>
                  {formStatusLabels[form.status] ?? "Estado indisponível"} · {form.cms_form_versions.length}{" "}
                  versão(ões)
                </small>
              </button>
            ))
          )}
        </aside>
        <form
          className="admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            Título
            <input
              required
              maxLength={180}
              value={title}
              disabled={!canEdit || busy}
              onChange={(event) => {
                const nextTitle = event.target.value;
                const previousGenerated = urlSegmentFromText(title, 100);
                setTitle(nextTitle);
                if (!selected && (!key || key === previousGenerated))
                  setKey(urlSegmentFromText(nextTitle, 100));
              }}
            />
          </label>
          <label>
            Finalidade
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={purpose}
              disabled={!canEdit || busy}
              onChange={(event) => setPurpose(event.target.value)}
            />
          </label>
          <fieldset disabled={!canEdit || busy}>
            <legend>Campos</legend>
            {fields.map((field, index) => (
              <div className="admin-inline-fields" key={field.id}>
                <label>
                  Rótulo
                  <input
                    required
                    maxLength={120}
                    value={field.label}
                    onChange={(e) =>
                      setFields((current) =>
                        current.map((item, i) => {
                          if (i !== index) return item;
                          const nextLabel = e.target.value;
                          const previousGenerated = urlSegmentFromText(item.label, 100);
                          return {
                            ...item,
                            label: nextLabel,
                            key:
                              !item.key || item.key === previousGenerated
                                ? urlSegmentFromText(nextLabel, 100)
                                : item.key,
                          };
                        }),
                      )
                    }
                  />
                </label>
                <label>
                  Tipo
                  <select
                    value={field.type}
                    onChange={(e) =>
                      setFields((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, type: e.target.value as Field["type"] } : item,
                        ),
                      )
                    }
                  >
                    <option value="text">Texto</option>
                    <option value="email">E-mail</option>
                    <option value="tel">Telefone</option>
                    <option value="textarea">Texto longo</option>
                    <option value="select">Seleção</option>
                    <option value="checkbox">Caixa de seleção</option>
                    <option value="hidden">Campo interno, não exibido</option>
                  </select>
                </label>
                {field.type === "select" && (
                  <fieldset className="admin-semantic-editor">
                    <legend>Opções de resposta</legend>
                    {(field.options.length ? field.options : [""]).map((option, optionIndex) => (
                      <div className="admin-inline-fields" key={`${field.id}-option-${optionIndex}`}>
                        <label>
                          {optionIndex === 0 ? "Opção" : `Opção ${optionIndex + 1}`}
                          <input
                            maxLength={120}
                            value={option}
                            onChange={(event) =>
                              setFields((current) =>
                                current.map((item, currentIndex) => {
                                  if (currentIndex !== index) return item;
                                  const options = item.options.length ? [...item.options] : [""];
                                  options[optionIndex] = event.target.value;
                                  return { ...item, options };
                                }),
                              )
                            }
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setFields((current) =>
                              current.map((item, currentIndex) =>
                                currentIndex === index
                                  ? {
                                      ...item,
                                      options:
                                        item.options.length <= 1
                                          ? []
                                          : item.options.filter((_, current) => current !== optionIndex),
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          Remover opção
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={field.options.length >= 50}
                      onClick={() =>
                        setFields((current) =>
                          current.map((item, currentIndex) =>
                            currentIndex === index
                              ? { ...item, options: item.options.length ? [...item.options, ""] : ["", ""] }
                              : item,
                          ),
                        )
                      }
                    >
                      Adicionar opção
                    </button>
                  </fieldset>
                )}
                <label>
                  Limite
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={field.maxLength ?? 200}
                    onChange={(e) =>
                      setFields((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, maxLength: Number(e.target.value) } : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) =>
                      setFields((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, required: e.target.checked } : item,
                        ),
                      )
                    }
                  />{" "}
                  Obrigatório
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={field.personalData}
                    onChange={(e) =>
                      setFields((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, personalData: e.target.checked } : item,
                        ),
                      )
                    }
                  />{" "}
                  Dado pessoal
                </label>
                <button
                  type="button"
                  onClick={() => setFields((current) => current.filter((_, i) => i !== index))}
                >
                  Remover
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setFields((current) => [...current, { ...newField(), order: current.length }])}
            >
              Adicionar campo
            </button>
          </fieldset>
          <label>
            Texto do consentimento
            <textarea
              required
              minLength={3}
              maxLength={2000}
              value={consentText}
              disabled={!canEdit || busy}
              onChange={(e) => setConsentText(e.target.value)}
            />
          </label>
          <label>
            Versão do consentimento
            <input
              required
              maxLength={80}
              value={consentVersion}
              disabled={!canEdit || busy}
              onChange={(e) => setConsentVersion(e.target.value)}
            />
          </label>
          <label>
            Política de privacidade
            <select
              required
              value={privacyPath}
              disabled={!canEdit || busy}
              onChange={(e) => setPrivacyPath(e.target.value)}
            >
              <option value={corporatePrivacyPath}>Política de privacidade da GAIATEC</option>
              {privacyPath !== corporatePrivacyPath && (
                <option value={privacyPath}>Política vinculada anteriormente</option>
              )}
            </select>
          </label>
          <div className="admin-inline-fields">
            <label>
              Prazo de atendimento (minutos)
              <input
                type="number"
                min={5}
                max={525600}
                value={slaMinutes}
                disabled={!canEdit || busy}
                onChange={(e) => setSlaMinutes(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </label>
            <label>
              Retenção (dias)
              <input
                type="number"
                min={1}
                max={3650}
                value={retentionDays}
                disabled={!canEdit || busy}
                onChange={(e) => setRetentionDays(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </label>
          </div>
          <label>
            Botão
            <input
              required
              maxLength={120}
              value={submitLabel}
              disabled={!canEdit || busy}
              onChange={(e) => setSubmitLabel(e.target.value)}
            />
          </label>
          <label>
            Confirmação
            <textarea
              required
              maxLength={500}
              value={successMessage}
              disabled={!canEdit || busy}
              onChange={(e) => setSuccessMessage(e.target.value)}
            />
          </label>
          <label>
            Motivo
            <input
              required
              minLength={3}
              maxLength={500}
              value={reason}
              disabled={!canEdit || busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {canEdit && (
            <button className="admin-button" disabled={busy}>
              Salvar nova versão
            </button>
          )}
          {selected && canPublish && (
            <fieldset disabled={!canEdit || busy}>
              <legend>Publicação</legend>
              <label>
                Motivo da retirada ou restauração
                <input
                  minLength={3}
                  maxLength={500}
                  value={lifecycleReason}
                  disabled={!canEdit || busy}
                  onChange={(event) => setLifecycleReason(event.target.value)}
                  aria-describedby="form-lifecycle-reason-help"
                />
                <small id="form-lifecycle-reason-help">
                  Obrigatório para retirar ou restaurar; será preservado na auditoria.
                </small>
              </label>
              {selected.cms_form_versions
                .slice()
                .sort((a, b) => b.version - a.version)
                .map((version) => {
                  const canRestore =
                    selected.status === "retired" &&
                    (version.status === "retired" || version.status === "draft");
                  return (
                    <div className="admin-inline-actions" key={version.id}>
                      <button
                        type="button"
                        disabled={
                          !canEdit || busy || version.status !== "draft" || selected.status === "retired"
                        }
                        onClick={() => void publish(version.id)}
                      >
                        Versão {version.version} · {formStatusLabels[version.status] ?? "Estado indisponível"}
                      </button>
                      {canRestore && (
                        <button
                          type="button"
                          className="admin-button admin-button--secondary"
                          disabled={!canEdit || busy}
                          onClick={() => {
                            const consequence =
                              version.status === "retired"
                                ? "A versão voltará a receber leads no site público."
                                : "O formulário será reaberto como rascunho privado.";
                            if (!window.confirm(`Restaurar versão ${version.version}? ${consequence}`))
                              return;
                            void restore(version.id);
                          }}
                        >
                          {version.status === "retired"
                            ? `Restaurar versão ${version.version} e publicar`
                            : `Reabrir versão ${version.version} como rascunho`}
                        </button>
                      )}
                    </div>
                  );
                })}
            </fieldset>
          )}
          {selected && (
            <EditorialArchiveAction
              state={selected.status}
              entityLabel="formulário"
              allowed={Boolean(canEdit && canPublish)}
              busy={busy}
              onArchive={() => void archive()}
            />
          )}
        </form>
      </div>
      <RecordDrawer
        open={Boolean(previewed)}
        eyebrow="FORMULÁRIO"
        title={previewed?.title ?? ""}
        address={previewed?.purpose || "Formulário versionado"}
        status={
          <Badge tone={previewed?.status === "published" ? "success" : "neutral"}>
            {formStatusLabels[previewed?.status ?? ""] ?? "Estado indisponível"}
          </Badge>
        }
        fields={[
          { label: "Versões", value: previewed?.cms_form_versions.length ?? 0 },
          {
            label: "Versão ativa",
            value:
              previewed?.cms_form_versions.find((version) => version.id === previewed.active_version_id)
                ?.version ?? "Não publicada",
          },
          { label: "Consentimento", value: "LGPD versionado" },
        ]}
        summary={previewed?.purpose}
        primary={
          <button
            className="admin-button"
            type="button"
            onClick={() => {
              if (previewed && chooseForEditing(previewed)) setPreviewed(null);
            }}
          >
            Ver ficha completa
          </button>
        }
        onClose={() => setPreviewed(null)}
      />
    </section>
  );
}
