import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Ev2DraftRecordSchema,
  type Ev2DraftContentType,
  type Ev2DraftRecord,
} from "@/shared/contracts/ev2-draft";
import { CmsApiError, draftV2Command } from "../api/cms-api";
import {
  buildTopLevelDraftPatches,
  progressiveDraftRetryDelay,
  type ProgressiveDraftSyncStatus,
} from "../progressive-draft-sync";

type Environment = "local" | "staging" | "production";

type CapabilityResult = { enabled: boolean };
type QueryResult = { draft: Ev2DraftRecord | null };
type MutationResult = {
  draftId: string;
  lockVersion: number;
  savedAt: string;
  correlationId: string;
};

export type ProgressiveDraftRecovery<T> = {
  draftId: string;
  value: T;
  savedAt: string;
  lockVersion: number;
};

export type ProgressiveDraftAutosaveState<T> = {
  active: boolean;
  status: ProgressiveDraftSyncStatus;
  fallbackReason: "capability_unavailable" | null;
  draftId: string | null;
  lockVersion: number | null;
  lastSavedAt: string | null;
  correlationId: string | null;
  currentVersion: number | null;
  diffRef: string | null;
  recoverable: ProgressiveDraftRecovery<T> | null;
  restoreServerVersion(): void;
  keepLocalVersion(): void;
  retry(): void;
  flush(): Promise<boolean>;
};

function envelope(environment: Environment, expectedVersion?: number) {
  return {
    schemaVersion: 1 as const,
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment, siteKey: "main" },
    ...(expectedVersion ? { expectedVersion } : {}),
  };
}

export function useProgressiveDraftAutosave<T extends object>({
  session,
  enabled,
  environment,
  contentType,
  value,
  workingTitle,
  onRestore,
  onSynced,
  debounceMs = 2_000,
}: {
  session: Session | null;
  enabled: boolean;
  environment: Environment;
  contentType: Ev2DraftContentType;
  value: T;
  workingTitle: string;
  onRestore(value: T): void;
  onSynced(value: T): void;
  debounceMs?: number;
}): ProgressiveDraftAutosaveState<T> {
  const [status, setStatus] = useState<ProgressiveDraftSyncStatus>(enabled ? "checking" : "disabled");
  const [fallbackReason, setFallbackReason] = useState<"capability_unavailable" | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [lockVersion, setLockVersion] = useState<number | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [diffRef, setDiffRef] = useState<string | null>(null);
  const [recoverable, setRecoverable] = useState<ProgressiveDraftRecovery<T> | null>(null);
  const [syncRevision, requestSync] = useState(0);
  const [setupRevision, requestSetup] = useState(0);
  const valueRef = useRef(value);
  const titleRef = useRef(workingTitle);
  const restoreRef = useRef(onRestore);
  const syncedRef = useRef(onSynced);
  const draftIdRef = useRef<string | null>(null);
  const lockVersionRef = useRef<number | null>(null);
  const lastFieldsRef = useRef<Record<string, unknown>>({});
  const lastTitleRef = useRef("");
  const syncingRef = useRef(false);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  valueRef.current = value;
  titleRef.current = workingTitle;
  restoreRef.current = onRestore;
  syncedRef.current = onSynced;

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    const delay = progressiveDraftRetryDelay(retryAttemptRef.current++);
    retryTimerRef.current = window.setTimeout(() => requestSync((current) => current + 1), delay);
  }, []);

  const scheduleSetupRetry = useCallback(() => {
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    const delay = progressiveDraftRetryDelay(retryAttemptRef.current++);
    retryTimerRef.current = window.setTimeout(() => requestSetup((current) => current + 1), delay);
  }, []);

  const syncNow = useCallback(async () => {
    if (!session || !draftIdRef.current || !lockVersionRef.current || syncingRef.current || recoverable) {
      return false;
    }
    const snapshot = valueRef.current as Record<string, unknown>;
    const patches = buildTopLevelDraftPatches(lastFieldsRef.current, snapshot);
    const titleChanged = lastTitleRef.current !== titleRef.current;
    if (!patches.length && !titleChanged) {
      setStatus("saved");
      return true;
    }
    syncingRef.current = true;
    setStatus("syncing");
    try {
      const result = await draftV2Command<MutationResult>(
        session,
        {
          action: "patch",
          envelope: envelope(environment, lockVersionRef.current),
          draftId: draftIdRef.current,
          ...(titleChanged ? { workingTitle: titleRef.current } : {}),
          patches,
        },
        crypto.randomUUID(),
      );
      lastFieldsRef.current = snapshot;
      lastTitleRef.current = titleRef.current;
      lockVersionRef.current = result.lockVersion;
      setLockVersion(result.lockVersion);
      setLastSavedAt(result.savedAt);
      setCorrelationId(result.correlationId);
      setCurrentVersion(null);
      setDiffRef(null);
      setStatus("saved");
      retryAttemptRef.current = 0;
      syncedRef.current(valueRef.current);
      if (JSON.stringify(valueRef.current) !== JSON.stringify(snapshot)) {
        requestSync((current) => current + 1);
      }
      return true;
    } catch (caught) {
      if (caught instanceof CmsApiError && caught.status === 409) {
        setCurrentVersion(caught.currentVersion ?? null);
        setDiffRef(caught.diffRef ?? null);
        setCorrelationId(caught.correlationId ?? null);
        setStatus("conflict");
      } else if (typeof navigator !== "undefined" && !navigator.onLine) {
        setStatus("offline");
        scheduleRetry();
      } else {
        setCorrelationId(caught instanceof CmsApiError ? (caught.correlationId ?? null) : null);
        setStatus("error");
        scheduleRetry();
      }
      return false;
    } finally {
      syncingRef.current = false;
    }
  }, [environment, recoverable, scheduleRetry, session]);

  useEffect(() => {
    if (!enabled || !session) {
      setFallbackReason(null);
      setStatus("disabled");
      return;
    }
    let active = true;
    setStatus("checking");
    void (async () => {
      try {
        const capability = await draftV2Command<CapabilityResult>(session, {
          action: "capability",
          envelope: envelope(environment),
        });
        if (!active) return;
        if (!capability.enabled) {
          setFallbackReason("capability_unavailable");
          setStatus("disabled");
          return;
        }
        setFallbackReason(null);
        const resumed = await draftV2Command<QueryResult>(session, {
          action: "resume",
          envelope: envelope(environment),
          contentType,
        });
        if (!active) return;
        if (resumed.draft) {
          const recovered = Ev2DraftRecordSchema.parse(resumed.draft);
          draftIdRef.current = recovered.draftId;
          lockVersionRef.current = recovered.lockVersion;
          lastFieldsRef.current = recovered.fields;
          lastTitleRef.current = recovered.workingTitle;
          setDraftId(recovered.draftId);
          setLockVersion(recovered.lockVersion);
          setLastSavedAt(recovered.updatedAt);
          if (Object.keys(recovered.fields).length) {
            setRecoverable({
              draftId: recovered.draftId,
              value: recovered.fields as T,
              savedAt: recovered.updatedAt,
              lockVersion: recovered.lockVersion,
            });
            setStatus("recovery_available");
          } else setStatus("idle");
          return;
        }
        setStatus("creating");
        const created = await draftV2Command<MutationResult>(
          session,
          {
            action: "create",
            envelope: envelope(environment),
            contentType,
            workingTitle: titleRef.current,
          },
          crypto.randomUUID(),
        );
        if (!active) return;
        draftIdRef.current = created.draftId;
        lockVersionRef.current = created.lockVersion;
        lastTitleRef.current = titleRef.current;
        setDraftId(created.draftId);
        setLockVersion(created.lockVersion);
        setLastSavedAt(created.savedAt);
        setCorrelationId(created.correlationId);
        setStatus("idle");
        requestSync((current) => current + 1);
      } catch (caught) {
        if (!active) return;
        setCorrelationId(caught instanceof CmsApiError ? (caught.correlationId ?? null) : null);
        setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
        scheduleSetupRetry();
      }
    })();
    return () => {
      active = false;
    };
  }, [contentType, enabled, environment, scheduleSetupRetry, session, setupRevision]);

  useEffect(() => {
    if (!["idle", "saved", "offline", "error"].includes(status) || recoverable) return;
    const timeout = window.setTimeout(() => void syncNow(), debounceMs);
    return () => window.clearTimeout(timeout);
  }, [debounceMs, recoverable, status, syncNow, syncRevision, value, workingTitle]);

  useEffect(
    () => () => {
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    },
    [],
  );

  return {
    active: status !== "disabled" && enabled,
    status,
    fallbackReason,
    draftId,
    lockVersion,
    lastSavedAt,
    correlationId,
    currentVersion,
    diffRef,
    recoverable,
    restoreServerVersion: useCallback(() => {
      if (!recoverable) return;
      restoreRef.current(recoverable.value);
      lastFieldsRef.current = recoverable.value as Record<string, unknown>;
      setRecoverable(null);
      setStatus("saved");
    }, [recoverable]),
    keepLocalVersion: useCallback(() => {
      setRecoverable(null);
      setStatus("idle");
      requestSync((current) => current + 1);
    }, []),
    retry: useCallback(() => {
      retryAttemptRef.current = 0;
      if (draftIdRef.current) {
        setStatus("idle");
        requestSync((current) => current + 1);
      } else {
        setStatus("checking");
        requestSetup((current) => current + 1);
      }
    }, []),
    flush: syncNow,
  };
}
