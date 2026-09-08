import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const workflowDirectory = ".github/workflows";

function workflowSteps(source) {
  const starts = [...source.matchAll(/^ {6}- /gm)].map((match) => match.index);
  return starts.map((start, index) => source.slice(start, starts[index + 1] ?? source.length));
}

test("GitHub Actions workflows avoid unsupported YAML merges and invalid self step outputs", () => {
  for (const file of readdirSync(workflowDirectory).filter((name) => name.endsWith(".yml"))) {
    const source = readFileSync(`${workflowDirectory}/${file}`, "utf8");
    assert.doesNotMatch(source, /^\s*<<:/m, `${file}: YAML merge keys are unsupported by GitHub Actions`);
    assert.doesNotMatch(
      source,
      /--run-id\s+["']?\$\{\{\s*inputs\./,
      `${file}: workflow run IDs must enter the shell through an environment variable`,
    );

    for (const step of workflowSteps(source)) {
      const stepName = step.match(/^ {6}- name:\s*(.+)$/m)?.[1] ?? "unnamed step";
      const environmentMappings = step.match(/^ {8}env:\s*(?:&[^\s]+)?\s*$/gm) ?? [];
      assert.ok(environmentMappings.length <= 1, `${file}:${stepName}: duplicate env mapping`);

      const stepId = step.match(/^ {8}id:\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*$/m)?.[1];
      if (stepId) {
        assert.equal(
          step.includes(`steps.${stepId}.outputs.`),
          false,
          `${file}:${stepName}: a step cannot consume its own outputs`,
        );
      }
    }
  }
});
