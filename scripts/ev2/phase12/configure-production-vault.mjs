import { escapeSqlLiteral, managementRequest, PRODUCTION_PROJECT_REF } from "./production-backend-lib.mjs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF;
const workerSecret = process.env.OUTBOX_WORKER_SECRET;
if (projectRef !== PRODUCTION_PROJECT_REF || !token || !/^[a-f0-9]{64}$/.test(workerSecret ?? ""))
  throw new Error("G12_PRODUCTION_VAULT_CONFIG_BLOCKED");

const workerUrl = `https://${PRODUCTION_PROJECT_REF}.supabase.co/functions/v1/cms-outbox-worker`;
const query = `
do $$
declare
  target_id uuid;
begin
  select id into target_id from vault.secrets where name = 'cms_outbox_worker_url' limit 1;
  if target_id is null then
    perform vault.create_secret(${escapeSqlLiteral(workerUrl)}, 'cms_outbox_worker_url', 'EV2 production outbox endpoint');
  else
    perform vault.update_secret(target_id, new_secret := ${escapeSqlLiteral(workerUrl)});
  end if;

  target_id := null;
  select id into target_id from vault.secrets where name = 'cms_outbox_worker_secret' limit 1;
  if target_id is null then
    perform vault.create_secret(${escapeSqlLiteral(workerSecret)}, 'cms_outbox_worker_secret', 'EV2 production outbox credential');
  else
    perform vault.update_secret(target_id, new_secret := ${escapeSqlLiteral(workerSecret)});
  end if;
end $$;
`;

const verifyOnly = process.argv.includes("--verify-only");
if (!verifyOnly)
  await managementRequest(`/v1/projects/${PRODUCTION_PROJECT_REF}/database/query`, {
    method: "POST",
    token,
    body: { query },
  });

const [verification] = await managementRequest(`/v1/projects/${PRODUCTION_PROJECT_REF}/database/query`, {
  method: "POST",
  token,
  body: {
    query: `select
      exists(select 1 from vault.decrypted_secrets where name = 'cms_outbox_worker_url' and decrypted_secret = ${escapeSqlLiteral(workerUrl)}) as worker_url_ok,
      exists(select 1 from vault.decrypted_secrets where name = 'cms_outbox_worker_secret' and decrypted_secret = ${escapeSqlLiteral(workerSecret)}) as worker_secret_ok`,
  },
});
if (verification?.worker_url_ok !== true || verification?.worker_secret_ok !== true)
  throw new Error("G12_PRODUCTION_VAULT_CONFIG_VERIFICATION_FAILED");

console.log(
  JSON.stringify({
    event: "g12.production.vault.verified",
    configuredSecrets: 2,
    mode: verifyOnly ? "verify-only" : "configure-and-verify",
  }),
);
