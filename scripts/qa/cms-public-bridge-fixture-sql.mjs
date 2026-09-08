export function sqlJson(value) {
  const encoded = Buffer.from(JSON.stringify(value), "utf8").toString("base64");
  return `convert_from(decode('${encoded}','base64'),'UTF8')::jsonb`;
}

export function revisionProvenanceSql(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("QA_CMS_PUBLIC_BRIDGE_REVISION_PROVENANCE_INVALID");
  }
  return sqlJson(value);
}
