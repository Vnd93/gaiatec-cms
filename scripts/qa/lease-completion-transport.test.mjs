// Regressao dos dois patches pedidos pela Faixa A em C:\dev\cms-site\PEDIDOS_FAIXA_C.md.
//
// 1. O encerramento de lease da fixture de navegador nao pode morrer no `statement_timeout` de oito
//    segundos herdado do `authenticator`, e a troca de transporte tem de ser cirurgica: apenas
//    `cms_complete_qa_actor_lease`, apenas em SQLSTATE 57014, com teto explicito.
// 2. Nenhuma navegacao da suite `@a11y` pode voltar a usar `networkidle`, que nao assenta contra um
//    origin publicado com service worker ativo.
//
// Os dois sao verificacao de fonte, local e sem rede: o que se prova aqui e a forma do codigo que vai
// rodar contra staging, antes de gastar um candidato para descobrir.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const FIXTURE = "scripts/qa/cms-browser-fixture.mjs";
const PUBLIC_BRIDGE_FIXTURE = "scripts/qa/cms-public-bridge-fixture.mjs";
const MIGRATION_CANARY = "scripts/ev2/phase12/staging-migrations-canary.mjs";
// A guarda lia UM arquivo enquanto o passo 48 roda DOIS specs, nos dois projetos do Playwright.
// Proibir `networkidle` em um e deixar o vizinho livre e a forma mais barata de a regra existir
// sem valer: products-catalog.spec.ts mantinha tres navegacoes contra o mesmo alias publicado.
const SPEC = "tests/e2e/routes-and-a11y.spec.ts";
const PUBLISHED_ALIAS_SPECS = [SPEC, "tests/e2e/products-catalog.spec.ts"];

const read = (path) => readFile(path, "utf8");

test("a troca de transporte do encerramento de lease e cirurgica", async () => {
  const fixture = await read(FIXTURE);
  const body = fixture.slice(
    fixture.indexOf("async function completeActorLease"),
    fixture.indexOf("async function createScopedRoleAssignments"),
  );
  assert.ok(body.length > 0, "completeActorLease nao encontrada");

  // O caminho normal do PostgREST continua sendo o primeiro, e continua sendo o unico quando passa.
  assert.match(body, /context\.admin\.rpc\("cms_complete_qa_actor_lease"/);

  // A queda para o transporte duravel acontece so nesta funcao e so neste SQLSTATE.
  assert.match(body, /leaseStatementTimedOut\(result\.error\)/);
  assert.match(fixture, /function leaseStatementTimedOut\([\s\S]{0,240}57014/);
  assert.match(body, /select public\.cms_complete_qa_actor_lease\(/);

  // Nenhuma outra chamada do arquivo troca de transporte por timeout.
  const durableCalls = fixture.match(/set statement_timeout = /g) ?? [];
  assert.equal(durableCalls.length, 1, "apenas o encerramento de lease arma teto proprio");
});

test("o teto de statement e estritamente menor que o teto de requisicao", async () => {
  const fixture = await read(FIXTURE);
  const statement = Number(
    /LEASE_COMPLETION_STATEMENT_TIMEOUT_MS = ([0-9_]+)/.exec(fixture)?.[1].replaceAll("_", ""),
  );
  const request = Number(
    /LEASE_COMPLETION_REQUEST_TIMEOUT_MS = ([0-9_]+)/.exec(fixture)?.[1].replaceAll("_", ""),
  );
  assert.ok(Number.isFinite(statement) && Number.isFinite(request), "tetos nao declarados");

  // Se o abort da requisicao cortar antes, a causa do banco se perde e a falha volta a ser codigo nu.
  assert.ok(statement < request, `teto de statement ${statement} precisa ser menor que ${request}`);

  // E o teto tem de viajar de fato para as duas pontas.
  assert.match(fixture, /set statement_timeout = '\$\{LEASE_COMPLETION_STATEMENT_TIMEOUT_MS\}ms'/);
  assert.match(fixture, /LEASE_COMPLETION_REQUEST_TIMEOUT_MS,/);
});

test("a identidade e validada contra padroes fechados antes de entrar em SQL", async () => {
  const fixture = await read(FIXTURE);
  const body = fixture.slice(
    fixture.indexOf("async function completeActorLease"),
    fixture.indexOf("async function createScopedRoleAssignments"),
  );

  const guard = body.indexOf("QA_CMS_FIXTURE_LEASE_IDENTITY_UNSAFE");
  const interpolation = body.indexOf("set statement_timeout = ");
  assert.ok(guard >= 0, "a guarda de identidade nao existe");
  assert.ok(guard < interpolation, "a identidade precisa ser validada ANTES de qualquer interpolacao");

  for (const pattern of [
    /uuidPattern\.test\(actorId\)/,
    /runTagPattern\.test\(runTag\)/,
    /\^\[0-9a-f\]\{40\}\$\/\.test\(expectedSha\)/,
    /\^\(staging\|production\)\$\/\.test\(target\.environment\)/,
  ])
    assert.match(body, pattern);
});

test("a falha de encerramento carrega SQLSTATE e identificador, nunca codigo nu", async () => {
  const fixture = await read(FIXTURE);

  // O identificador nu, sem sufixo, foi o que obrigou tres passes de diagnostico.
  assert.doesNotMatch(fixture, /throw new Error\("QA_CMS_FIXTURE_LEASE_COMPLETION_FAILED"\)/);
  assert.match(fixture, /QA_CMS_FIXTURE_LEASE_COMPLETION_FAILED:\$\{identity\}/);
  assert.match(fixture, /result\.error\.code \?\? "unknown"/);
  assert.match(fixture, /CMS_\[A-Z0-9_\]\{3,60\}/);

  // Resposta fora de forma tem causa propria, distinta de falha de transporte.
  assert.match(fixture, /QA_CMS_FIXTURE_LEASE_COMPLETION_INVALID/);
  assert.match(fixture, /QA_CMS_FIXTURE_LEASE_DURABLE_COMPLETION_EMPTY/);

  // E o resultado, venha de onde vier, continua passando pela mesma verificacao de forma.
  assert.match(fixture, /completed\?\.schemaVersion !== 1/);
  assert.match(fixture, /completed\?\.status !== "cleaned"/);
  assert.match(fixture, /await assertActorLease\(actorId, runTag, "cleaned"\)/);
});

test("managementQuery propaga status e SQLSTATE em vez de uma mensagem generica", async () => {
  const fixture = await read(FIXTURE);
  assert.doesNotMatch(fixture, /throw new Error\("QA_CMS_FIXTURE_MANAGEMENT_QUERY_FAILED"\)/);
  assert.match(fixture, /QA_CMS_FIXTURE_MANAGEMENT_QUERY_FAILED:\$\{response\.status\}:\$\{code\}/);
  assert.match(fixture, /async function managementQuery\(query, timeoutMs = 30_000\)/);
  assert.match(fixture, /AbortSignal\.timeout\(timeoutMs\)/);

  // O corpo da resposta nunca viaja na falha: so o identificador fechado de cinco caracteres.
  assert.match(fixture, /\/"code"\\s\*:\\s\*"\(\[0-9A-Z\]\{5\}\)"\//);
  assert.doesNotMatch(fixture, /QA_CMS_FIXTURE_MANAGEMENT_QUERY_FAILED[^\n]*\$\{detail\}/);
});

test("toda limpeza pesada de staging cai para o transporte duravel somente em 57014", async () => {
  for (const path of [PUBLIC_BRIDGE_FIXTURE, MIGRATION_CANARY]) {
    const source = await read(path);
    const start =
      path === PUBLIC_BRIDGE_FIXTURE ? "async function cleanupState" : "async function completeActorLease";
    const end = path === PUBLIC_BRIDGE_FIXTURE ? "async function setup" : "async function createActor";
    const body = source.slice(source.indexOf(start), source.indexOf(end));
    assert.ok(body.length > 0, `encerramento de lease ausente em ${path}`);
    assert.match(body, /context\.admin\.rpc\("cms_complete_qa_actor_lease"/);
    if (path === PUBLIC_BRIDGE_FIXTURE)
      assert.match(body, /completed\.error && leaseStatementTimedOut\(completed\.error\)/);
    else assert.match(body, /result\.error\?\.code === "57014"/);
    assert.match(body, /set statement_timeout = '\$\{LEASE_COMPLETION_STATEMENT_TIMEOUT_MS\}ms'/);
    assert.match(body, /select public\.cms_complete_qa_actor_lease\(/);
    assert.match(body, /LEASE_COMPLETION_REQUEST_TIMEOUT_MS,/);
    assert.equal((source.match(/set statement_timeout = /g) ?? []).length, 1, path);
  }
});

test("a ponte publica valida toda identidade antes de interpolar o fallback", async () => {
  const source = await read(PUBLIC_BRIDGE_FIXTURE);
  const body = source.slice(
    source.indexOf("async function cleanupState"),
    source.indexOf("async function setup"),
  );
  const guard = body.indexOf('refuse("ACTOR_LEASE_IDENTITY_UNSAFE")');
  const interpolation = body.indexOf("set statement_timeout = ");
  assert.ok(guard >= 0 && guard < interpolation);
  assert.match(body, /UUID\.test\(state\.actorId\)/);
  assert.match(body, /isPublicBridgeRunTagForCandidate\(state\.runTag, candidateSha\)/);
  assert.match(body, /FULL_SHA\.test\(candidateSha\)/);
  assert.match(body, /\^\(staging\|production\)\$\/\.test\(environment\)/);
});

test("nenhuma navegacao das suites contra o alias publicado usa networkidle", async () => {
  for (const path of PUBLISHED_ALIAS_SPECS) {
    const spec = await read(path);

    // `networkidle` nao assenta de forma confiavel contra um origin publicado com service worker
    // ativo: o SW assume o controle no activate, a pagina recarrega no controllerchange e a
    // revalidacao em segundo plano mantem requisicoes de pe. Aumentar o prazo so troca falha
    // rapida por lenta.
    assert.doesNotMatch(spec, /waitUntil:\s*"networkidle"/, path);
    assert.doesNotMatch(spec, /waitUntil:\s*'networkidle'/, path);

    const navigations = spec.match(/page\.goto\([^)]*waitUntil:\s*"([a-z]+)"/g) ?? [];
    for (const navigation of navigations) {
      assert.match(navigation, /waitUntil:\s*"(load|commit|domcontentloaded)"/, path);
    }
  }

  // A contagem continua amarrada ao spec que declara a travessia completa; products-catalog tem
  // tres navegacoes por desenho e exigir seis dele reprovaria a guarda em vez do defeito.
  const routes = await read(SPEC);
  const routeNavigations = routes.match(/page\.goto\([^)]*waitUntil:\s*"([a-z]+)"/g) ?? [];
  assert.ok(
    routeNavigations.length >= 6,
    `esperava ao menos 6 navegacoes explicitas, achei ${routeNavigations.length}`,
  );
});

test("o spec que intercepta cms-public bloqueia o service worker", async () => {
  // ATENCAO A QUEM FOR REVISAR ESTA TRAVA: o bloqueio NAO e necessario para a interceptacao
  // funcionar. Isso foi MEDIDO contra o alias publicado, com o service worker registrado, ativo em
  // escopo "/" e com `navigator.serviceWorker.controller` verdadeiro: o `page.route` interceptou
  // normalmente, 10 chamadas de cms-public em contexto novo e 5 em contexto ja aquecido, e o spec
  // passou nos dois projetos. A afirmacao anterior, de que interceptacao nao seria confiavel sob um
  // service worker controlador, e FALSA e foi retirada daqui de proposito -- justificativa errada
  // dentro de uma trava e armadilha: quem testasse veria que nao procede e removeria a trava inteira.
  //
  // O bloqueio fica por dois motivos que continuam valendo: remove o service worker como variavel de
  // um spec que intercepta rede, e e a convencao ja estabelecida no repositorio, usada por
  // cms-admin-ops-cycles, cms-secondary-ui-cycles, cms-auth-invite-recovery e pelo preflight de
  // producao. Uniformidade aqui vale mais que a economia de uma linha.
  const catalog = await read("tests/e2e/products-catalog.spec.ts");
  assert.match(catalog, /test\.use\(\{\s*serviceWorkers:\s*"block"\s*\}\);/);
});

test("cada navegacao trocada mantem assercao explicita sobre o conteudo que examina", async () => {
  const spec = await read(SPEC);

  // A troca so nao enfraquece o gate porque o que era espera de silencio virou afirmacao direta.
  const journeys = spec.slice(
    spec.indexOf("@a11y critical public journeys"),
    spec.indexOf("staging exposes the clean-room launch projection"),
  );
  assert.match(journeys, /waitUntil: "load"/);
  assert.match(journeys, /await expect\(page\.locator\("h1"\)\.first\(\)\)\.toBeVisible\(\);/);
  assert.ok(
    journeys.indexOf("toBeVisible") < journeys.indexOf("new AxeBuilder"),
    "a rota precisa estar provada renderizada antes do axe",
  );

  const skipLink = spec.slice(spec.indexOf("@a11y keyboard skip link"), spec.indexOf("admin is fail-closed"));
  assert.match(skipLink, /await expect\(skip\)\.toBeAttached\(\);/);

  const adminAuth = spec.slice(spec.indexOf("@a11y admin authentication"), spec.indexOf("@a11y mobile menu"));
  assert.match(adminAuth, /await expect\(email\)\.toBeVisible\(\);/);

  const mobileMenu = spec.slice(spec.indexOf("@a11y mobile menu"));
  assert.match(mobileMenu, /await expect\(menu\)\.toBeVisible\(\);/);
});
