import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const SHA256 = /^[a-f0-9]{64}$/;
const PACKAGE_PATH = /^\/[A-Za-z0-9._@/+()-]+$/;

export const CMS_PUBLIC_JSR_MIRROR = Object.freeze({
  registryUrl: "https://jsr.io/",
  runtimeUrl: "file:///workspace/.g12-jsr/",
  manifestFile: ".g12-mirror-manifest.json",
  filesFile: ".g12-mirror-files.sha256",
  maximumMetadataBytes: 1024 * 1024,
  maximumFileBytes: 2 * 1024 * 1024,
  maximumFileCount: 512,
  maximumTreeBytes: 8 * 1024 * 1024,
  packages: Object.freeze([
    Object.freeze({
      name: "@supabase/functions-js",
      specifier: "jsr:@supabase/functions-js@*",
      version: "2.112.4",
    }),
    Object.freeze({
      name: "@supabase/supabase-js",
      specifier: "jsr:@supabase/supabase-js@2",
      version: "2.112.4",
    }),
  ]),
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function decodeJson(bytes, token) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch (error) {
    throw new Error(token, { cause: error });
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

function sameCanonical(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function skipJavaScriptTrivia(source, start) {
  let cursor = start;
  while (cursor < source.length) {
    if (/\s/u.test(source[cursor])) {
      cursor += 1;
      continue;
    }
    if (source.startsWith("/*", cursor)) {
      const end = source.indexOf("*/", cursor + 2);
      if (end < 0) return source.length;
      cursor = end + 2;
      continue;
    }
    if (source.startsWith("//", cursor)) {
      cursor += 2;
      while (cursor < source.length && !/[\r\n\u2028\u2029]/u.test(source[cursor])) cursor += 1;
      continue;
    }
    break;
  }
  return cursor;
}

function isAsciiIdentifierContinuation(value) {
  return /[A-Za-z0-9_$]/u.test(value ?? "");
}

export function sourceContainsImportMeta(source) {
  if (typeof source !== "string") throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SOURCE_REFUSED");
  let searchFrom = 0;
  while (searchFrom < source.length) {
    const importStart = source.indexOf("import", searchFrom);
    if (importStart < 0) return false;
    if (isAsciiIdentifierContinuation(source[importStart - 1])) {
      searchFrom = importStart + "import".length;
      continue;
    }
    let cursor = skipJavaScriptTrivia(source, importStart + "import".length);
    if (source[cursor] === ".") {
      cursor = skipJavaScriptTrivia(source, cursor + 1);
      if (source.startsWith("meta", cursor) && !isAsciiIdentifierContinuation(source[cursor + 4]))
        return true;
    }
    searchFrom = Math.max(importStart + "import".length, cursor);
  }
  return false;
}

async function readBoundedRegularFile(path, maximumBytes) {
  const target = resolve(path);
  const metadata = await lstat(target);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    !Number.isSafeInteger(metadata.size) ||
    metadata.size < 0 ||
    metadata.size > maximumBytes
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FILE_REFUSED");
  const bytes = await readFile(target);
  if (bytes.byteLength !== metadata.size)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FILE_CHANGED");
  return bytes;
}

async function walkRegularFiles(root, current = root, files = []) {
  const metadata = await lstat(current);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_DIRECTORY_REFUSED");
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    const entryMetadata = await lstat(path);
    if (entryMetadata.isSymbolicLink())
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SYMLINK_REFUSED");
    if (entryMetadata.isDirectory()) await walkRegularFiles(root, path, files);
    else if (entryMetadata.isFile()) files.push(path);
    else throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_ENTRY_REFUSED");
  }
  return files;
}

function safeRelativePath(root, path) {
  const rawValue = relative(root, path);
  if (sep === "/" && rawValue.includes("\\"))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_PATH_REFUSED");
  const value = rawValue.replaceAll("\\", "/");
  if (
    !value ||
    value.startsWith("../") ||
    value.includes("/../") ||
    value.includes("//") ||
    /[\r\n\0]/.test(value)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_PATH_REFUSED");
  return value;
}

function safePackagePath(value) {
  if (
    typeof value !== "string" ||
    !PACKAGE_PATH.test(value) ||
    value.startsWith("//") ||
    /[\\%?#:\r\n\0]/.test(value) ||
    value
      .split("/")
      .slice(1)
      .some((part) => !part || part === "." || part === "..")
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_PACKAGE_PATH_REFUSED");
  return value;
}

function exactTarget(root, ...parts) {
  const target = resolve(root, ...parts);
  const prefix = `${resolve(root)}${sep}`;
  if (!target.startsWith(prefix)) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_TARGET_REFUSED");
  return target;
}

function resolvePackages(lock) {
  const expectedJsrKeys = CMS_PUBLIC_JSR_MIRROR.packages
    .map(({ name, version }) => `${name}@${version}`)
    .sort();
  const expectedSpecifiers = CMS_PUBLIC_JSR_MIRROR.packages.map(({ specifier }) => specifier).sort();
  const actualJsrKeys = Object.keys(lock?.jsr ?? {}).sort();
  const actualSpecifiers = Object.keys(lock?.specifiers ?? {})
    .filter((specifier) => specifier.startsWith("jsr:"))
    .sort();
  if (
    lock?.version !== "5" ||
    JSON.stringify(actualJsrKeys) !== JSON.stringify(expectedJsrKeys) ||
    JSON.stringify(actualSpecifiers) !== JSON.stringify(expectedSpecifiers)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_LOCK_SCOPE_REFUSED");
  return CMS_PUBLIC_JSR_MIRROR.packages.map((definition) => {
    const lockKey = `${definition.name}@${definition.version}`;
    const locked = lock.jsr[lockKey];
    if (
      lock.specifiers[definition.specifier] !== definition.version ||
      !SHA256.test(locked?.integrity ?? "") ||
      !Array.isArray(locked?.dependencies) ||
      locked.dependencies.some((dependency) => !String(dependency).startsWith("npm:"))
    )
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_LOCK_ENTRY_REFUSED");
    return { ...definition, lockKey, integrity: locked.integrity };
  });
}

function versionMetadataEntries(metadata) {
  const entries = Object.entries(metadata?.manifest ?? {}).map(([path, descriptor]) => {
    safePackagePath(path);
    const checksumMatch = /^sha256-([a-f0-9]{64})$/.exec(descriptor?.checksum ?? "");
    if (
      !checksumMatch ||
      !Number.isSafeInteger(descriptor?.size) ||
      descriptor.size < 0 ||
      descriptor.size > CMS_PUBLIC_JSR_MIRROR.maximumFileBytes
    )
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_METADATA_ENTRY_REFUSED");
    return { path, bytes: descriptor.size, sha256: checksumMatch[1] };
  });
  entries.sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
  const caseFolded = new Set();
  for (const entry of entries) {
    const folded = entry.path.toLowerCase();
    if (caseFolded.has(folded))
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_PATH_COLLISION_REFUSED");
    caseFolded.add(folded);
  }
  if (entries.length < 1) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_EMPTY_REFUSED");
  return entries;
}

function versionModulePaths(metadata, entries) {
  if (
    !metadata?.moduleGraph2 ||
    typeof metadata.moduleGraph2 !== "object" ||
    Array.isArray(metadata.moduleGraph2)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_MODULE_GRAPH_REFUSED");
  const manifestPaths = new Set(entries.map(({ path }) => path));
  const paths = Object.keys(metadata.moduleGraph2).map(safePackagePath);
  paths.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  if (paths.some((path) => !manifestPaths.has(path)))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_MODULE_GRAPH_REFUSED");
  return paths;
}

async function fetchBounded(url, maximumBytes, fetchImplementation) {
  let response;
  try {
    response = await fetchImplementation(url, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "application/json, application/typescript, text/plain, */*" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FETCH_REFUSED", { cause: error });
  }
  if (
    response?.status !== 200 ||
    response.redirected === true ||
    response.headers?.get("location") !== null ||
    (response.url && response.url !== url)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_RESPONSE_REFUSED");
  const contentLength = response.headers?.get("content-length");
  if (contentLength !== null && contentLength !== undefined) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > maximumBytes)
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_RESPONSE_SIZE_REFUSED");
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_RESPONSE_SIZE_REFUSED");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function writeExclusive(path, bytes) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
}

async function inventory(root) {
  const excluded = new Set([CMS_PUBLIC_JSR_MIRROR.manifestFile, CMS_PUBLIC_JSR_MIRROR.filesFile]);
  const records = [];
  for (const path of await walkRegularFiles(root)) {
    const relativePath = safeRelativePath(root, path);
    if (excluded.has(relativePath)) continue;
    const bytes = await readBoundedRegularFile(path, CMS_PUBLIC_JSR_MIRROR.maximumFileBytes);
    records.push({ path: relativePath, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  records.sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
  const text = records.map((record) => `${record.sha256}  ./${record.path}\n`).join("");
  const bytes = records.reduce((total, record) => total + record.bytes, 0);
  if (
    records.length < 1 ||
    records.length > CMS_PUBLIC_JSR_MIRROR.maximumFileCount ||
    bytes > CMS_PUBLIC_JSR_MIRROR.maximumTreeBytes
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_LIMIT_REFUSED");
  return { records, text, treeSha256: sha256(Buffer.from(text, "utf8")), bytes };
}

async function mapConcurrent(values, concurrency, callback) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      await callback(values[index], index);
    }
  });
  await Promise.all(workers);
}

export async function materializeCmsPublicJsrMirror({ lock, output, fetchImplementation = fetch }) {
  const root = resolve(output);
  const packages = resolvePackages(lock);
  await mkdir(root, { recursive: false, mode: 0o700 });
  const plans = [];
  let plannedFiles = 0;
  let plannedBytes = 0;
  for (const packageDefinition of packages) {
    const packageRoot = exactTarget(root, ...packageDefinition.name.split("/"));
    const metadataUrl = `${CMS_PUBLIC_JSR_MIRROR.registryUrl}${packageDefinition.name}/${packageDefinition.version}_meta.json`;
    const metadataBytes = await fetchBounded(
      metadataUrl,
      CMS_PUBLIC_JSR_MIRROR.maximumMetadataBytes,
      fetchImplementation,
    );
    if (sha256(metadataBytes) !== packageDefinition.integrity)
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_METADATA_INTEGRITY_REFUSED");
    const metadata = decodeJson(
      metadataBytes,
      "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_METADATA_JSON_REFUSED",
    );
    const entries = versionMetadataEntries(metadata);
    const modulePaths = versionModulePaths(metadata, entries);
    const packageBytes = entries.reduce((total, entry) => total + entry.bytes, 0);
    plannedFiles += entries.length;
    plannedBytes += packageBytes;
    if (
      plannedFiles > CMS_PUBLIC_JSR_MIRROR.maximumFileCount ||
      plannedBytes > CMS_PUBLIC_JSR_MIRROR.maximumTreeBytes
    )
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_LIMIT_REFUSED");
    const registryMetadataBytes = Buffer.from(
      `${JSON.stringify({ versions: { [packageDefinition.version]: {} } })}\n`,
      "utf8",
    );
    await writeExclusive(join(packageRoot, "meta.json"), registryMetadataBytes);
    await writeExclusive(join(packageRoot, `${packageDefinition.version}_meta.json`), metadataBytes);
    plans.push({
      packageDefinition,
      packageRoot,
      metadata,
      metadataBytes,
      registryMetadataBytes,
      entries,
      modulePaths,
      packageBytes,
    });
  }
  const downloadJobs = plans.flatMap((plan) => plan.entries.map((entry) => ({ ...plan, entry })));
  await mapConcurrent(downloadJobs, 8, async ({ packageDefinition, packageRoot, entry }) => {
    const url = `${CMS_PUBLIC_JSR_MIRROR.registryUrl}${packageDefinition.name}/${packageDefinition.version}${entry.path}`;
    const bytes = await fetchBounded(url, entry.bytes, fetchImplementation);
    if (bytes.byteLength !== entry.bytes || sha256(bytes) !== entry.sha256)
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_PACKAGE_FILE_REFUSED");
    const target = exactTarget(packageRoot, packageDefinition.version, ...entry.path.slice(1).split("/"));
    await writeExclusive(target, bytes);
  });
  const actual = await inventory(root);
  const packageRecords = plans.map(
    ({ packageDefinition, metadataBytes, registryMetadataBytes, entries, modulePaths, packageBytes }) => ({
      name: packageDefinition.name,
      specifier: packageDefinition.specifier,
      version: packageDefinition.version,
      lockKey: packageDefinition.lockKey,
      lockIntegrity: packageDefinition.integrity,
      metadataPath: `${packageDefinition.name}/${packageDefinition.version}_meta.json`,
      metadataBytes: metadataBytes.byteLength,
      registryMetadataPath: `${packageDefinition.name}/meta.json`,
      registryMetadataSha256: sha256(registryMetadataBytes),
      fileCount: entries.length,
      fileBytes: packageBytes,
      moduleFileCount: modulePaths.length,
      moduleImportMetaAbsent: true,
    }),
  );
  await writeExclusive(join(root, CMS_PUBLIC_JSR_MIRROR.filesFile), Buffer.from(actual.text, "utf8"));
  const manifest = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.jsr_mirror",
    registryUrl: CMS_PUBLIC_JSR_MIRROR.registryUrl,
    runtimeUrl: CMS_PUBLIC_JSR_MIRROR.runtimeUrl,
    packages: packageRecords,
    filesManifestSha256: actual.treeSha256,
    treeSha256: actual.treeSha256,
    fileCount: actual.records.length,
    bytes: actual.bytes,
    moduleImportMetaAbsent: true,
  };
  await writeExclusive(
    join(root, CMS_PUBLIC_JSR_MIRROR.manifestFile),
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  );
  return loadCmsPublicJsrMirror({ root, lock });
}

export async function loadCmsPublicJsrMirror({ root: value, lock }) {
  const root = resolve(value);
  const rootMetadata = await lstat(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink())
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_ROOT_REFUSED");
  const packages = resolvePackages(lock);
  const manifestPath = join(root, CMS_PUBLIC_JSR_MIRROR.manifestFile);
  const filesPath = join(root, CMS_PUBLIC_JSR_MIRROR.filesFile);
  const [manifestBytes, filesBytes, actual] = await Promise.all([
    readBoundedRegularFile(manifestPath, CMS_PUBLIC_JSR_MIRROR.maximumMetadataBytes),
    readBoundedRegularFile(filesPath, CMS_PUBLIC_JSR_MIRROR.maximumMetadataBytes),
    inventory(root),
  ]);
  const manifest = decodeJson(
    manifestBytes,
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_MANIFEST_JSON_REFUSED",
  );
  const packageRecords = [];
  const expectedPaths = new Set();
  for (const packageDefinition of packages) {
    const packageRoot = exactTarget(root, ...packageDefinition.name.split("/"));
    const registryMetadataPath = join(packageRoot, "meta.json");
    const metadataPath = join(packageRoot, `${packageDefinition.version}_meta.json`);
    const [registryMetadataBytes, metadataBytes] = await Promise.all([
      readBoundedRegularFile(registryMetadataPath, CMS_PUBLIC_JSR_MIRROR.maximumMetadataBytes),
      readBoundedRegularFile(metadataPath, CMS_PUBLIC_JSR_MIRROR.maximumMetadataBytes),
    ]);
    const registryMetadata = decodeJson(
      registryMetadataBytes,
      "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_REGISTRY_METADATA_REFUSED",
    );
    if (!sameCanonical(registryMetadata, { versions: { [packageDefinition.version]: {} } }))
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_REGISTRY_METADATA_REFUSED");
    if (sha256(metadataBytes) !== packageDefinition.integrity)
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_METADATA_INTEGRITY_REFUSED");
    const metadata = decodeJson(
      metadataBytes,
      "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_METADATA_JSON_REFUSED",
    );
    const entries = versionMetadataEntries(metadata);
    const modulePaths = versionModulePaths(metadata, entries);
    const modulePathSet = new Set(modulePaths);
    const packageBytes = entries.reduce((total, entry) => total + entry.bytes, 0);
    expectedPaths.add(safeRelativePath(root, registryMetadataPath));
    expectedPaths.add(safeRelativePath(root, metadataPath));
    for (const entry of entries) {
      const path = exactTarget(packageRoot, packageDefinition.version, ...entry.path.slice(1).split("/"));
      const relativePath = safeRelativePath(root, path);
      const record = actual.records.find((candidate) => candidate.path === relativePath);
      if (!record || record.bytes !== entry.bytes || record.sha256 !== entry.sha256)
        throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_PACKAGE_FILE_REFUSED");
      if (modulePathSet.has(entry.path)) {
        const source = new TextDecoder("utf-8", { fatal: true }).decode(
          await readBoundedRegularFile(path, CMS_PUBLIC_JSR_MIRROR.maximumFileBytes),
        );
        if (sourceContainsImportMeta(source))
          throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_IMPORT_META_REFUSED");
      }
      expectedPaths.add(relativePath);
    }
    packageRecords.push({
      name: packageDefinition.name,
      specifier: packageDefinition.specifier,
      version: packageDefinition.version,
      lockKey: packageDefinition.lockKey,
      lockIntegrity: packageDefinition.integrity,
      metadataPath: `${packageDefinition.name}/${packageDefinition.version}_meta.json`,
      metadataBytes: metadataBytes.byteLength,
      registryMetadataPath: `${packageDefinition.name}/meta.json`,
      registryMetadataSha256: sha256(registryMetadataBytes),
      fileCount: entries.length,
      fileBytes: packageBytes,
      moduleFileCount: modulePaths.length,
      moduleImportMetaAbsent: true,
    });
  }
  const actualPaths = actual.records.map(({ path }) => path);
  const expectedPathList = [...expectedPaths].sort((left, right) =>
    Buffer.from(left).compare(Buffer.from(right)),
  );
  if (
    Buffer.from(filesBytes).toString("utf8") !== actual.text ||
    JSON.stringify(actualPaths) !== JSON.stringify(expectedPathList) ||
    manifest?.schemaVersion !== 1 ||
    manifest?.event !== "g12.staging.cms_public_hotfix.jsr_mirror" ||
    manifest?.registryUrl !== CMS_PUBLIC_JSR_MIRROR.registryUrl ||
    manifest?.runtimeUrl !== CMS_PUBLIC_JSR_MIRROR.runtimeUrl ||
    !sameCanonical(manifest?.packages, packageRecords) ||
    manifest?.filesManifestSha256 !== actual.treeSha256 ||
    manifest?.treeSha256 !== actual.treeSha256 ||
    manifest?.fileCount !== actual.records.length ||
    manifest?.bytes !== actual.bytes ||
    manifest?.moduleImportMetaAbsent !== true
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_REFUSED");
  return {
    root,
    manifest,
    manifestSha256: sha256(manifestBytes),
    filesManifestSha256: sha256(filesBytes),
    actual,
  };
}
