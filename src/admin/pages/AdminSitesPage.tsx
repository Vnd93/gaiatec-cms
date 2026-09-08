import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Globe2, LockKeyhole, Plus, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import {
  Ev2SiteMutationResultSchema,
  Ev2SiteRegistrySchema,
  Ev2SitesCapabilityResultSchema,
  type Ev2SiteSummary,
} from "@/shared/contracts/ev2-visual";
import { sitesCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { cmsEnvironment, isEv2FeatureEnabled } from "../ev2-runtime";
import { urlSegmentFromText } from "../url-segment";
import { operatorErrorMessage } from "../operator-error-message";
import "../admin-visual-studio.css";

const CMS_ENVIRONMENT = cmsEnvironment();
const defaultTokens = [
  { key: "color.brand", kind: "color" as const, value: "#0057de" },
  { key: "color.text", kind: "color" as const, value: "#13233a" },
  { key: "color.surface", kind: "color" as const, value: "#ffffff" },
  { key: "space.section", kind: "space" as const, value: "clamp(3rem,7vw,7rem)" },
  { key: "radius.card", kind: "radius" as const, value: "1rem" },
  { key: "type.body", kind: "type" as const, value: "Montserrat, sans-serif" },
];

const siteStatusLabels: Record<Ev2SiteSummary["status"], string> = {
  pilot: "Em preparação",
  active: "Ativo",
  suspended: "Suspenso",
  archived: "Arquivado",
};
const environmentLabels = { local: "Local", staging: "Homologação", production: "Produção" } as const;
const environmentStatusLabels = { active: "Ativo", locked: "Bloqueado" } as const;
const tokenLabels: Record<string, string> = {
  "color.brand": "Cor principal",
  "color.text": "Cor do texto",
  "color.surface": "Cor de fundo",
  "space.section": "Espaçamento entre seções",
  "radius.card": "Formato dos cartões",
  "type.body": "Fonte dos textos",
};
const tokenChoices: Record<string, Array<{ value: string; label: string }>> = {
  "space.section": [
    { value: "clamp(2rem,5vw,4rem)", label: "Compacto" },
    { value: "clamp(3rem,7vw,7rem)", label: "Confortável" },
    { value: "clamp(4rem,9vw,9rem)", label: "Amplo" },
  ],
  "radius.card": [
    { value: "0.25rem", label: "Discreto" },
    { value: "1rem", label: "Arredondado" },
    { value: "1.5rem", label: "Muito arredondado" },
  ],
  "type.body": [
    { value: "Montserrat, sans-serif", label: "Montserrat" },
    { value: "Arial, sans-serif", label: "Arial" },
    { value: "Georgia, serif", label: "Georgia" },
  ],
};

function envelope() {
  return {
    schemaVersion: 1 as const,
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: CMS_ENVIRONMENT, siteKey: "main" as const },
  };
}

export default function AdminSitesPage() {
  const { session, profile } = useAdminAuth();
  const candidateEnabled = isEv2FeatureEnabled(profile, "ev2.multisite");
  const [capability, setCapability] = useState<"checking" | "enabled" | "disabled" | "error">(
    candidateEnabled ? "checking" : "disabled",
  );
  const [sites, setSites] = useState<Ev2SiteSummary[]>([]);
  const [selectedKey, setSelectedKey] = useState("main");
  const [newName, setNewName] = useState("");
  const [newPurpose, setNewPurpose] = useState("Validação isolada de um novo site");
  const [hostnameLabel, setHostnameLabel] = useState("");
  const [tokens, setTokens] = useState(defaultTokens);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const canManage = profile?.permissions.includes("cms:sites.manage") ?? false;
  const selected = useMemo(() => sites.find((site) => site.key === selectedKey), [selectedKey, sites]);
  const newKey = useMemo(() => `g9x-${urlSegmentFromText(newName || "site-de-teste", 80)}`, [newName]);
  const hostname = useMemo(
    () =>
      hostnameLabel.trim() && selected
        ? `${urlSegmentFromText(hostnameLabel, 48)}.${selected.key}.invalid`
        : "",
    [hostnameLabel, selected],
  );

  const load = useCallback(async () => {
    if (!session || !candidateEnabled) return;
    setError("");
    try {
      const result = Ev2SitesCapabilityResultSchema.parse(
        await sitesCommand(session, { action: "capability", envelope: envelope() }),
      );
      if (!result.enabled) {
        setCapability("disabled");
        return;
      }
      setCapability("enabled");
      const registry = Ev2SiteRegistrySchema.parse(
        await sitesCommand(session, { action: "registry", envelope: envelope() }),
      );
      setSites(registry.sites);
      setSelectedKey((current) =>
        registry.sites.some((site) => site.key === current) ? current : (registry.sites[0]?.key ?? "main"),
      );
    } catch (caught) {
      setCapability("error");
      setError(operatorErrorMessage(caught, { fallback: "A lista de sites está indisponível." }));
    }
  }, [candidateEnabled, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTokens(defaultTokens.map((token) => ({ ...token })));
    setHostnameLabel("");
  }, [selectedKey]);

  async function mutate(body: Record<string, unknown>, message: string) {
    if (!session || profile?.mfaVerified !== true) return false;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = Ev2SiteMutationResultSchema.parse(
        await sitesCommand(session, body, crypto.randomUUID()),
      );
      setSelectedKey(result.siteKey);
      setSuccess(`${message} A alteração foi registrada na auditoria.`);
      await load();
      return true;
    } catch (caught) {
      setError(operatorErrorMessage(caught, { fallback: "A configuração não foi alterada." }));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!candidateEnabled) {
    return (
      <section>
        <h1>Sites e ambientes</h1>
        <div role="status" className="admin-notice">
          A preparação de outros sites não está disponível para esta sessão. O site principal permanece único.
        </div>
      </section>
    );
  }
  if (capability !== "enabled") {
    return (
      <section>
        <h1>Sites e ambientes</h1>
        <div role={capability === "error" ? "alert" : "status"} className="admin-notice">
          {capability === "checking"
            ? "Verificando a permissão para preparar outros sites…"
            : capability === "error"
              ? error || "Não foi possível verificar a preparação de outros sites."
              : "A preparação de outros sites está desativada. O site principal permanece único e operacional."}
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">PREPARAÇÃO ISOLADA</p>
          <h1>Sites, ambientes e temas</h1>
          <p className="admin-help">
            Sites adicionais são usados somente em validação, permanecem bloqueados e não recebem produção,
            domínio real, conteúdo ou tráfego.
          </p>
        </div>
      </div>
      <div className="admin-visual-safety" role="note">
        <LockKeyhole size={18} aria-hidden="true" />
        <span>
          <strong>Ativação de vários sites bloqueada.</strong> Os sites de teste não podem receber tráfego de
          produção.
        </span>
      </div>
      {error && (
        <div role="alert" className="admin-notice--error">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="admin-notice--success">
          {success}
        </div>
      )}
      {!profile?.mfaVerified && canManage && (
        <div role="status" className="admin-notice">
          Preparar sites de teste exige verificação em duas etapas.{" "}
          <Link to="/admin/mfa">Confirmar identidade</Link>
        </div>
      )}

      <div className="admin-dashboard-grid">
        <article className="admin-editor-card">
          <h2>
            <Building2 size={18} aria-hidden="true" /> Site selecionado
          </h2>
          <label>
            Site
            <select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}>
              {sites.map((site) => (
                <option key={site.id} value={site.key}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <dl className="admin-definition-list">
              <div>
                <dt>Estado</dt>
                <dd>{siteStatusLabels[selected.status]}</dd>
              </div>
              <div>
                <dt>Escopo</dt>
                <dd>{selected.primary ? "Site principal" : "Site de teste isolado"}</dd>
              </div>
              <div>
                <dt>Tema</dt>
                <dd>{selected.themeKey ? "Tema configurado" : "Tema padrão"}</dd>
              </div>
              <div>
                <dt>Idioma</dt>
                <dd>{selected.defaultLanguage === "pt-BR" ? "Português (Brasil)" : "Idioma configurado"}</dd>
              </div>
              <div>
                <dt>Fuso</dt>
                <dd>
                  {selected.timezone === "America/Sao_Paulo" ? "Horário de Brasília" : "Fuso configurado"}
                </dd>
              </div>
            </dl>
          )}
        </article>

        <article className="admin-editor-card">
          <h2>
            <ShieldCheck size={18} aria-hidden="true" /> Ambientes
          </h2>
          {selected?.environments.map((environment) => (
            <p key={environment.id}>
              <strong>{environmentLabels[environment.key]}</strong> ·{" "}
              {environmentStatusLabels[environment.status]}
            </p>
          ))}
          <h3>
            <Globe2 size={17} aria-hidden="true" /> Domínios de teste
          </h3>
          {selected?.domains.length ? (
            <ul>
              {selected.domains.map((domain) => (
                <li key={domain.id}>
                  <span>{domain.hostname}</span> · {domain.status === "reserved" ? "Reservado" : "Bloqueado"}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhum domínio de teste foi reservado.</p>
          )}
        </article>
      </div>

      {canManage && profile?.mfaVerified && (
        <div className="admin-dashboard-grid">
          <form
            className="admin-editor-card"
            onSubmit={(event) => {
              event.preventDefault();
              void (async () => {
                const completed = await mutate(
                  {
                    action: "create_candidate",
                    envelope: envelope(),
                    targetSiteKey: newKey,
                    name: newName,
                    purpose: newPurpose,
                  },
                  "Site de teste preparado; ambos os ambientes permanecem bloqueados.",
                );
                if (completed) {
                  setNewName("");
                }
              })();
            }}
          >
            <h2>
              <Plus size={18} aria-hidden="true" /> Novo site de teste
            </h2>
            <label>
              Nome do site de teste
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                minLength={2}
                maxLength={120}
                pattern=".*[A-Za-z0-9À-ÿ].*"
                required
              />
            </label>
            <label>
              Finalidade
              <textarea value={newPurpose} onChange={(event) => setNewPurpose(event.target.value)} required />
            </label>
            <button type="submit" disabled={busy}>
              Preparar site bloqueado
            </button>
          </form>

          {selected?.synthetic && selected.status === "pilot" && (
            <div className="admin-editor-card">
              <h2>Operações do site selecionado</h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void (async () => {
                    const completed = await mutate(
                      {
                        action: "add_domain",
                        envelope: envelope(),
                        targetSiteKey: selected.key,
                        hostname,
                        expectedVersion: selected.lockVersion,
                      },
                      "Domínio de teste reservado e mantido sem ativação.",
                    );
                    if (completed) setHostnameLabel("");
                  })();
                }}
              >
                <label>
                  Nome do domínio de teste
                  <input
                    value={hostnameLabel}
                    onChange={(event) => setHostnameLabel(event.target.value)}
                    placeholder="campanha-interna"
                    minLength={2}
                    maxLength={48}
                    pattern="[A-Za-z0-9À-ÿ]+(?:[ -][A-Za-z0-9À-ÿ]+)*"
                    required
                  />
                </label>
                <button type="submit" disabled={busy}>
                  Adicionar domínio de teste
                </button>
              </form>
              <fieldset>
                <legend>Tema visual</legend>
                {tokens.map((token, index) => (
                  <label key={token.key}>
                    {tokenLabels[token.key] ?? "Opção visual"}
                    {token.kind === "color" ? (
                      <input
                        type="color"
                        value={token.value}
                        onChange={(event) =>
                          setTokens((current) =>
                            current.map((item, currentIndex) =>
                              currentIndex === index ? { ...item, value: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    ) : (
                      <select
                        value={token.value}
                        onChange={(event) =>
                          setTokens((current) =>
                            current.map((item, currentIndex) =>
                              currentIndex === index ? { ...item, value: event.target.value } : item,
                            ),
                          )
                        }
                      >
                        {(tokenChoices[token.key] ?? []).map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      {
                        action: "update_tokens",
                        envelope: envelope(),
                        targetSiteKey: selected.key,
                        tokens,
                        expectedVersion: selected.lockVersion,
                      },
                      "Nova versão do tema registrada.",
                    )
                  }
                >
                  Salvar nova versão do tema
                </button>
              </fieldset>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void mutate(
                    {
                      action: "suspend_candidate",
                      envelope: envelope(),
                      targetSiteKey: selected.key,
                      expectedVersion: selected.lockVersion,
                    },
                    "Site de teste suspenso sem excluir o histórico.",
                  )
                }
              >
                Suspender site de teste
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
