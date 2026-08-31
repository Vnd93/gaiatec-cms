import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DRAFT_BACKUP_VERSION = 1;
export const DRAFT_BACKUP_TTL_MS = 24 * 60 * 60 * 1000;

type StoredDraft<T> = {
  version: number;
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

export function draftBackupKey(userId: string, editorType: string, itemKey: string) {
  return `gaiatec:cms:draft:v${DRAFT_BACKUP_VERSION}:${safePart(userId)}:${safePart(editorType)}:${safePart(itemKey)}`;
}

function readStoredDraft<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (
      parsed.version !== DRAFT_BACKUP_VERSION ||
      !parsed.savedAt ||
      !parsed.expiresAt ||
      Date.parse(parsed.expiresAt) <= Date.now()
    ) {
      window.sessionStorage.removeItem(key);
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
}: {
  userId: string | undefined;
  editorType: string;
  itemKey: string;
  value: T;
  dirty: boolean;
  enabled?: boolean;
  onRestore(value: T): void;
  ttlMs?: number;
}): DraftBackupState<T> {
  const key = useMemo(
    () => (userId ? draftBackupKey(userId, editorType, itemKey) : ""),
    [editorType, itemKey, userId],
  );
  const [recoverable, setRecoverable] = useState<StoredDraft<T> | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [state, setState] = useState<DraftBackupState<T>["state"]>("idle");
  const latestRestore = useRef(onRestore);
  latestRestore.current = onRestore;

  useEffect(() => {
    if (!enabled || !key) return;
    const stored = readStoredDraft<T>(key);
    setRecoverable(stored);
    setLastSavedAt(stored?.savedAt ?? null);
    setState(stored ? "saved" : "idle");
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled || !key || !dirty) return;
    setState("saving");
    const timeout = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      const stored: StoredDraft<T> = {
        version: DRAFT_BACKUP_VERSION,
        userId: userId ?? "",
        editorType,
        itemKey,
        savedAt,
        expiresAt: new Date(Date.now() + ttlMs).toISOString(),
        value,
      };
      try {
        window.sessionStorage.setItem(key, JSON.stringify(stored));
        setLastSavedAt(savedAt);
        setState("saved");
      } catch {
        setState("unavailable");
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [dirty, editorType, enabled, itemKey, key, ttlMs, userId, value]);

  const clear = useCallback(() => {
    if (key) {
      try {
        window.sessionStorage.removeItem(key);
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
