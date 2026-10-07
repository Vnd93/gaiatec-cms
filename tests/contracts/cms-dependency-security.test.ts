import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const loadDependency = createRequire(resolve("package.json"));
const { SourceMapConsumer } = loadDependency("source-map-js") as {
  SourceMapConsumer: new (sourceMap: object) => import("source-map-js").SourceMapConsumer;
};
const sourceMapFixture = { version: 3, sources: ["input.ts"], names: [], mappings: "AAAA" };
const patchedBraceDependencies = [
  ["node_modules/glob/node_modules/brace-expansion", "1.1.21"],
  ["node_modules/readdir-glob/node_modules/brace-expansion", "2.1.7"],
  ["node_modules/brace-expansion", "5.0.12"],
] as const;
type BraceExpand = (pattern: string, options?: { maxDepth?: number; maxRewrites?: number }) => string[];

describe("toolchain dependency security", () => {
  it("pins every Sharp consumer and prebuilt binary to the librsvg security fix", () => {
    // GHSA-wq5f-xc86-pv6w: Sharp 0.35.5 bundles patched librsvg 2.63.2.
    expect(manifest.optionalDependencies.sharp).toBe("0.35.5");
    expect(manifest.overrides.sharp).toBe("0.35.5");
    expect(lock.packages[""].optionalDependencies.sharp).toBe("0.35.5");
    const consumers = Object.keys(lock.packages).filter((path) => path.endsWith("/sharp"));
    expect(consumers).toEqual(["node_modules/sharp"]);
    const sharp = lock.packages[consumers[0]];
    expect(sharp.version).toBe("0.35.5");
    expect(sharp.resolved).toBe("https://registry.npmjs.org/sharp/-/sharp-0.35.5.tgz");
    expect(sharp.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);
    const binaries = Object.entries(lock.packages).filter(([path]) => path.includes("/@img/sharp-"));
    expect(binaries.length).toBeGreaterThan(0);
    for (const [path, entry] of binaries) {
      const dependency = entry as { version: string; resolved: string; integrity: string };
      const name = path.slice(path.lastIndexOf("/@img/") + 1);
      const version = name.startsWith("@img/sharp-libvips-") ? "1.3.4" : "0.35.5";
      expect(dependency.version).toBe(version);
      expect(dependency.resolved).toBe(
        `https://registry.npmjs.org/${name}/-/${name.slice(5)}-${version}.tgz`,
      );
      expect(dependency.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);
    }
    for (const [name, version] of Object.entries(sharp.optionalDependencies)) {
      expect(version).toBe(name.startsWith("@img/sharp-libvips-") ? "1.3.4" : "0.35.5");
      expect(lock.packages[`node_modules/${name}`].version).toBe(version);
    }
  });

  it("preserves real SVG decoding and PNG, WebP and AVIF conversion with patched librsvg", async () => {
    const sharp = loadDependency("sharp") as typeof import("sharp").default;
    expect(sharp.versions.sharp).toBe("0.35.5");
    expect(sharp.versions.rsvg).toBe("2.63.2");
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24"><rect width="32" height="24" fill="#327496"/></svg>',
    );
    const png = await sharp(svg).png().toBuffer();
    expect(await sharp(png).metadata()).toMatchObject({ format: "png", width: 32, height: 24 });
    const webp = await sharp(png).resize(16, 12).webp().toBuffer();
    expect(await sharp(webp).metadata()).toMatchObject({ format: "webp", width: 16, height: 12 });
    const avif = await sharp(png).resize(16, 12).avif().toBuffer();
    expect(await sharp(avif).metadata()).toMatchObject({
      format: "heif",
      compression: "av1",
      width: 16,
      height: 12,
    });
  });

  it("locks every source-map-js consumer to the indexed-map denial-of-service fix", () => {
    // GHSA-68fv-2mgg-jv7q / CVE-2026-93749. The existing consumer ranges accept 1.2.2.
    const sourceMaps = Object.keys(lock.packages).filter((path) => path.endsWith("/source-map-js"));
    expect(sourceMaps).toEqual(["node_modules/source-map-js"]);
    const dependency = lock.packages[sourceMaps[0]];
    expect(dependency.version).toBe("1.2.2");
    expect(dependency.resolved).toBe("https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.2.tgz");
    expect(dependency.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);
  });

  it("preserves valid indexed source-map positions", () => {
    const consumer = new SourceMapConsumer({
      version: 3,
      sections: [{ offset: { line: 2, column: 0 }, map: sourceMapFixture }],
    });
    expect(consumer.sources).toEqual(["input.ts"]);
    expect(consumer.originalPositionFor({ line: 3, column: 1 })).toEqual({
      source: "input.ts",
      line: 1,
      column: 0,
      name: null,
    });
  });

  it("rejects malicious section offsets before allocating or serializing their line gaps", () => {
    for (const offset of [
      { line: 100_000_000, column: 0 },
      { line: -1, column: 0 },
      { line: 0.5, column: 0 },
      { line: Number.POSITIVE_INFINITY, column: 0 },
      { line: 0, column: -1 },
      { line: 0, column: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      expect(
        () => new SourceMapConsumer({ version: 3, sections: [{ offset, map: sourceMapFixture }] }),
      ).toThrow(/Section offset/);
    }
  });

  it("enforces the source-map offset bound across nested sections", () => {
    expect(
      () =>
        new SourceMapConsumer({
          version: 3,
          sections: [
            {
              offset: { line: 6_000_000, column: 0 },
              map: {
                version: 3,
                sections: [{ offset: { line: 6_000_000, column: 0 }, map: sourceMapFixture }],
              },
            },
          ],
        }),
    ).toThrow(/including offsets of nested sections/);
  });

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
