import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import test from "node:test";

import {
  CMS_PUBLIC_JSR_MIRROR,
  loadCmsPublicJsrMirror,
  materializeCmsPublicJsrMirror,
  sourceContainsImportMeta,
} from "./staging-cms-public-hotfix-jsr-mirror-lib.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixture({
  traversal = false,
  badPackageBody = false,
  shortPackageBody = false,
  importMeta = false,
} = {}) {
  const definitions = [
    {
      name: "@supabase/functions-js",
      specifier: "jsr:@supabase/functions-js@*",
      path: traversal ? "/../escape.ts" : "/src/edge-runtime.d.ts",
      body: Buffer.from("declare namespace EdgeRuntime {}\n", "utf8"),
    },
    {
      name: "@supabase/supabase-js",
      specifier: "jsr:@supabase/supabase-js@2",
      path: "/src/index.ts",
      body: Buffer.from(
        importMeta
          ? "export const moduleUrl = import.meta.url;\n"
          : "export const createClient = () => true;\n",
        "utf8",
      ),
    },
  ];
  const lock = { version: "5", specifiers: {}, jsr: {} };
  const responses = new Map();
  const expectedUrls = [];
  for (const definition of definitions) {
    const version = "2.112.4";
    const metadata = {
      manifest: {
        [definition.path]: {
          size: definition.body.byteLength,
          checksum: `sha256-${sha256(definition.body)}`,
        },
      },
      moduleGraph2: { [definition.path]: {} },
      exports: { ".": definition.path },
    };
    const metadataBytes = Buffer.from(JSON.stringify(metadata), "utf8");
    const metadataUrl = `${CMS_PUBLIC_JSR_MIRROR.registryUrl}${definition.name}/${version}_meta.json`;
    const packageUrl = `${CMS_PUBLIC_JSR_MIRROR.registryUrl}${definition.name}/${version}${definition.path}`;
    lock.specifiers[definition.specifier] = version;
    lock.jsr[`${definition.name}@${version}`] = {
      integrity: sha256(metadataBytes),
      dependencies: [],
    };
    responses.set(metadataUrl, metadataBytes);
    responses.set(
      packageUrl,
      definition.name.endsWith("supabase-js")
        ? shortPackageBody
          ? definition.body.subarray(0, definition.body.byteLength - 1)
          : badPackageBody
            ? Buffer.from(definition.body).fill(120)
            : definition.body
        : definition.body,
    );
    expectedUrls.push(metadataUrl, packageUrl);
  }
  const calls = [];
  const fetchImplementation = async (url, options) => {
    calls.push({ url, options });
    const body = responses.get(url);
    return body
      ? new Response(body, {
          status: 200,
          headers: { "content-length": String(body.byteLength) },
        })
      : new Response("missing", { status: 404 });
  };
  return { lock, calls, expectedUrls, responses, fetchImplementation };
}

async function temporaryMirror() {
  const parent = await mkdtemp(join(tmpdir(), "g12-jsr-mirror-"));
  return { parent, output: join(parent, "mirror") };
}

test("detects import.meta across JavaScript trivia without a backtracking expression", () => {
  for (const source of [
    "import.meta",
    "import . meta",
    "import/* block */.meta",
    "import// line\n.meta",
    "import. /* block */ meta",
    "const value = 'import/* conservative */.meta'",
  ])
    assert.equal(sourceContainsImportMeta(source), true, source);
  for (const source of [
    "import('module')",
    "important.meta",
    "reimport.meta",
    "import.metadata",
    "meta.import",
  ])
    assert.equal(sourceContainsImportMeta(source), false, source);
  assert.equal(
    sourceContainsImportMeta("import/* ignored import.meta */value;\nimport/* found */.meta"),
    true,
  );
});

test("materializes only the fixed JSR origin and seals the complete verified tree", async () => {
  const temporary = await temporaryMirror();
  const source = fixture();
  try {
    const mirror = await materializeCmsPublicJsrMirror({
      lock: source.lock,
      output: temporary.output,
      fetchImplementation: source.fetchImplementation,
    });
    assert.deepEqual(source.calls.map(({ url }) => url).sort(), source.expectedUrls.sort());
    for (const { url, options } of source.calls) {
      assert.ok(url.startsWith(CMS_PUBLIC_JSR_MIRROR.registryUrl));
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "manual");
    }
    assert.equal(mirror.manifest.registryUrl, "https://jsr.io/");
    assert.equal(mirror.manifest.runtimeUrl, "https://jsr.io/");
    assert.equal(mirror.manifest.packages.length, 2);
    assert.equal(mirror.manifest.fileCount, 6);
    assert.equal(mirror.manifest.treeSha256, mirror.filesManifestSha256);
    assert.equal(mirror.manifest.moduleImportMetaAbsent, true);
    assert.equal(
      await readFile(join(temporary.output, "@supabase", "functions-js", "meta.json"), "utf8"),
      '{"versions":{"2.112.4":{}}}\n',
    );
  } finally {
    await rm(temporary.parent, { recursive: true, force: true });
  }
});

test("refuses redirects before trusting registry bytes", async () => {
  const temporary = await temporaryMirror();
  const source = fixture();
  try {
    await assert.rejects(
      materializeCmsPublicJsrMirror({
        lock: source.lock,
        output: temporary.output,
        fetchImplementation: async () =>
          new Response("", { status: 302, headers: { location: "https://example.invalid/" } }),
      }),
      /G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_RESPONSE_REFUSED/,
    );
  } finally {
    await rm(temporary.parent, { recursive: true, force: true });
  }
});

test("refuses version metadata that does not match the frozen lock integrity", async () => {
  const temporary = await temporaryMirror();
  const source = fixture();
  source.lock.jsr["@supabase/functions-js@2.112.4"].integrity = "0".repeat(64);
  try {
    await assert.rejects(
      materializeCmsPublicJsrMirror({
        lock: source.lock,
        output: temporary.output,
        fetchImplementation: source.fetchImplementation,
      }),
      /G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_METADATA_INTEGRITY_REFUSED/,
    );
  } finally {
    await rm(temporary.parent, { recursive: true, force: true });
  }
});

test("refuses traversal paths declared by a lock-matching version manifest", async () => {
  const temporary = await temporaryMirror();
  const source = fixture({ traversal: true });
  try {
    await assert.rejects(
      materializeCmsPublicJsrMirror({
        lock: source.lock,
        output: temporary.output,
        fetchImplementation: source.fetchImplementation,
      }),
      /G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_PACKAGE_PATH_REFUSED/,
    );
  } finally {
    await rm(temporary.parent, { recursive: true, force: true });
  }
});

test("refuses case-folded path collisions before writing package files", async () => {
  const temporary = await temporaryMirror();
  const source = fixture();
  const metadataUrl = "https://jsr.io/@supabase/functions-js/2.112.4_meta.json";
  const metadata = JSON.parse(source.responses.get(metadataUrl).toString("utf8"));
  metadata.manifest["/src/EDGE-RUNTIME.d.ts"] = metadata.manifest["/src/edge-runtime.d.ts"];
  const metadataBytes = Buffer.from(JSON.stringify(metadata), "utf8");
  source.responses.set(metadataUrl, metadataBytes);
  source.lock.jsr["@supabase/functions-js@2.112.4"].integrity = sha256(metadataBytes);
  try {
    await assert.rejects(
      materializeCmsPublicJsrMirror({
        lock: source.lock,
        output: temporary.output,
        fetchImplementation: source.fetchImplementation,
      }),
      /G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_PATH_COLLISION_REFUSED/,
    );
  } finally {
    await rm(temporary.parent, { recursive: true, force: true });
  }
});

test("refuses a package file whose bytes disagree with the pinned manifest", async () => {
  const temporary = await temporaryMirror();
  const source = fixture({ badPackageBody: true });
  try {
    await assert.rejects(
      materializeCmsPublicJsrMirror({
        lock: source.lock,
        output: temporary.output,
        fetchImplementation: source.fetchImplementation,
      }),
      /G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_PACKAGE_FILE_REFUSED/,
    );
  } finally {
    await rm(temporary.parent, { recursive: true, force: true });
  }
});

test("refuses a package file whose size disagrees with the pinned manifest", async () => {
  const temporary = await temporaryMirror();
  const source = fixture({ shortPackageBody: true });
  try {
    await assert.rejects(
      materializeCmsPublicJsrMirror({
        lock: source.lock,
        output: temporary.output,
        fetchImplementation: source.fetchImplementation,
      }),
      /G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_PACKAGE_FILE_REFUSED/,
    );
  } finally {
    await rm(temporary.parent, { recursive: true, force: true });
  }
});

test("refuses import.meta in the JSR module graph before sealing the mirror", async () => {
  const temporary = await temporaryMirror();
  const source = fixture({ importMeta: true });
  try {
    await assert.rejects(
      materializeCmsPublicJsrMirror({
        lock: source.lock,
        output: temporary.output,
        fetchImplementation: source.fetchImplementation,
      }),
      /G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_IMPORT_META_REFUSED/,
    );
  } finally {
    await rm(temporary.parent, { recursive: true, force: true });
  }
});

test("loader refuses post-materialization byte tampering", async () => {
  const temporary = await temporaryMirror();
  const source = fixture();
  try {
    await materializeCmsPublicJsrMirror({
      lock: source.lock,
      output: temporary.output,
      fetchImplementation: source.fetchImplementation,
    });
    await writeFile(
      join(temporary.output, "@supabase", "supabase-js", "2.112.4", "src", "index.ts"),
      "export const createClient = () => false;\n",
      "utf8",
    );
    await assert.rejects(
      loadCmsPublicJsrMirror({ root: temporary.output, lock: source.lock }),
      /G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_/,
    );
  } finally {
    await rm(temporary.parent, { recursive: true, force: true });
  }
});

test("loader refuses files outside the exact version manifests", async () => {
  const temporary = await temporaryMirror();
  const source = fixture();
  try {
    await materializeCmsPublicJsrMirror({
      lock: source.lock,
      output: temporary.output,
      fetchImplementation: source.fetchImplementation,
    });
    await writeFile(join(temporary.output, "unexpected.ts"), "export {};\n", "utf8");
    await assert.rejects(
      loadCmsPublicJsrMirror({ root: temporary.output, lock: source.lock }),
      /G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_REFUSED/,
    );
  } finally {
    await rm(temporary.parent, { recursive: true, force: true });
  }
});

test(
  "loader refuses POSIX filenames whose literal backslash could alias a sealed path",
  { skip: sep !== "/" },
  async () => {
    const temporary = await temporaryMirror();
    const source = fixture();
    try {
      await materializeCmsPublicJsrMirror({
        lock: source.lock,
        output: temporary.output,
        fetchImplementation: source.fetchImplementation,
      });
      await writeFile(join(temporary.output, "rogue\\alias.ts"), "refused\n", "utf8");
      await assert.rejects(
        loadCmsPublicJsrMirror({ root: temporary.output, lock: source.lock }),
        /G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_PATH_REFUSED/,
      );
    } finally {
      await rm(temporary.parent, { recursive: true, force: true });
    }
  },
);

test("loader refuses a package file missing from the sealed tree", async () => {
  const temporary = await temporaryMirror();
  const source = fixture();
  try {
    await materializeCmsPublicJsrMirror({
      lock: source.lock,
      output: temporary.output,
      fetchImplementation: source.fetchImplementation,
    });
    await rm(join(temporary.output, "@supabase", "supabase-js", "2.112.4", "src", "index.ts"));
    await assert.rejects(
      loadCmsPublicJsrMirror({ root: temporary.output, lock: source.lock }),
      /G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_PACKAGE_FILE_REFUSED/,
    );
  } finally {
    await rm(temporary.parent, { recursive: true, force: true });
  }
});

test("loader refuses symlinks anywhere in the mirror", async () => {
  const temporary = await temporaryMirror();
  const source = fixture();
  const external = join(temporary.parent, "external");
  try {
    await materializeCmsPublicJsrMirror({
      lock: source.lock,
      output: temporary.output,
      fetchImplementation: source.fetchImplementation,
    });
    await mkdir(external);
    await symlink(external, join(temporary.output, "linked"), "junction");
    await assert.rejects(
      loadCmsPublicJsrMirror({ root: temporary.output, lock: source.lock }),
      /G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SYMLINK_REFUSED/,
    );
  } finally {
    await rm(temporary.parent, { recursive: true, force: true });
  }
});
