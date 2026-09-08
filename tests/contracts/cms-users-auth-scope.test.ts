import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0070_cms_users_auth_authoritative_scope.sql", "utf8");
const refreshRevocation = readFileSync("supabase/migrations/0083_cms_session_refresh_revocation.sql", "utf8");
const usersEdge = readFileSync("supabase/functions/cms-users/index.ts", "utf8");
const sessionEdge = readFileSync("supabase/functions/cms-session/index.ts", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_users_auth_scope.test.sql", "utf8");
const sessionFinalizationPgTap = readFileSync(
  "supabase/tests/rls_cms_session_security_finalization.test.sql",
  "utf8",
);

describe("authoritative CMS identity and session scope", () => {
  it("classifies identities only from exact active server-side leases", () => {
    expect(migration).toContain("private.cms_user_actor_target_scope_allowed");
    expect(migration).toContain("target.run_tag=caller.run_tag");
    expect(migration).toContain("target.candidate_sha=caller.candidate_sha");
    expect(migration).toContain("target.environment=caller.environment");
    expect(migration).toContain("caller.status='active'");
    expect(migration).toContain("target.status='active'");
    expect(migration).toContain("private.cms_qa_actor_marker_is_exact(");
    expect(migration).toMatch(
      /else not exists\(\s*select 1 from private\.cms_qa_actor_leases target_history/s,
    );
  });

  it("routes directory reads and user commands through scoped RPCs", () => {
    expect(usersEdge).toContain('rpc("cms_users_list_scoped"');
    expect(usersEdge).toContain('rpc("cms_user_profile_scoped"');
    expect(usersEdge).toContain('"cms_user_invite_context_scoped"');
    expect(usersEdge).toContain('rpc("cms_reserve_user_command_scoped"');
    expect(usersEdge).toContain('rpc("cms_apply_user_command_scoped"');
    expect(usersEdge).not.toContain('.from("cms_profiles").select');
    expect(usersEdge).not.toContain('.from("cms_user_roles").select');
  });

  it("never enumerates the global Auth directory for a QA invitation", () => {
    expect(usersEdge).toMatch(/if \(!qaInvite\) \{[\s\S]+findExistingAuthUserByEmail/);
    expect(usersEdge).toContain("...(qaInvite ? marker : {})");
    expect(usersEdge).toContain("invitedMetadata?.candidateSha !== marker?.candidateSha");
    expect(migration).toContain("public.cms_user_invite_context_scoped");
  });

  it("keeps failed QA invitations as banned audit identities instead of violating the lease FK", () => {
    expect(usersEdge).toContain('rpc("cms_abandon_qa_invite_scoped"');
    expect(usersEdge).toMatch(/createdAuthUser && qaInvite[\s\S]+cms_abandon_qa_invite_scoped/);
    expect(migration).toContain("last_error_code='invite_apply_failed'");
    expect(migration).toContain("clock_timestamp()+interval '100 years'");
    expect(migration).toContain("'cms:qa.invite_abandoned'");
  });

  it("serializes lease termination and protects the last super inside each actor scope", () => {
    expect(migration).toMatch(
      /cms_apply_user_command_scoped[\s\S]+cms_lock_active_qa_actor_leases[\s\S]+cms-users:last-super[\s\S]+for update/s,
    );
    expect(migration).toContain("private.cms_user_actor_target_scope_allowed(");
    expect(migration).toContain("CMS_LAST_SUPER_ADMIN");
    expect(pgTap).toContain("QA super users from another run cannot satisfy the corporate last-super guard");
  });

  it("rejects expired or environment-mismatched QA sessions before profile mutation", () => {
    expect(sessionEdge).toContain('rpc("cms_resolve_session_scoped"');
    expect(sessionEdge).toContain("isConfiguredCmsEnvironment(configuredEnvironment)");
    expect(migration).toMatch(
      /cms_resolve_session_scoped[\s\S]+cms_user_actor_context_active[\s\S]+cms_lock_active_qa_actor_leases[\s\S]+cms_resolve_session_unscoped_0070/s,
    );
    expect(pgTap).toContain("a staging QA identity cannot resolve a production CMS session");
  });

  it("revokes every current Auth session transactionally across revoke, suspend and reactivate", () => {
    expect(refreshRevocation).toContain("create or replace function public.cms_apply_user_command_scoped");
    expect(refreshRevocation).toMatch(
      /v_result:=public\.cms_apply_user_command_unscoped_0070[\s\S]+p_action in \('revoke_sessions','suspend','reactivate'\)[\s\S]+\(v_result->>'duplicate'\)[\s\S]+insert into public\.cms_session_revocations/s,
    );
    expect(refreshRevocation).toContain("from public.cms_login_events event");
    expect(refreshRevocation).toContain("event.session_id_hash is not null");
    expect(refreshRevocation).toContain("from auth.sessions auth_session");
    expect(refreshRevocation).toContain("auth_session.user_id=p_target_user_id");
    expect(refreshRevocation).toContain("extensions.digest(auth_session.id::text,'sha256')");
    expect(refreshRevocation).toContain("on conflict(session_id_hash) do update");
    expect(refreshRevocation).not.toMatch(/(?:delete\s+from|update)\s+auth\.(?:sessions|users)/i);
    expect(pgTap).toContain("a refreshed JWT cannot replay the same revoked CMS session id");
    expect(pgTap).toContain("CMS-only revocation does not ban the shared Auth identity used by RDO");
    expect(sessionFinalizationPgTap).toContain(
      "revoke_sessions captures an unobserved current session directly from auth.sessions",
    );
    expect(sessionFinalizationPgTap).toContain(
      "reactivate captures a session created while the CMS identity was suspended",
    );
    expect(sessionFinalizationPgTap).toContain(
      "an idempotent reactivate replay does not revoke a post-reactivation session",
    );
    expect(sessionFinalizationPgTap).toContain("suspend and reactivate do not mutate RDO access");
  });

  it("derives the MFA gate from critical effective permissions for legacy and scoped admins", () => {
    expect(refreshRevocation).toContain("create or replace function public.cms_resolve_session_scoped");
    expect(refreshRevocation).toContain("permission.critical");
    expect(refreshRevocation).toContain("create or replace function public.cms_resolve_scoped_access");
    expect(refreshRevocation).toMatch(
      /cms_resolve_scoped_access[\s\S]+permission\.permission_key=any\(v_permissions\)[\s\S]+permission\.critical/s,
    );
    expect(sessionFinalizationPgTap).toContain(
      "an admin with a critical permission is directed to MFA while still at AAL1",
    );
    expect(sessionFinalizationPgTap).toContain("the same admin session enters the CMS after AAL2 elevation");
    expect(sessionFinalizationPgTap).toContain("scoped admin access remains closed at AAL1");
    expect(sessionFinalizationPgTap).toContain("scoped admin access opens after AAL2 elevation");
  });

  it("revokes CMS logout before provider sign-out and blocks refresh replay", () => {
    expect(refreshRevocation).toMatch(
      /if p_event_type='logout'[\s\S]+insert into public\.cms_session_revocations/s,
    );
    expect(refreshRevocation).toContain("'self_logout'");
    expect(sessionFinalizationPgTap).toContain("logout atomically revokes the current CMS session id");
    expect(sessionFinalizationPgTap).toContain(
      "refresh replay after CMS logout remains forbidden even if Auth sign-out failed",
    );
    expect(sessionFinalizationPgTap).toContain("CMS logout preserves the independent RDO grant");
  });

  it("keeps unscoped and compatibility entry points unreachable to API roles", () => {
    for (const name of [
      "cms_reserve_user_command_unscoped_0070",
      "cms_apply_user_command_unscoped_0070",
      "cms_resolve_session_unscoped_0070",
    ]) {
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${name}[\\s\\S]+service_role`));
    }
    expect(migration).toContain("CMS_USERS_UNSCOPED_RPC_EXPOSED");
    expect(migration).toContain("CMS_USERS_COMPAT_RPC_EXPOSED");
  });

  it("scopes business-directory RLS while preserving corporate audit governance", () => {
    for (const policy of [
      "cms_profiles_self_or_users_read",
      "cms_user_roles_self_or_users_read",
      "cms_session_revocations_self_or_users_read",
      "cms_login_events_self_or_audit_read",
      "cms_audit_authorized_read",
    ]) {
      expect(migration).toContain(`create policy ${policy}`);
    }
    expect(migration).toMatch(/when not exists\([\s\S]+cms_qa_actor_leases history[\s\S]+then true/);
    expect(pgTap).toContain("corporate auditors retain the complete QA audit trail");
    expect(pgTap).toContain("QA auditors see only actors from their exact active run");
  });
});
