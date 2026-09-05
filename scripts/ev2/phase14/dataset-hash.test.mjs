import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hashDatasetText } from "./dataset-hash.mjs";

const EXPECTED_DATASET_HASH = "9721baaa99e79d199a1ec198974b5299c43d3c6ea27aee2e1572188fd920f035";

test("G14 dataset hash is stable across LF and CRLF checkouts", () => {
  const raw = readFileSync(new URL("./eval-dataset.json", import.meta.url), "utf8");
  const lf = raw.replace(/\r\n?/g, "\n");
  const crlf = lf.replace(/\n/g, "\r\n");

  assert.equal(hashDatasetText(lf), EXPECTED_DATASET_HASH);
  assert.equal(hashDatasetText(crlf), EXPECTED_DATASET_HASH);
});

test("G14 dataset hash rejects non-text input", () => {
  assert.throws(() => hashDatasetText(undefined), /datasetText must be a string/);
});
