import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ALLOWED_DOCUMENTATION_PATHS,
  findDocumentationBoundaryViolations,
  isDocumentationCandidate,
  isSensitiveRepositoryPath,
} from "../documentation-boundary-lib.mjs";

test("documentation boundary uses an exact path allowlist", () => {
  assert.deepEqual(findDocumentationBoundaryViolations(ALLOWED_DOCUMENTATION_PATHS), []);
  assert.deepEqual(
    findDocumentationBoundaryViolations([
      "docs/README.md.bak",
      "docs/ev2/fase-18/README.md",
      ".github/release-controls/evidence/extra.md",
      "src/feature/README.md",
    ]),
    [
      ".github/release-controls/evidence/extra.md",
      "docs/README.md.bak",
      "docs/ev2/fase-18/README.md",
      "src/feature/README.md",
    ],
  );
});

test("document extensions are detected case-insensitively and every docs payload is blocked", () => {
  for (const file of ["manual.MD", "manual.DoCx", "manual.PDF", "manual.rSt", "manual.MdX"])
    assert.equal(isDocumentationCandidate(file), true, file);

  assert.deepEqual(
    findDocumentationBoundaryViolations([
      "docs/evidence.JSON",
      "docs/screenshot.PNG",
      "docs/archive.ZIP",
      "Docs/opaque.DATA",
      "MANUAL.PDF",
      "public/logo.png",
      "package.json",
    ]),
    ["Docs/opaque.DATA", "MANUAL.PDF", "docs/archive.ZIP", "docs/evidence.JSON", "docs/screenshot.PNG"],
  );
});

test("secret paths are ignored by path without reading their contents", async () => {
  const ignore = await readFile(".gitignore", "utf8");
  assert.match(ignore, /^\.secrets\/$/m);
  assert.equal(isSensitiveRepositoryPath(".secrets/private.PDF"), true);
  assert.equal(isSensitiveRepositoryPath(".SECRETS/private.PDF"), true);
  assert.equal(isSensitiveRepositoryPath(".secrets-adjacent/private.PDF"), false);
  assert.deepEqual(findDocumentationBoundaryViolations([".secrets/private.PDF"]), []);
  const ignored = spawnSync("git", ["check-ignore", "--no-index", ".secrets/synthetic-path-only"], {
    encoding: "utf8",
  });
  assert.equal(ignored.status, 0);
  assert.equal(ignored.stdout.trim(), ".secrets/synthetic-path-only");
});
