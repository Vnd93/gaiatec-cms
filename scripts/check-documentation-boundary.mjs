import { spawnSync } from "node:child_process";
import {
  findDocumentationBoundaryViolations,
  isDocumentationCandidate,
  normalizeRepositoryPath,
} from "./documentation-boundary-lib.mjs";

const listed = spawnSync(
  "git",
  [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ".",
    ":(exclude).secrets",
    ":(exclude).secrets/**",
  ],
  { encoding: "utf8" },
);

if (listed.status !== 0) {
  throw new Error(`DOCUMENTATION_BOUNDARY_GIT_FAILED: ${listed.stderr.trim()}`);
}

const repositoryFiles = listed.stdout.split(/\r?\n/).map(normalizeRepositoryPath).filter(Boolean);
const documentationFiles = repositoryFiles.filter(isDocumentationCandidate);
const violations = findDocumentationBoundaryViolations(repositoryFiles);

if (violations.length > 0) {
  console.error(
    "DOCUMENTATION_BOUNDARY_VIOLATION: narrative Markdown belongs in Vnd93/gaiatec-documentacao.",
  );
  for (const file of violations) console.error(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify({
      event: "documentation.boundary.validated",
      documentationFiles: documentationFiles.length,
      canonicalRepository: "Vnd93/gaiatec-documentacao",
    }),
  );
}
