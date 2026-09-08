import { useCallback, useEffect, useMemo, useState } from "react";
import { masterDataCommand } from "../api/cms-api";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { cmsEnvironment, isEv2FeatureEnabled } from "../ev2-runtime";
import {
  Ev2MasterCapabilityResultSchema,
  Ev2MasterDependencyResultSchema,
  Ev2MasterEntityListResultSchema,
  Ev2MasterMutationResultSchema,
  Ev2MasterRuleListResultSchema,
  ev2MasterEntityLabels,
  type Ev2MasterCompatibility,
  type Ev2MasterEntity,
  type Ev2MasterEntityType,
  type Ev2MasterRelationRule,
} from "@/shared/contracts/ev2-master-data";

const CMS_ENVIRONMENT = cmsEnvironment();
const entityTypes = Object.keys(ev2MasterEntityLabels) as Ev2MasterEntityType[];

type EntityDraft = {
  id?: string;
  name: string;
  description: string;
  externalDomain: string;
  sourceRef: string;
  expectedVersion?: number;
};

const emptyDraft: EntityDraft = { name: "", description: "", externalDomain: "", sourceRef: "" };

function envelope(expectedVersion?: number) {
  return {
    schemaVersion: 1 as const,
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: CMS_ENVIRONMENT, siteKey: "main" },
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  };
}

export default function AdminMasterDataPage() {
  const { session, profile } = useAdminAuth();
  const candidateEnabled = isEv2FeatureEnabled(profile, "ev2.master_data");
  const [capability, setCapability] = useState<"checking" | "enabled" | "disabled" | "error">(
    candidateEnabled ? "checking" : "disabled",
  );
  const [entities, setEntities] = useState<Ev2MasterEntity[]>([]);
  const [rules, setRules] = useState<Ev2MasterRelationRule[]>([]);
  const [entityType, setEntityType] = useState<Ev2MasterEntityType>("manufacturer");
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [draft, setDraft] = useState<EntityDraft>(emptyDraft);
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [alias, setAlias] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [selectedRelation, setSelectedRelation] = useState("");
  const [sourceEntityId, setSourceEntityId] = useState("");
  const [targetEntityId, setTargetEntityId] = useState("");
  const [compatibilities, setCompatibilities] = useState<Ev2MasterCompatibility[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const canManage = profile?.permissions.includes("cms:masterdata.manage") ?? false;
  const canMerge = profile?.permissions.includes("cms:masterdata.merge") ?? false;

  const load = useCallback(async () => {
    if (!session || !candidateEnabled) return;
    setError("");
    try {
      const capabilityResult = Ev2MasterCapabilityResultSchema.parse(
        await masterDataCommand(session, { action: "capability", envelope: envelope() }),
      );
      if (!capabilityResult.enabled) {
        setCapability("disabled");
        return;
      }
      setCapability("enabled");
      const [entityResult, ruleResult] = await Promise.all([
        masterDataCommand(session, {
          action: "list_entities",
          envelope: envelope(),
          includeInactive: true,
          query: "",
        }),
        masterDataCommand(session, { action: "list_rules", envelope: envelope() }),
      ]);
      const parsedEntities = Ev2MasterEntityListResultSchema.parse(entityResult).entities;
      const parsedRules = Ev2MasterRuleListResultSchema.parse(ruleResult).rules;
      setEntities(parsedEntities);
      setRules(parsedRules);
      setSelectedRelation((current) => current || parsedRules[0]?.relationType || "");
    } catch (caught) {
      setCapability("error");
      setError(caught instanceof Error ? caught.message : "Dados mestres indisponíveis.");
    }
  }, [candidateEnabled, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDependencies = useCallback(async () => {
    if (!session || capability !== "enabled" || !selectedRelation || !sourceEntityId) {
      setCompatibilities([]);
      return;
    }
    try {
      const result = Ev2MasterDependencyResultSchema.parse(
        await masterDataCommand(session, {
          action: "get_dependencies",
          envelope: envelope(),
          relationType: selectedRelation,
          sourceEntityId,
          includeInactive: true,
        }),
      );
      setCompatibilities(result.compatibilities);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dependências indisponíveis.");
    }
  }, [capability, selectedRelation, session, sourceEntityId]);

  useEffect(() => {
    void loadDependencies();
  }, [loadDependencies]);

  const visibleEntities = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return entities.filter(
      (entity) =>
        entity.entityType === entityType &&
        (includeInactive || entity.status === "active") &&
        (!needle ||
          [entity.canonicalName, ...entity.aliases.map((item) => item.alias)].some((value) =>
            value.toLocaleLowerCase("pt-BR").includes(needle),
          )),
    );
  }, [entities, entityType, includeInactive, query]);
  const selectedEntity = entities.find((entity) => entity.id === selectedEntityId);
  const currentRule = rules.find((rule) => rule.relationType === selectedRelation);
  const sourceEntities = entities.filter(
    (entity) => entity.status === "active" && entity.entityType === currentRule?.sourceType,
  );
  const targetEntities = entities.filter(
    (entity) => entity.status === "active" && entity.entityType === currentRule?.targetType,
  );

  async function mutate(body: Record<string, unknown>) {
    if (!session) return false;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      Ev2MasterMutationResultSchema.parse(await masterDataCommand(session, body, crypto.randomUUID()));
      setSuccess("Alteração concluída e registrada na auditoria.");
      await load();
      await loadDependencies();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Alteração não concluída.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!candidateEnabled) {
    return (
      <section>
        <h1>Dados mestres EV2</h1>
        <div role="status" className="admin-notice">
          Dados mestres EV2.3 não estão elegíveis para esta sessão. As listas mestras atuais continuam
          disponíveis sem alteração.
        </div>
      </section>
    );
  }

  if (capability !== "enabled") {
    return (
      <section>
        <h1>Dados mestres EV2</h1>
        <div role={capability === "error" ? "alert" : "status"} className="admin-notice">
          {capability === "checking"
            ? "Verificando autorização da capacidade EV2.3…"
            : capability === "error"
              ? error || "Não foi possível verificar a capacidade EV2.3."
              : "A capacidade EV2.3 está desativada. As listas mestras atuais permanecem operacionais."}
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">EV2.3 · TAXONOMIAS GOVERNADAS</p>
          <h1>Dados mestres</h1>
          <p className="admin-help">
            Fonte única de fabricantes, classificações, aliases e dependências N:N. Inativar preserva o
            histórico; mesclar nunca exclui o registro de origem.
          </p>
        </div>
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

      <div className="admin-editor-card">
        <h2>Entidades</h2>
        <div className="admin-form-grid">
          <label>
            Tipo
            <select
              value={entityType}
              onChange={(event) => setEntityType(event.target.value as Ev2MasterEntityType)}
            >
              {entityTypes.map((type) => (
                <option key={type} value={type}>
                  {ev2MasterEntityLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Buscar nome ou alias
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
            />
            Mostrar inativos e mesclados
          </label>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Aliases</th>
              <th>Origem</th>
              <th>Estado</th>
              {canManage && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {visibleEntities.map((entity) => (
              <tr key={entity.id}>
                <td>
                  <strong>{entity.canonicalName}</strong>
                  {entity.externalDomain && <small>{entity.externalDomain}</small>}
                </td>
                <td>{entity.aliases.map((item) => item.alias).join(", ") || "—"}</td>
                <td>
                  {entity.sourceType}
                  {entity.sourceRef ? ` · ${entity.sourceRef}` : ""}
                </td>
                <td>
                  <span
                    className={`admin-status admin-status--${entity.status === "active" ? "active" : "archived"}`}
                  >
                    {entity.status}
                  </span>
                </td>
                {canManage && (
                  <td>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setSelectedEntityId(entity.id);
                        setDraft({
                          id: entity.id,
                          name: entity.canonicalName,
                          description: entity.description,
                          externalDomain: entity.externalDomain ?? "",
                          sourceRef: entity.sourceRef ?? "",
                          expectedVersion: entity.lockVersion,
                        });
                      }}
                    >
                      Editar
                    </button>{" "}
                    {entity.status !== "merged" && (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={entity.status === "active" ? "Inativar entidade" : "Reativar entidade"}
                        onClick={() =>
                          void mutate({
                            action: "set_entity_status",
                            envelope: envelope(entity.lockVersion),
                            entityId: entity.id,
                            status: entity.status === "active" ? "inactive" : "active",
                            reason:
                              entity.status === "active"
                                ? "Inativação administrativa"
                                : "Reativação administrativa",
                          })
                        }
                      >
                        {entity.status === "active" ? "Inativar" : "Reativar"}
                      </button>
                    )}{" "}
                    {entity.status === "merged" && canMerge && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void mutate({
                            action: "restore_merge",
                            envelope: envelope(entity.lockVersion),
                            sourceEntityId: entity.id,
                            reason: "Restauração administrativa da mesclagem",
                          })
                        }
                      >
                        Restaurar mesclagem
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && (
        <form
          className="admin-editor-card"
          aria-label="Editar entidade de dados mestres"
          onSubmit={(event) => {
            event.preventDefault();
            const body = draft.id
              ? {
                  action: "update_entity",
                  envelope: envelope(draft.expectedVersion),
                  entityId: draft.id,
                  name: draft.name,
                  description: draft.description,
                  externalDomain: draft.externalDomain || undefined,
                  sourceType: "manual",
                  sourceRef: draft.sourceRef || undefined,
                }
              : {
                  action: "create_entity",
                  envelope: envelope(),
                  entityType,
                  name: draft.name,
                  description: draft.description,
                  externalDomain: draft.externalDomain || undefined,
                  sourceType: "manual",
                  sourceRef: draft.sourceRef || undefined,
                };
            void mutate(body).then((saved) => {
              if (saved) setDraft(emptyDraft);
            });
          }}
        >
          <h2>{draft.id ? "Editar entidade" : `Nova entidade · ${ev2MasterEntityLabels[entityType]}`}</h2>
          <div className="admin-form-grid">
            <label>
              Nome canônico
              <input
                required
                minLength={1}
                maxLength={180}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label>
              Domínio externo opcional
              <input
                maxLength={253}
                pattern="[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?"
                placeholder="fabricante.example"
                value={draft.externalDomain}
                onChange={(event) => setDraft({ ...draft, externalDomain: event.target.value })}
              />
            </label>
            <label>
              Descrição
              <textarea
                maxLength={1000}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </label>
            <label>
              Referência da origem
              <input
                maxLength={300}
                value={draft.sourceRef}
                onChange={(event) => setDraft({ ...draft, sourceRef: event.target.value })}
              />
            </label>
          </div>
          <button className="admin-button" disabled={busy} type="submit">
            Salvar entidade
          </button>{" "}
          {draft.id && (
            <button type="button" onClick={() => setDraft(emptyDraft)}>
              Cancelar edição
            </button>
          )}
        </form>
      )}

      {canManage && selectedEntity && selectedEntity.status !== "merged" && (
        <div className="admin-editor-card">
          <h2>Alias de {selectedEntity.canonicalName}</h2>
          <label>
            Novo nome alternativo
            <input maxLength={180} value={alias} onChange={(event) => setAlias(event.target.value)} />
          </label>
          <button
            type="button"
            className="admin-button"
            disabled={busy || !alias.trim()}
            onClick={() => {
              void mutate({
                action: "upsert_alias",
                envelope: envelope(selectedEntity.lockVersion),
                entityId: selectedEntity.id,
                alias,
                sourceType: "manual",
              }).then((saved) => {
                if (saved) setAlias("");
              });
            }}
          >
            Adicionar alias
          </button>
        </div>
      )}

      {canMerge && selectedEntity && selectedEntity.status !== "merged" && (
        <div className="admin-editor-card">
          <h2>Mesclar duplicidade</h2>
          <p className="admin-help">
            A origem será arquivada e continuará restaurável, com suas referências históricas intactas.
          </p>
          <label>
            Destino canônico
            <select value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)}>
              <option value="">Selecione</option>
              {entities
                .filter(
                  (item) =>
                    item.id !== selectedEntity.id &&
                    item.entityType === selectedEntity.entityType &&
                    item.status === "active",
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.canonicalName}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !mergeTargetId}
            onClick={() => {
              if (!window.confirm("Confirmar a mesclagem reversível desta duplicidade?")) return;
              void mutate({
                action: "merge_entities",
                envelope: envelope(selectedEntity.lockVersion),
                sourceEntityId: selectedEntity.id,
                targetEntityId: mergeTargetId,
                reason: "Duplicidade confirmada pelo responsável",
              }).then((saved) => {
                if (saved) setMergeTargetId("");
              });
            }}
          >
            Mesclar no destino
          </button>
        </div>
      )}

      <div className="admin-editor-card">
        <h2>Compatibilidades e dependências</h2>
        <div className="admin-form-grid">
          <label>
            Relação
            <select
              value={selectedRelation}
              onChange={(event) => {
                setSelectedRelation(event.target.value);
                setSourceEntityId("");
                setTargetEntityId("");
              }}
            >
              <option value="">Selecione</option>
              {rules.map((rule) => (
                <option key={rule.relationType} value={rule.relationType}>
                  {rule.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Origem
            <select value={sourceEntityId} onChange={(event) => setSourceEntityId(event.target.value)}>
              <option value="">Selecione</option>
              {sourceEntities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.canonicalName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Destino compatível
            <select value={targetEntityId} onChange={(event) => setTargetEntityId(event.target.value)}>
              <option value="">Selecione</option>
              {targetEntities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.canonicalName}
                </option>
              ))}
            </select>
          </label>
        </div>
        {canManage && (
          <button
            type="button"
            className="admin-button"
            disabled={busy || !sourceEntityId || !targetEntityId || !currentRule}
            onClick={() => {
              if (!currentRule) return;
              void mutate({
                action: "upsert_compatibility",
                envelope: envelope(),
                relationType: currentRule.relationType,
                sourceEntityId,
                targetEntityId,
                sourceType: "manual",
              });
            }}
          >
            Adicionar compatibilidade
          </button>
        )}
        <ul>
          {compatibilities.map((item) => (
            <li key={item.id}>
              {item.target?.canonicalName ?? "Referência histórica"} · {item.status} · v{item.version}
              {canManage && item.status === "active" && (
                <button
                  type="button"
                  disabled={busy}
                  aria-label="Inativar compatibilidade"
                  onClick={() =>
                    void mutate({
                      action: "set_compatibility_status",
                      envelope: envelope(item.lockVersion),
                      compatibilityId: item.id,
                      status: "inactive",
                      reason: "Compatibilidade encerrada pelo responsável",
                    })
                  }
                >
                  Inativar
                </button>
              )}
            </li>
          ))}
          {!compatibilities.length && sourceEntityId && <li>Nenhuma compatibilidade cadastrada.</li>}
        </ul>
      </div>
    </section>
  );
}
