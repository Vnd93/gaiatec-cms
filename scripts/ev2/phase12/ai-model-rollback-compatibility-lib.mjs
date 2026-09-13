import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

export const AI_LEGACY_RESPONSE_MODEL = "nvidia/nemotron-3.5-lightning:free";
export const AI_ACTIVE_RESPONSE_MODEL = "inclusionai/ling-3.0-flash-vl:free";

const MAX_REMOTE_JAVASCRIPT_ASSETS = 256;
const JAVASCRIPT_SPECIFIER = String.raw`[^"']+\.m?js(?:\?[^"']*)?`;
const VITE_ASSET_REFERENCE = String.raw`(?:\.{1,2}\/|\/assets\/|assets\/)[^"']+\.m?js(?:\?[^"']*)?`;

function bundledJavaScript(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if ([".js", ".mjs", ".cjs"].includes(extname(entry.name))) files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

const occurrences = (source, fragment) => source.split(fragment).length - 1;
const modelBindings = (source) =>
  [...source.matchAll(/(providerModel|allowedModel):\s*([^,\r\n]+)/g)].map((match) => ({
    field: match[1],
    schema: match[2].trim(),
  }));

function importedJavaScriptReferences(source) {
  const references = new Set();
  const collect = (pattern) => {
    for (const match of source.matchAll(pattern)) references.add(match[1]);
  };

  collect(new RegExp(`\\bimport\\s*\\(\\s*["'](${JAVASCRIPT_SPECIFIER})["']\\s*\\)`, "g"));
  collect(
    new RegExp(`\\b(?:import|export)\\s*(?:[^"';()]*?\\bfrom\\s*)?["'](${JAVASCRIPT_SPECIFIER})["']`, "g"),
  );

  // Vite records preload dependencies in a generated m.f||(m.f=[...]) table.
  // Restrict extraction to that table so ordinary strings such as Node shim
  // filenames cannot be mistaken for deployed chunks.
  for (const table of source.matchAll(
    /\b([A-Za-z_$][\w$]*)\.f\s*\|\|\s*\(\s*\1\.f\s*=\s*\[([\s\S]*?)\]\s*\)/g,
  )) {
    for (const match of table[2].matchAll(new RegExp(`["'](${VITE_ASSET_REFERENCE})["']`, "g")))
      references.add(match[1]);
  }

  return [...references];
}

export function evaluateAiModelRollbackCompatibility(sourceRoot, distRoot) {
  const assets = bundledJavaScript(distRoot);
  return evaluateAiModelRollbackCompatibilityBundle(
    sourceRoot,
    assets.map((file) => readFileSync(file, "utf8")),
  );
}

export function evaluateAiModelRollbackCompatibilityBundle(sourceRoot, bundles) {
  const assistPath = join(sourceRoot, "src", "shared", "contracts", "ev2-ai.ts");
  const executionPath = join(sourceRoot, "src", "shared", "contracts", "ev2-ai-execute.ts");
  const assist = existsSync(assistPath) ? readFileSync(assistPath, "utf8") : "";
  const execution = existsSync(executionPath) ? readFileSync(executionPath, "utf8") : "";
  const violations = [];

  if (!assist.includes(`EV2_AI_ACTIVE_OPENROUTER_MODEL = "${AI_ACTIVE_RESPONSE_MODEL}"`))
    violations.push("active_model_contract_missing");
  if (!assist.includes(AI_LEGACY_RESPONSE_MODEL)) violations.push("legacy_response_model_missing");
  if (!assist.includes("z.enum(EV2_AI_COMPATIBLE_RESPONSE_MODELS)"))
    violations.push("compatible_response_schema_missing");
  if (occurrences(assist, "Ev2AiCompatibleResponseModelSchema") < 6)
    violations.push("assist_response_fields_not_bridged");
  const assistBindings = modelBindings(assist);
  if (
    !assistBindings.length ||
    assistBindings.some(({ schema }) => schema !== "Ev2AiCompatibleResponseModelSchema")
  )
    violations.push("assist_literal_model_binding_present");
  if (!execution.includes('import { Ev2AiCompatibleResponseModelSchema } from "./ev2-ai"'))
    violations.push("execution_bridge_import_missing");
  if (occurrences(execution, "CompatibleResponseModel") < 5)
    violations.push("execution_response_fields_not_bridged");
  const executionBindings = modelBindings(execution);
  if (
    !executionBindings.length ||
    executionBindings.some(
      ({ field, schema }) =>
        schema !== "CompatibleResponseModel" &&
        !(field === "allowedModel" && schema === "CompatibleResponseModel.optional()"),
    )
  )
    violations.push("execution_literal_model_binding_present");
  if (!Array.isArray(bundles) || !bundles.length) violations.push("frontend_bundle_missing");
  const bundle = Array.isArray(bundles) ? bundles.join("\n") : "";
  if (!bundle.includes(AI_ACTIVE_RESPONSE_MODEL)) violations.push("active_model_bundle_missing");
  if (!bundle.includes(AI_LEGACY_RESPONSE_MODEL)) violations.push("legacy_model_bundle_missing");
  if (
    !Array.isArray(bundles) ||
    !bundles.some(
      (asset) => asset.includes(AI_ACTIVE_RESPONSE_MODEL) && asset.includes(AI_LEGACY_RESPONSE_MODEL),
    )
  )
    violations.push("compatible_models_not_colocated_in_bundle");

  return {
    schemaVersion: 1,
    event: "g12.ai-model.rollback-compatibility",
    activeModel: AI_ACTIVE_RESPONSE_MODEL,
    legacyResponseModel: AI_LEGACY_RESPONSE_MODEL,
    sourceBridgeVerified: violations.every((item) => item.includes("bundle")),
    bundleBridgeVerified: violations.every((item) => !item.includes("bundle")),
    inspectedBundleFiles: Array.isArray(bundles) ? bundles.length : 0,
    violations,
    outcome: violations.length === 0 ? "pass" : "fail",
  };
}

export async function fetchAiModelRollbackBundle(originValue, fetchImplementation = fetch) {
  const origin = new URL(originValue);
  if (
    origin.protocol !== "https:" ||
    !/^[a-z0-9-]+\.gaiatec-website\.pages\.dev$/.test(origin.hostname) ||
    origin.port ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("G12_AI_MODEL_ROLLBACK_ORIGIN_REFUSED");
  let totalBytes = 0;
  const request = async (url, type) => {
    const response = await fetchImplementation(url, {
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: type },
    });
    if (!response.ok) throw new Error(`G12_AI_MODEL_ROLLBACK_FETCH_FAILED:${response.status}`);
    const body = await response.text();
    const bytes = Buffer.byteLength(body, "utf8");
    totalBytes += bytes;
    if (bytes > 10 * 1024 * 1024 || totalBytes > 30 * 1024 * 1024)
      throw new Error("G12_AI_MODEL_ROLLBACK_ASSET_TOO_LARGE");
    return body;
  };
  const html = await request(origin.href, "text/html");
  const initialScripts = [
    ...new Set(
      [
        ...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+\.m?js(?:\?[^"']*)?)["'][^>]*>/gi),
      ].map((match) => {
        const script = new URL(match[1], origin);
        if (script.origin !== origin.origin || !/\.m?js(?:$|\?)/.test(script.pathname + script.search))
          throw new Error("G12_AI_MODEL_ROLLBACK_ASSET_REFUSED");
        return script.href;
      }),
    ),
  ];
  if (!initialScripts.length) throw new Error("G12_AI_MODEL_ROLLBACK_ASSET_SET_INVALID");
  const queue = [...initialScripts];
  const seen = new Set();
  const bodies = [];
  while (queue.length) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    if (seen.size >= MAX_REMOTE_JAVASCRIPT_ASSETS) throw new Error("G12_AI_MODEL_ROLLBACK_ASSET_SET_INVALID");
    seen.add(current);
    const body = await request(current, "text/javascript");
    bodies.push(body);
    for (const reference of importedJavaScriptReferences(body)) {
      const child = new URL(reference.startsWith("assets/") ? `/${reference}` : reference, current);
      if (child.origin !== origin.origin) throw new Error("G12_AI_MODEL_ROLLBACK_ASSET_REFUSED");
      if (!seen.has(child.href)) queue.push(child.href);
    }
  }
  return bodies;
}
