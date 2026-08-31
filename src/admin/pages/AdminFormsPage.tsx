import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CmsFormVersionSchema } from "@/shared/contracts/cms-content";
import { leadCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { ErrorState } from "../components/AdminUI";

type FormRow = {
  id: string;
  form_key: string;
  title: string;
  purpose: string;
  status: string;
  active_version_id: string | null;
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
  key: "campo-sintetico",
  label: "Campo sintético",
  type: "text",
  required: true,
  maxLength: 200,
  options: [],
  personalData: false,
  order: 0,
});

export default function AdminFormsPage() {
  const { session, profile } = useAdminAuth();
  const [forms, setForms] = useState<FormRow[]>([]),
    [selected, setSelected] = useState<FormRow | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [key, setKey] = useState("formulario-sintetico"),
    [title, setTitle] = useState("Formulário sintético descartável"),
    [purpose, setPurpose] = useState("Validar localmente o contrato versionado sem dados reais."),
    [fields, setFields] = useState<Field[]>([newField()]),
    [consentText, setConsentText] = useState(
      "Aceito o tratamento dos dados sintéticos para esta validação local.",
    ),
    [consentVersion, setConsentVersion] = useState("sintetico-v1"),
    [privacyPath, setPrivacyPath] = useState("/politica-de-privacidade"),
    [slaMinutes, setSlaMinutes] = useState(60),
    [retentionDays, setRetentionDays] = useState(30),
    [submitLabel, setSubmitLabel] = useState("Enviar teste"),
    [successMessage, setSuccessMessage] = useState("Solicitação sintética recebida."),
    [reason, setReason] = useState("Nova versão sintética para validação da Fase 7");
  const load = () => {
    setError("");
    return supabase
      .from("cms_form_definitions")
      .select(
        "id,form_key,title,purpose,status,active_version_id,cms_form_versions!cms_form_versions_form_id_fkey(id,version,status,definition,consent_text,consent_version,privacy_path,sla_minutes,retention_days)",
      )
      .order("updated_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError)
          setError("A lista de formulários não respondeu. Verifique sua sessão e tente carregar novamente.");
        else setForms((data ?? []) as unknown as FormRow[]);
      });
  };
  useEffect(() => {
    void load();
  }, []);
  function choose(form: FormRow) {
    const version = form.cms_form_versions.slice().sort((a, b) => b.version - a.version)[0];
    setSelected(form);
    setKey(form.form_key);
    setTitle(form.title);
    setPurpose(form.purpose);
    if (version) {
      setFields(version.definition.fields ?? [newField()]);
      setConsentText(version.consent_text);
      setConsentVersion(version.consent_version);
      setPrivacyPath(version.privacy_path);
      setSlaMinutes(version.sla_minutes);
      setRetentionDays(version.retention_days);
      setSubmitLabel(version.definition.submitLabel ?? "Enviar");
      setSuccessMessage(version.definition.successMessage ?? "Recebemos sua solicitação.");
    }
  }
  async function save() {
    if (!session) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const preview = {
        schemaVersion: 1 as const,
        formId: selected?.id ?? crypto.randomUUID(),
        versionId: crypto.randomUUID(),
        version: 1,
        key,
        title,
        purpose,
        fields,
        consent: { required: true as const, text: consentText, version: consentVersion, privacyPath },
        slaMinutes,
        retentionDays,
        successMessage,
        submitLabel,
        status: "draft" as const,
      };
      if (!CmsFormVersionSchema.safeParse(preview).success)
        throw new Error("Revise campos, consentimento, SLA e retenção.");
      const result = await leadCommand<{
        formId: string;
        versionId: string;
        version: number;
        correlationId: string;
      }>(session, {
        action: "save_form",
        formId: selected?.id ?? null,
        formKey: key,
        title,
        purpose,
        definition: { fields, successMessage, submitLabel },
        consentText,
        consentVersion,
        privacyPath,
        slaMinutes,
        retentionDays,
        reason,
      });
      setMessage(`Versão ${result.version} salva. Código ${result.correlationId.slice(0, 8)}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar formulário.");
    } finally {
      setBusy(false);
    }
  }
  async function publish(versionId: string) {
    if (!session || !selected) return;
    setBusy(true);
    setError("");
    try {
      await leadCommand(session, { action: "publish_form", formId: selected.id, versionId });
      setMessage("Versão publicada e disponível para campanhas aprovadas.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao publicar.");
    } finally {
      setBusy(false);
    }
  }
  const canEdit = profile?.permissions.includes("cms:forms.edit"),
    canPublish = profile?.permissions.includes("cms:forms.publish");
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">MARKETING · FORMULÁRIOS</p>
          <h1>Formulários versionados</h1>
          <p className="admin-help">Definição, consentimento, SLA e retenção ficam congelados por versão.</p>
        </div>
        {canEdit && (
          <button
            className="admin-button"
            onClick={() => {
              setSelected(null);
              setKey(`formulario-sintetico-${Date.now()}`);
              setTitle("Formulário sintético descartável");
              setFields([newField()]);
            }}
          >
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
              <button key={form.id} onClick={() => choose(form)}>
                <strong>{form.title}</strong>
                <br />
                <small>
                  {form.status} · {form.cms_form_versions.length} versão(ões)
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
            Chave
            <input
              value={key}
              disabled={Boolean(selected) || busy}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
          <label>
            Título
            <input
              value={title}
              disabled={!canEdit || busy}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Finalidade
            <textarea
              value={purpose}
              disabled={!canEdit || busy}
              onChange={(event) => setPurpose(event.target.value)}
            />
          </label>
          <fieldset>
            <legend>Campos</legend>
            {fields.map((field, index) => (
              <div className="admin-inline-fields" key={field.id}>
                <label>
                  Chave
                  <input
                    value={field.key}
                    onChange={(e) =>
                      setFields((current) =>
                        current.map((item, i) => (i === index ? { ...item, key: e.target.value } : item)),
                      )
                    }
                  />
                </label>
                <label>
                  Rótulo
                  <input
                    value={field.label}
                    onChange={(e) =>
                      setFields((current) =>
                        current.map((item, i) => (i === index ? { ...item, label: e.target.value } : item)),
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
                    <option value="checkbox">Checkbox</option>
                    <option value="hidden">Oculto</option>
                  </select>
                </label>
                {field.type === "select" && (
                  <label>
                    Opções (uma por linha)
                    <textarea
                      value={field.options.join("\n")}
                      onChange={(e) =>
                        setFields((current) =>
                          current.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  options: e.target.value
                                    .split("\n")
                                    .map((value) => value.trim())
                                    .filter(Boolean),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
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
            <textarea value={consentText} onChange={(e) => setConsentText(e.target.value)} />
          </label>
          <label>
            Versão do consentimento
            <input value={consentVersion} onChange={(e) => setConsentVersion(e.target.value)} />
          </label>
          <label>
            Política de privacidade
            <input value={privacyPath} onChange={(e) => setPrivacyPath(e.target.value)} />
          </label>
          <div className="admin-inline-fields">
            <label>
              SLA (min)
              <input
                type="number"
                min={5}
                value={slaMinutes}
                onChange={(e) => setSlaMinutes(Number(e.target.value))}
              />
            </label>
            <label>
              Retenção (dias)
              <input
                type="number"
                min={1}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
              />
            </label>
          </div>
          <label>
            Botão
            <input value={submitLabel} onChange={(e) => setSubmitLabel(e.target.value)} />
          </label>
          <label>
            Confirmação
            <textarea value={successMessage} onChange={(e) => setSuccessMessage(e.target.value)} />
          </label>
          <label>
            Motivo
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {canEdit && (
            <button className="admin-button" disabled={busy}>
              Salvar nova versão
            </button>
          )}
          {selected && canPublish && (
            <fieldset>
              <legend>Publicação</legend>
              {selected.cms_form_versions
                .slice()
                .sort((a, b) => b.version - a.version)
                .map((version) => (
                  <button
                    type="button"
                    key={version.id}
                    disabled={busy || version.status === "published"}
                    onClick={() => void publish(version.id)}
                  >
                    Versão {version.version} · {version.status}
                  </button>
                ))}
            </fieldset>
          )}
        </form>
      </div>
    </section>
  );
}
