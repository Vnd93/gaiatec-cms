import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { loadEnv } from "vite";

const source = new URL("../cloudflare/_worker.js", import.meta.url);
const destination = new URL("../dist/_worker.js", import.meta.url);
await access(source, constants.R_OK);
const env = loadEnv("production", process.cwd(), "");
const publicApi = `${env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321"}/functions/v1/cms-public`;
const anonKey = env.VITE_SUPABASE_ANON_KEY ?? "";
const worker = (await readFile(source, "utf8"))
  .replace("__CMS_PUBLIC_API__", publicApi)
  .replace("__CMS_PUBLIC_ANON_KEY__", anonKey);
await writeFile(destination, worker);
console.log("Prepared Cloudflare Pages Worker with route/status/security containment.");
