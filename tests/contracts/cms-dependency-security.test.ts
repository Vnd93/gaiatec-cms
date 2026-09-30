import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const loadDependency = createRequire(resolve("package.json"));
const patchedBraceDependencies = [
  ["node_modules/glob/node_modules/brace-expansion", "1.1.21"],
  ["node_modules/readdir-glob/node_modules/brace-expansion", "2.1.7"],
  ["node_modules/brace-expansion", "5.0.12"],
] as const;
type BraceExpand = (pattern: string, options?: { maxDepth?: number; maxRewrites?: number }) => string[];

describe("toolchain dependency security", () => {
  it("pins every brace-expansion consumer to its compatible security patch", () => {
    // GHSA-6j4f-fj2g-mc7p / GHSA-qhr7-859c-m2p7 / GHSA-q2hr-2g5m-vwhr.
    const expansions = Object.keys(lock.packages).filter((path) => path.endsWith("/brace-expansion"));
    expect(expansions.sort()).toEqual(patchedBraceDependencies.map(([path]) => path).sort());
    for (const [path, version] of patchedBraceDependencies) {
      expect(manifest.overrides[`brace-expansion@${version.split(".")[0]}`]).toBe(version);
      expect(lock.packages[path].version).toBe(version);
      expect(lock.packages[path].resolved).toBe(
        `https://registry.npmjs.org/brace-expansion/-/brace-expansion-${version}.tgz`,
      );
      expect(lock.packages[path].integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);
    }
  });

  it.each(patchedBraceDependencies)("preserves matching and bounds expansion in %s", (path) => {
    const loaded = loadDependency(resolve(path)) as BraceExpand | { expand: BraceExpand };
    const expand = typeof loaded === "function" ? loaded : loaded.expand;
    expect(expand("asset-{a,b}-{1..2}.svg")).toEqual([
      "asset-a-1.svg",
      "asset-a-2.svg",
      "asset-b-1.svg",
      "asset-b-2.svg",
    ]);
    expect(expand("{{a,b}}", { maxDepth: 0 })).toEqual(["{{a,b}}"]);
    expect(expand("{a},b}", { maxRewrites: 0 })).toEqual(["{a},b}"]);
    expect(() => expand("{".repeat(4_000) + "a,b" + "}".repeat(4_000))).not.toThrow();
  });

  it("pins both Undici security patches without crossing the consumers' major versions", () => {
    // GHSA-w293-vg96-wgc3 / GHSA-rfgv-xxqx-mfg5 and related 2026-09 advisories.
    // Scope by the client's major: npm 10 does not preserve the nested override
    // through Miniflare's prerelease parent during a clean install.
    expect(manifest.overrides["undici@8"]).toBe("8.10.2");
    expect(manifest.overrides["undici@7"]).toBe("7.29.1");
    expect(manifest.overrides.miniflare?.undici).toBeUndefined();
    expect(readFileSync(".nvmrc", "utf8").trim()).toBe("22");
    const clients = Object.entries(lock.packages).filter(([path]) => path.endsWith("/undici"));
    expect(clients).toHaveLength(2);
    for (const [, entry] of clients) {
      const dependency = entry as { version: string; resolved: string; integrity: string };
      expect(["7.29.1", "8.10.2"]).toContain(dependency.version);
      expect(dependency.resolved).toBe(
        `https://registry.npmjs.org/undici/-/undici-${dependency.version}.tgz`,
      );
      expect(dependency.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);
    }
    expect(lock.packages["node_modules/undici"].version).toBe("7.29.1");
    expect(lock.packages["node_modules/jsdom/node_modules/undici"].version).toBe("8.10.2");
  });
});
