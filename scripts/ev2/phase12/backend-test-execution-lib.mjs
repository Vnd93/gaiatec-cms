const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const packageScriptInvokes = (script, target) =>
  new RegExp(`(?:^|&&)\\s*npm run ${escapeRegExp(target)}(?:\\s|$)`).test(script ?? "");

export function candidateTestRunner(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (/^supabase\/tests\/[a-z0-9_-]+\.test\.sql$/.test(normalized)) return "supabase-test-db";
  if (/^tests\/(?:unit|contracts|components)\/.+\.test\.tsx?$/.test(normalized)) return "test";
  if (/^scripts\/qa\/[a-z0-9_-]+\.test\.mjs$/.test(normalized)) return "test:qa";
  const ev2 = normalized.match(/^scripts\/ev2\/(phase\d+)\/[a-z0-9_-]+\.test\.mjs$/);
  if (ev2) return `test:ev2:${ev2[1]}`;
  const phase = normalized.match(/^scripts\/(phase\d+)\/[a-z0-9_-]+\.test\.mjs$/);
  if (phase) return phase[1] === "phase2" ? "test:integration" : `test:${phase[1]}`;
  return "";
}

export function candidateTestIsCiExecuted(relativePath, packageManifest, ciWorkflow) {
  const runner = candidateTestRunner(relativePath);
  if (!runner) return false;
  if (runner === "supabase-test-db") return /^\s*- run: supabase test db\s*$/m.test(ciWorkflow);
  if (!/^\s*- run: npm run check\s*$/m.test(ciWorkflow)) return false;
  const scripts = packageManifest?.scripts ?? {};
  if (!packageScriptInvokes(scripts.check, runner)) return false;
  const command = scripts[runner] ?? "";
  if (runner === "test") return /(?:^|\s)vitest run(?:\s|$)/.test(command);
  const normalized = relativePath.replaceAll("\\", "/");
  const directory = normalized.slice(0, normalized.lastIndexOf("/"));
  return command.includes(`node --test ${directory}/*.test.mjs`);
}
