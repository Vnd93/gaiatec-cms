import { createHash } from "node:crypto";

export function hashDatasetText(datasetText) {
  if (typeof datasetText !== "string") {
    throw new TypeError("datasetText must be a string");
  }

  const normalizedText = datasetText.replace(/\r\n?/g, "\n");
  return createHash("sha256").update(normalizedText, "utf8").digest("hex");
}
