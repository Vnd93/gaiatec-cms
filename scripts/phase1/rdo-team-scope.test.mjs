import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  findAuthUserByEmail,
  listAllAuthUsers,
} from "../../supabase/functions/_shared/auth-admin-pagination.ts";
import { listAllActiveRdoAdminIds } from "../../supabase/functions/_shared/rdo-access-pagination.ts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

function directory(pages, calls, errorPage = null) {
  return {
    auth: {
      admin: {
        async listUsers({ page, perPage }) {
          calls.push({ page, perPage });
          if (page === errorPage) return { data: null, error: new Error("provider unavailable") };
          return { data: pages[page - 1] ?? { users: [] }, error: null };
        },
      },
    },
  };
}

test("Auth directory enumeration crosses every page without a 1000-user ceiling", async () => {
  const calls = [];
  const admin = directory(
    [
      { users: [{ id: "u1" }, { id: "u2" }], total: 5 },
      { users: [{ id: "u3" }, { id: "u4" }], total: 5 },
      { users: [{ id: "u5" }], total: 5 },
    ],
    calls,
  );
  const result = await listAllAuthUsers(admin, 2);
  assert.equal(result.error, null);
  assert.deepEqual(
    result.users.map(({ id }) => id),
    ["u1", "u2", "u3", "u4", "u5"],
  );
  assert.deepEqual(calls, [
    { page: 1, perPage: 2 },
    { page: 2, perPage: 2 },
    { page: 3, perPage: 2 },
  ]);
});

test("OTP lookup finds a case-insensitive identity and still completes pagination", async () => {
  const calls = [];
  const admin = directory(
    [
      {
        users: [
          { id: "u1", email: "one@example.test" },
          { id: "u2", email: "two@example.test" },
        ],
      },
      {
        users: [
          { id: "u3", email: "Target@Example.Test" },
          { id: "u4", email: "four@example.test" },
        ],
      },
    ],
    calls,
  );
  const result = await findAuthUserByEmail(admin, " target@example.test ", 2);
  assert.equal(result.error, null);
  assert.equal(result.user?.id, "u3");
  assert.deepEqual(
    calls.map(({ page }) => page),
    [1, 2, 3],
  );
});

test("Auth pagination fails explicitly on a repeated provider page", async () => {
  const repeated = { users: [{ id: "u1" }, { id: "u2" }] };
  const admin = directory([repeated, repeated], []);
  await assert.rejects(() => listAllAuthUsers(admin, 2), /AUTH_DIRECTORY_PAGINATION_STALLED/);
});

test("Auth pagination ignores truncated provider metadata beyond page nine", async () => {
  const calls = [];
  const pages = Array.from({ length: 12 }, (_, page) => ({
    users: [{ id: `u${page * 2 + 1}` }, { id: `u${page * 2 + 2}` }],
    nextPage: 1,
    lastPage: 1,
    total: 1,
  }));
  pages.push({ users: [{ id: "u25" }], nextPage: null, lastPage: 1, total: 1 });
  const result = await listAllAuthUsers(directory(pages, calls), 2);
  assert.equal(result.error, null);
  assert.equal(result.users.length, 25);
  assert.equal(calls.at(-1)?.page, 13);
});

test("Auth pagination neither leaks a partial list nor hides provider failure", async () => {
  const admin = directory([{ users: [{ id: "u1" }, { id: "u2" }] }], [], 2);
  const result = await listAllAuthUsers(admin, 2);
  assert.equal(result.users.length, 0);
  assert.match(String(result.error), /provider unavailable/);
});

function accessDirectory(pages, calls, errorOffset = null) {
  return {
    from(table) {
      assert.equal(table, "rdo_user_access");
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        order() {
          return chain;
        },
        async range(from, to) {
          calls.push({ from, to });
          if (from === errorOffset) return { data: null, error: new Error("access directory unavailable") };
          return { data: pages[calls.length - 1] ?? [], error: null };
        },
      };
      return chain;
    },
  };
}

test("RDO recipient enumeration crosses every PostgREST page without a silent ceiling", async () => {
  const calls = [];
  const result = await listAllActiveRdoAdminIds(
    accessDirectory(
      [[{ user_id: "u1" }, { user_id: "u2" }], [{ user_id: "u3" }, { user_id: "u4" }], [{ user_id: "u5" }]],
      calls,
    ),
    2,
  );
  assert.deepEqual(result, { ids: ["u1", "u2", "u3", "u4", "u5"], error: null });
  assert.deepEqual(calls, [
    { from: 0, to: 1 },
    { from: 2, to: 3 },
    { from: 4, to: 5 },
  ]);
});

test("RDO recipient pagination discards a partial directory on provider failure", async () => {
  const result = await listAllActiveRdoAdminIds(
    accessDirectory([[{ user_id: "u1" }, { user_id: "u2" }]], [], 2),
    2,
  );
  assert.deepEqual(result.ids, []);
  assert.match(String(result.error), /access directory unavailable/);
});

test("every RDO Auth directory consumer uses the paginated, allowlisted boundary", async () => {
  const [team, authBan, invite, command, otp, notify, sign, migration, databaseTest] = await Promise.all([
    read("supabase/functions/rdo-team/index.ts"),
    read("supabase/functions/_shared/rdo-auth-ban.ts"),
    read("supabase/functions/rdo-invite/index.ts"),
    read("supabase/functions/rdo-command/index.ts"),
    read("supabase/functions/rdo-otp/index.ts"),
    read("supabase/functions/rdo-notify/index.ts"),
    read("supabase/functions/rdo-sign/index.ts"),
    read("supabase/migrations/0059_rdo_team_scope_hardening.sql"),
    read("supabase/tests/rls_rdo_team_scope.test.sql"),
  ]);

  assert.match(team, /listAllAuthUsers\(admin\)/);
  assert.match(team, /if \(!access\) return \[\]/);
  assert.doesNotMatch(team, /listUsers\(\{ page: 1, perPage: 1000 \}\)/);
  assert.doesNotMatch(team, /\.from\("rdo_user_access"\)\.update\(/);
  assert.match(team, /rdo_apply_team_member_command/);
  assert.doesNotMatch(team, /ban_duration: "876000h"|rdo_finish_team_member_command/);
  assert.match(team, /classifyRdoAuthBan/);
  assert.match(team, /ban_duration: "none"/);
  assert.match(team, /team\.reactivate\.auth_restriction_blocked/);
  assert.match(team, /team\.reactivate\.legacy_auth_ban_cleared/);
  assert.match(team, /team\.reactivate\.legacy_auth_ban_cleared_rdo_pending/);
  assert.match(authBan, /cmsProfileStatus === "suspended"/);
  assert.match(authBan, /input\.rdoActive !== false/);
  assert.match(authBan, /Math\.abs\(legacyDuration - LEGACY_RDO_BAN_MS\)/);
  for (const authenticatedBoundary of [team, invite, command, notify]) {
    assert.match(authenticatedBoundary, /rdo_user_access/);
    assert.match(authenticatedBoundary, /\.active/);
  }
  assert.match(otp, /findAuthUserByEmail\(admin, email\)/);
  assert.match(notify, /listAllAuthUsers\(admin\)/);
  assert.match(notify, /listAllActiveRdoAdminIds\(admin\)/);
  assert.match(notify, /auth_directory_unavailable/);
  assert.match(notify, /rdo_access_directory_unavailable/);
  assert.match(sign, /listAllAuthUsers\(admin\)/);
  assert.match(sign, /listAllActiveRdoAdminIds\(admin\)/);
  assert.match(sign, /AUTH_DIRECTORY_UNAVAILABLE/);
  assert.match(sign, /RDO_ACCESS_DIRECTORY_UNAVAILABLE/);
  assert.match(sign, /NO_ACTIVE_RDO_ADMIN/);
  assert.match(sign, /validatePassivePdf\(bytes\)/);
  assert.doesNotMatch(team + otp + notify + sign, /listUsers\(\{ page: 1, perPage: 1000 \}\)/);
  assert.match(migration, /lock table public\.rdo_user_access in share row exclusive mode/);
  assert.match(migration, /RDO_TEAM_TARGET_NOT_ALLOWLISTED/);
  assert.match(migration, /RDO_TEAM_LAST_ADMIN_PROTECTED/);
  assert.match(migration, /RDO audit records are immutable/);
  assert.match(migration, /on delete restrict/);
  assert.match(migration, /rdo_reject_audit_mutation/);
  assert.doesNotMatch(migration, /management_operation_id|rdo_finish_team_member_command/);
  assert.match(databaseTest, /dual-scope identity can be suspended only from RDO/);
  assert.match(databaseTest, /service role cannot erase RDO audit attribution/);
  assert.match(databaseTest, /RDO_TEAM_LAST_ADMIN_PROTECTED/);
});
