import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildProductInput, normalizeName, slugify, uuidV5, validateManifest } from "./operational-pilot.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(directory, "operational-pilot.json"), "utf8"));

function catalogFor(product) {
  const values = [
    ["manufacturer", product.manufacturer ?? manifest.placeholders.manufacturer],
    ["brand", product.brand],
    ["category", product.category],
    ["magnitude", product.magnitude],
    ["technology", product.technology],
    ["monitored_element", manifest.placeholders.monitoredElement],
  ].filter(([, name]) => name);
  return {
    byKey: new Map(
      values.map(([type, name]) => [
        `${type}:${normalizeName(name)}`,
        { id: uuidV5(`test:${type}:${name}`), canonical_name: name },
      ]),
    ),
  };
}

test("operational pilot manifest is source-safe and reaches the G4 identity threshold", () => {
  const result = validateManifest(manifest);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.productCount, 20);
  assert.equal(result.completeness, 97);
  assert.deepEqual(result.blocked, ["GAI-0691", "GAI-0696"]);
  assert.deepEqual(result.incomplete, ["GAI-1130"]);
});

test("manifest rejects inferred MPN, GTIN, NCM or SKU", () => {
  for (const forbidden of ["mpn", "gtin", "ncm", "sku"]) {
    const changed = structuredClone(manifest);
    changed.products[0][forbidden] = "INFERIDO";
    const result = validateManifest(changed);
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), new RegExp(forbidden));
  }
});

test("blocked product uses explicit placeholders and never receives inferred identifiers", () => {
  const source = manifest.products.find((product) => product.masterId === "GAI-0691");
  const product = buildProductInput(
    source,
    manifest,
    catalogFor(source),
    { definitionId: uuidV5("test:range-definition") },
    "2026-09-02T12:00:00.000Z",
  );
  assert.equal(
    product.masterData.manufacturerId,
    uuidV5(`test:manufacturer:${manifest.placeholders.manufacturer}`),
  );
  assert.equal(product.models[0].name, "GATSONIC NV-CP");
  assert.equal(Object.hasOwn(product.models[0], "mpn"), false);
  assert.deepEqual(
    product.externalIdentifiers.map((item) => item.kind),
    ["other"],
  );
  assert.equal(product.provenance[0].confidence, 0.5);
  assert.equal(source.skuEligible, false);
});

test("documented ranges remain pending REV-01 homologation", () => {
  const source = manifest.products.find((product) => product.masterId === "GAI-0007");
  const product = buildProductInput(
    source,
    manifest,
    catalogFor(source),
    { definitionId: uuidV5("test:range-definition") },
    "2026-09-02T12:00:00.000Z",
  );
  assert.deepEqual(product.attributes[0].value, { min: 0, max: 1000 });
  assert.equal(product.attributes[0].unitCode, "mg/L");
  assert.equal(product.attributes[0].homologated, false);
});

test("stable identities and slugs are reproducible", () => {
  assert.equal(uuidV5("same"), uuidV5("same"));
  assert.notEqual(uuidV5("same"), uuidV5("other"));
  assert.equal(slugify("Módulo de Telemetria MT-331"), "modulo-de-telemetria-mt-331");
});

test("Edge adapter keeps an unknown brand distinct from its manufacturer", () => {
  const edge = readFileSync(path.resolve(directory, "../../../supabase/functions/cms-pim/index.ts"), "utf8");
  assert.match(edge, /const brandName = label\(product\.masterData\.brandId, "Marca não informada"\)/);
  assert.doesNotMatch(edge, /brand:\s*\{\s*name:\s*label\(product\.masterData\.brandId, manufacturerName\)/);
});

test("operational actor is suspended with a database-supported status", () => {
  const runner = readFileSync(path.join(directory, "operational-pilot.mjs"), "utf8");
  assert.match(runner, /status: "suspended",[\s\S]*suspended_at: new Date\(\)\.toISOString\(\)/);
  assert.match(runner, /status: "active",[\s\S]*suspended_at: null/);
  assert.doesNotMatch(runner, /body: \{ status: "inactive" \}/);
});
