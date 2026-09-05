import assert from "node:assert/strict";
import { readFile, rm, stat } from "node:fs/promises";

const manifest = JSON.parse(await readFile("dist/.vite/manifest.json", "utf8"));
const entries = Object.entries(manifest).filter(([, value]) => value.isEntry);
assert.ok(entries.length, "Vite manifest must contain an entry chunk");

const staticKeys = new Set();
const visit = (key) => {
  if (staticKeys.has(key)) return;
  staticKeys.add(key);
  for (const dependency of manifest[key]?.imports ?? []) visit(dependency);
};
entries.forEach(([key]) => visit(key));

const files = [...staticKeys].map((key) => manifest[key]?.file).filter(Boolean);
assert.ok(
  !files.some((file) => /exceljs|pdf/i.test(file)),
  "Excel/PDF must remain outside every initial entry graph",
);
const sizes = await Promise.all(
  files
    .filter((file) => file.endsWith(".js"))
    .map(async (file) => ({ file, bytes: (await stat(`dist/${file}`)).size })),
);
const oversized = sizes.filter((entry) => entry.bytes > 600 * 1024);
assert.deepEqual(
  oversized,
  [],
  `Initial JS chunk exceeds 600 KiB: ${oversized.map((entry) => `${entry.file}=${entry.bytes}`).join(", ")}`,
);
const total = sizes.reduce((sum, entry) => sum + entry.bytes, 0);
assert.ok(total <= 1_500 * 1024, `Initial static JS graph exceeds 1.5 MiB (${total} bytes)`);
await rm("dist/.vite", { recursive: true, force: true });
console.log(`EV2.6 bundle budget: ${sizes.length} initial chunks, ${total} bytes, Excel/PDF lazy.`);
