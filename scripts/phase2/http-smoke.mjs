const target = (process.env.SMOKE_BASE_URL ?? process.argv[2] ?? "").replace(/\/$/, "");
if (!target) throw new Error("Set SMOKE_BASE_URL or pass a base URL.");

const cases = [
  { path: "/", status: 200 },
  { path: "/produtos", status: 200 },
  { path: "/contato", status: 200 },
  { path: "/relatorio-de-obra/login", status: 200, private: true },
  { path: "/fase-2-rota-inexistente", status: 404 },
  { path: "/assets/fase-2-inexistente.js", status: 404 },
];

for (const check of cases) {
  const response = await fetch(`${target}${check.path}`, { redirect: "manual" });
  if (response.status !== check.status) {
    throw new Error(`${check.path}: expected ${check.status}, received ${response.status}`);
  }
  const robots = response.headers.get("x-robots-tag") ?? "";
  if (target.includes("pages.dev") && !robots.includes("noindex")) {
    throw new Error(`${check.path}: staging response is indexable`);
  }
  if (check.private && !response.headers.get("cache-control")?.includes("no-store")) {
    throw new Error(`${check.path}: private response is cacheable`);
  }
  console.log(
    JSON.stringify({
      event: "smoke.http",
      path: check.path,
      status: response.status,
      noindex: robots.includes("noindex"),
    }),
  );
}
