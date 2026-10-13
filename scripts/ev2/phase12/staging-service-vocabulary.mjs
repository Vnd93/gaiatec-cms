export const SERVICE_VOCABULARY_SOURCES = Object.freeze(
  [
    [
      "public.cms_controlled_vocabularies_scoped(uuid,text,text,boolean,integer)",
      "e91a40129eb038ac72ed33bfeb481bffa4a40241249e50708654c2015dab42bd",
      true,
      "pg_catalog, public, private, pg_temp",
      "s",
    ],
    [
      "private.cms_content_payload_controlled_scope_allowed(uuid,jsonb,text)",
      "fc7963feb47fa2c84b0537f6a8b6e2f29052e96b144e57f1a950b78b74782a0a",
      false,
      "pg_catalog, public, private, pg_temp",
      "s",
    ],
    [
      "public.cms_manage_controlled_vocabulary_scoped(uuid,text,text,jsonb,jsonb,text,text,timestamp with time zone,uuid)",
      "f3c25c837b53682b7888f6e814d0857f614c32635f896bee8e7b50a01d036189",
      true,
      "pg_catalog, public, private, extensions, pg_temp",
      "v",
    ],
    [
      "private.cms_cleanup_terminal_service_shared_options_0121()",
      "1e321121df7381d2774d3745a5863b35d64346c7d59d5b60284945f2827acf46",
      false,
      "pg_catalog, public, private, extensions, pg_temp",
      "v",
    ],
    [
      "private.cms_qa_service_shared_list_allowed_0121(uuid,uuid,text)",
      "6fe9bd303e0781acf913daa85e60fd1e18bc030db8745da5e955e0346ab4059a",
      false,
      "pg_catalog, public, private, pg_temp",
      "s",
    ],
    [
      "private.cms_service_controlled_option_scope_allowed_0121(uuid,uuid,text,boolean)",
      "47d061e737ccc3aed08c0d0f8c195ce7776f62970166b4a8212214da13f85880",
      false,
      "pg_catalog, public, private, pg_temp",
      "s",
    ],
    [
      "private.cms_qa_archived_service_reference_exact_0121(uuid,text,text,text,uuid,uuid,timestamp with time zone)",
      "8c3350decbea42b296758e1105fa7465d587240ba48594ee1866f570f731d69a",
      false,
      "pg_catalog, public, private, auth, pg_temp",
      "s",
    ],
  ].map((row) => Object.freeze(row)),
);

export function serviceVocabularySemanticSql(alias) {
  if (typeof alias !== "string" || !/^[a-z][a-z0-9_]*$/.test(alias))
    throw new Error("CMS_SERVICE_VOCABULARY_ALIAS_INVALID");
  const rows = SERVICE_VOCABULARY_SOURCES.map(
    ([signature, digest, service, searchPath, volatility]) =>
      `('${signature}', '${digest}', ${service}, 'search_path=${searchPath}', '${volatility}')`,
  ).join(",");
  return `not exists (
    select 1 from (values ${rows}) as expected(signature, digest, service_allowed, configuration, volatility)
    left join pg_catalog.pg_proc p on p.oid = to_regprocedure(expected.signature)
    where p.oid is null or encode(extensions.digest(p.prosrc, 'sha256'), 'hex') <> expected.digest
      or p.prosecdef is not true or p.provolatile::text <> expected.volatility
      or p.proconfig is distinct from array[expected.configuration]::text[]
      or (expected.service_allowed and not has_function_privilege('service_role', p.oid, 'EXECUTE'))
      or exists (
        select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
        left join pg_catalog.pg_roles role on role.oid = acl.grantee
        where acl.grantee <> p.proowner and not (expected.service_allowed and coalesce(role.rolname = 'service_role', false))
      )
  ) and exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'private.cms_qa_actor_leases'::regclass
      and t.tgname = 'cms_prepare_qa_actor_terminal_service_shared_vocab_cleanup'
      and t.tgfoid = to_regprocedure('private.cms_cleanup_terminal_service_shared_options_0121()')
      and t.tgenabled = 'O' and not t.tgisinternal
      and t.tgtype = 19 and t.tgnargs = 0 and t.tgqual is null
      and t.tgattr::text = (select a.attnum::text from pg_catalog.pg_attribute a
        where a.attrelid = t.tgrelid and a.attname = 'status' and not a.attisdropped)
  ) as ${alias}`;
}
