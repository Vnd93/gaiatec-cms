import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DRAFT_BACKUP_VERSION = 2;
export const DRAFT_BACKUP_TTL_MS = 24 * 60 * 60 * 1000;

type StoredDraft<T> = {
  version: number;
  environment: string;
  userId: string;
  editorType: string;
  itemKey: string;
  savedAt: string;
  expiresAt: string;
  value: T;
};

export type DraftBackupState<T> = {
  recoverable: StoredDraft<T> | null;
  lastSavedAt: string | null;
  state: "idle" | "saving" | "saved" | "restored" | "unavailable";
  restore(): void;
  discard(): void;
  clear(): void;
};

const safePart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180);

export function draftBackupKey(userId: string, editorType: string, itemKey: string, environment = "local") {
  return `gaiatec:cms:draft:v${DRAFT_BACKUP_VERSION}:${safePart(environment)}:${safePart(userId)}:${safePart(editorType)}:${safePart(itemKey)}`;
}

function readStoredDraft<T>(
  key: string,
  environment: string,
  userId: string,
  editorType: string,
  itemKey: string,
): StoredDraft<T> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (
      parsed.version !== DRAFT_BACKUP_VERSION ||
      parsed.environment !== environment ||
      parsed.userId !== userId ||
      parsed.editorType !== editorType ||
      parsed.itemKey !== itemKey ||
      !parsed.savedAt ||
      !parsed.expiresAt ||
      Date.parse(parsed.expiresAt) <= Date.now()
    ) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function useDraftBackup<T>({
  userId,
  editorType,
  itemKey,
  value,
  dirty,
  enabled = true,
  onRestore,
  ttlMs = DRAFT_BACKUP_TTL_MS,
  environment = import.meta.env.VITE_CMS_ENVIRONMENT ?? "local",
}: {
  userId: string | undefined;
  editorType: string;
  itemKey: string;
  value: T;
  dirty: boolean;
  enabled?: boolean;
  onRestore(value: T): void;
  ttlMs?: number;
  environment?: string;
}): DraftBackupState<T> {
  const key = useMemo(
    () => (userId ? draftBackupKey(userId, editorType, itemKey, environment) : ""),
    [editorType, environment, itemKey, userId],
  );
  const [recoverable, setRecoverable] = useState<StoredDraft<T> | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [state, setState] = useState<DraftBackupState<T>["state"]>("idle");
  const latestRestore = useRef(onRestore);
  latestRestore.current = onRestore;

  useEffect(() => {
    if (!enabled || !key) return;
    const stored = readStoredDraft<T>(key, environment, userId ?? "", editorType, itemKey);
    setRecoverable(stored);
    setLastSavedAt(stored?.savedAt ?? null);
    setState(stored ? "saved" : "idle");
  }, [editorType, enabled, environment, itemKey, key, userId]);

  useEffect(() => {
    if (!enabled || !key || !dirty) return;
    setState("saving");
    const timeout = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      const stored: StoredDraft<T> = {
        version: DRAFT_BACKUP_VERSION,
        environment,
        userId: userId ?? "",
        editorType,
        itemKey,
        savedAt,
        expiresAt: new Date(Date.now() + ttlMs).toISOString(),
        value,
      };
      try {
        window.localStorage.setItem(key, JSON.stringify(stored));
        setLastSavedAt(savedAt);
        setState("saved");
      } catch {
        setState("unavailable");
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [dirty, editorType, enabled, environment, itemKey, key, ttlMs, userId, value]);

  const clear = useCallback(() => {
    if (key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // O armazenamento local pode estar desabilitado; a limpeza visual ainda é segura.
      }
    }
    setRecoverable(null);
    setLastSavedAt(null);
    setState("idle");
  }, [key]);

  return {
    recoverable,
    lastSavedAt,
    state,
    restore: useCallback(() => {
      if (!recoverable) return;
      latestRestore.current(recoverable.value);
      setRecoverable(null);
      setState("restored");
    }, [recoverable]),
    discard: clear,
    clear,
  };
}
