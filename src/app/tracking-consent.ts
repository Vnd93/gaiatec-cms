const CONSENT_VERSION = "1";
const STORAGE_KEY = "gaiatec_cookie_consent";

type StoredConsent = {
  version: string;
  action: "accepted" | "dismissed";
};

export function hasTrackingConsent(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredConsent;
    return parsed?.version === CONSENT_VERSION && parsed.action === "accepted";
  } catch {
    return false;
  }
}
