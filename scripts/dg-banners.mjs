/**
 * Converte os banners da página Detecção de Gás para o formato do site.
 *
 * Coloque os 4 originais (PNG/JPG/WebP, 16:9) em scripts/banners-src/ com os nomes:
 *   dg-hero.*    (hero 1 — geral)
 *   dg-movel.*   (hero 2 — Detecção Móvel)
 *   dg-online.*  (hero 3 — Monitoramento Online)
 *   dg-cta.*     (faixa CTA final)
 *
 * Gera em public/images/pages/:
 *   <nome>.webp                      (base — usada pela CTA via backgroundImage)
 *   <nome>-480w/-1024w/-1920w.webp   (variantes — usadas pelo HeroCarousel)
 *   <nome>-480w/-1024w/-1920w.avif   (variantes AVIF — fonte preferida do <picture>)
 *
 * Uso: node scripts/dg-banners.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, "banners-src");
const OUT_DIR = path.resolve(__dirname, "..", "public/images/pages");

const NAMES = ["dg-hero", "dg-movel", "dg-online", "dg-cta"];
const WIDTHS = [480, 1024, 1920];
const EXTS = [".png", ".jpg", ".jpeg", ".webp"];

async function main() {
  let sharp;
  try { sharp = (await import("sharp")).default; }
  catch { console.error("✗ sharp indisponível. Rode: npm i -D sharp"); process.exit(1); }

  fs.mkdirSync(SRC_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let ok = 0;
  const fail = [];

  for (const name of NAMES) {
    const src = EXTS.map((e) => path.join(SRC_DIR, name + e)).find((p) => fs.existsSync(p));
    if (!src) { fail.push(`${name}: fonte não encontrada em scripts/banners-src/${name}.(png|jpg|webp)`); continue; }
    const input = fs.readFileSync(src);
    try {
      // base webp (1920) — usada pela faixa CTA (backgroundImage direto)
      await sharp(input).resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(OUT_DIR, `${name}.webp`));
      // variantes responsivas — usadas pelo HeroCarousel (<source> avif + webp)
      for (const w of WIDTHS) {
        await sharp(input).resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(OUT_DIR, `${name}-${w}w.webp`));
        await sharp(input).resize({ width: w, withoutEnlargement: true }).avif({ quality: 60 }).toFile(path.join(OUT_DIR, `${name}-${w}w.avif`));
      }
      ok++;
      console.log(`✓ ${name}  →  base + ${WIDTHS.length}× (webp+avif)`);
    } catch (e) {
      fail.push(`${name}: ${e.message}`);
    }
  }

  console.log(`\n✓ ${ok}/${NAMES.length} banners processados em public/images/pages/.`);
  if (fail.length) console.log("✗ " + fail.join("\n✗ "));
}

main();
