export const DEPLOYMENT_COMMIT_MESSAGE_MAX_BYTES = 4 * 1024;

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function isDeploymentCommitMessage(value, maximumBytes = DEPLOYMENT_COMMIT_MESSAGE_MAX_BYTES) {
  const utf8 = typeof value === "string" ? Buffer.from(value, "utf8") : null;
  return (
    typeof value === "string" &&
    Number.isSafeInteger(maximumBytes) &&
    maximumBytes >= 0 &&
    !value.includes("\0") &&
    utf8.length <= maximumBytes &&
    utf8.toString("utf8") === value
  );
}

export function encodeDeploymentCommitMessage(value, maximumBytes = DEPLOYMENT_COMMIT_MESSAGE_MAX_BYTES) {
  if (!isDeploymentCommitMessage(value, maximumBytes))
    throw new Error("G12_DEPLOYMENT_COMMIT_MESSAGE_REFUSED");
  return Buffer.from(value, "utf8").toString("base64");
}

export function decodeDeploymentCommitMessage(encoded, maximumBytes = DEPLOYMENT_COMMIT_MESSAGE_MAX_BYTES) {
  const maximumEncodedLength = 4 * Math.ceil(maximumBytes / 3);
  if (typeof encoded !== "string" || encoded.length > maximumEncodedLength || !BASE64_PATTERN.test(encoded))
    throw new Error("G12_DEPLOYMENT_COMMIT_MESSAGE_ENCODING_REFUSED");
  const value = Buffer.from(encoded, "base64").toString("utf8");
  if (
    !isDeploymentCommitMessage(value, maximumBytes) ||
    Buffer.from(value, "utf8").toString("base64") !== encoded
  )
    throw new Error("G12_DEPLOYMENT_COMMIT_MESSAGE_ENCODING_REFUSED");
  return value;
}
