import { extname } from "node:path";

export const ALLOWED_DOCUMENTATION_PATHS = Object.freeze([
  ".github/release-controls/evidence/escopo-dpo-legal-39fd74f2.md",
  "ATTRIBUTIONS.md",
  "README.md",
  "docs/README.md",
  "docs/ev2/README.md",
  "src/admin/README.md",
  "src/rdo/README.md",
  "supabase/seed/README.md",
]);

const allowedDocumentationPaths = new Set(ALLOWED_DOCUMENTATION_PATHS);
const documentationExtensions = new Set([
  ".adoc",
  ".asciidoc",
  ".doc",
  ".docx",
  ".markdown",
  ".md",
  ".mdx",
  ".odt",
  ".pdf",
  ".rst",
  ".rtf",
]);

export function normalizeRepositoryPath(file) {
  return typeof file === "string" ? file.trim().replaceAll("\\", "/").replace(/^\.\//, "") : "";
}

export function isSensitiveRepositoryPath(file) {
  const normalized = normalizeRepositoryPath(file);
  const lowerPath = normalized.toLowerCase();
  return lowerPath === ".secrets" || lowerPath.startsWith(".secrets/");
}

export function isDocumentationCandidate(file) {
  const normalized = normalizeRepositoryPath(file);
  if (!normalized || isSensitiveRepositoryPath(normalized)) return false;
  const lowerPath = normalized.toLowerCase();
  if (lowerPath === "docs" || lowerPath.startsWith("docs/")) return true;
  return documentationExtensions.has(extname(normalized).toLowerCase());
}

export function findDocumentationBoundaryViolations(files) {
  const violations = new Set();
  for (const file of files ?? []) {
    const normalized = normalizeRepositoryPath(file);
    if (isDocumentationCandidate(normalized) && !allowedDocumentationPaths.has(normalized))
      violations.add(normalized);
  }
  return [...violations].sort();
}
