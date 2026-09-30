import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

describe("toolchain dependency security", () => {
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
