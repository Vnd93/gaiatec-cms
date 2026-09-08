import {
  cmsMutatingActionContractKey,
  type CmsMutatingActionEvidence,
} from "./cms-semantic-control-contract";

type SemanticActionResult = {
  surfaceId: string;
  controlName: string;
  controlOccurrence?: number;
  action: string;
  scenarioId: string;
  backendStatus: string;
  httpStatus: number;
};

function normalizedControlName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function createCmsSemanticActionLedger() {
  const evidence = new Map<string, CmsMutatingActionEvidence>();

  function record(input: SemanticActionResult) {
    const controlName = normalizedControlName(input.controlName);
    const controlOccurrence = input.controlOccurrence ?? 0;
    if (
      !controlName ||
      !input.action.trim() ||
      !input.scenarioId.trim() ||
      !input.backendStatus.trim() ||
      !Number.isInteger(input.httpStatus) ||
      input.httpStatus < 200 ||
      input.httpStatus >= 300
    ) {
      throw new Error("QA_CMS_SEMANTIC_ACTION_EVIDENCE_INVALID");
    }
    const controlContractKey = cmsMutatingActionContractKey(input.surfaceId, controlName, controlOccurrence);
    const existing = evidence.get(controlContractKey);
    if (existing) {
      existing.actions = [...new Set([...existing.actions, input.action])].sort();
      existing.scenarioIds = [...new Set([...existing.scenarioIds, input.scenarioId])].sort();
      existing.backendStatus = input.backendStatus;
      existing.httpStatus = input.httpStatus;
      return existing;
    }
    const entry: CmsMutatingActionEvidence = {
      schemaVersion: 1,
      surfaceId: input.surfaceId,
      controlName,
      controlOccurrence,
      controlContractKey,
      actions: [input.action],
      scenarioIds: [input.scenarioId],
      handlerExecuted: true,
      evidenceKind: "backend-response",
      backendStatus: input.backendStatus,
      httpStatus: input.httpStatus,
      status: "passed",
    };
    evidence.set(controlContractKey, entry);
    return entry;
  }

  function snapshot() {
    return [...evidence.values()]
      .map((entry) => ({
        ...entry,
        actions: [...entry.actions],
        scenarioIds: [...entry.scenarioIds],
      }))
      .sort((left, right) => left.controlContractKey.localeCompare(right.controlContractKey));
  }

  return { record, snapshot };
}

export type CmsSemanticActionLedger = ReturnType<typeof createCmsSemanticActionLedger>;
