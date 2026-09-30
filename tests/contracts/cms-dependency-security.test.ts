import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

describe("toolchain dependency security", () => {
  it("pins both Undici security patches without crossing the consumers' major versions", () => {
    // GHSA-w293-vg96-wgc3 / GHSA-rfgv-xxqx-mfg5 and related 2026-09 advisories.
    // Keep the existing jsdom and Miniflare APIs while repairing their transitive clients.
    expect(manifest.overrides.jsdom.undici).toBe("8.10.2");
    expect(manifest.overrides.miniflare.undici).toBe("7.29.1");
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
