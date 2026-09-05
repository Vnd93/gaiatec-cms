import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const dist = resolve("dist");
const manifestPath = resolve(dist, "release-manifest.json");

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? filesUnder(path) : [path];
    }),
  );
  return nested.flat();
}

const files = (await filesUnder(dist)).filter((file) => file !== manifestPath).sort();
const entries = [];
for (const file of files) {
  const bytes = await readFile(file);
  entries.push({
    path: relative(dist, file).replaceAll("\\", "/"),
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

const release = process.env.GITHUB_SHA ?? process.env.VITE_RELEASE ?? "local-uncommitted";
const payload = { schemaVersion: 1, release, files: entries };
await writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const digest = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
console.log(
  JSON.stringify({ event: "artifact.manifest.created", release, files: entries.length, sha256: digest }),
);
