import { access, copyFile } from "node:fs/promises";
import { constants } from "node:fs";

const source = new URL("../cloudflare/_worker.js", import.meta.url);
const destination = new URL("../dist/_worker.js", import.meta.url);
await access(source, constants.R_OK);
await copyFile(source, destination);
console.log("Prepared Cloudflare Pages Worker with route/status/security containment.");
