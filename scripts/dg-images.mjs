/**
 * Baixa as fotos reais dos produtos de Detecção de Gás (campo `imagemUrlOrigem`
 * do catálogo) e converte para WebP em public/images/deteccao-gas/<slug>.webp,
 * gerando src/app/data/dgImagens.ts (mapa slug → caminho local).
 *
 * Uso: node scripts/dg-images.mjs   (re-executável)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public/images/deteccao-gas");
const MAP_FILE = path.join(ROOT, "src/app/data/dgImagens.ts");
const DRAFT = path.join(ROOT, "src/app/data/deteccao-gas-catalog.draft.json");

const BASE = "https://www.ruyangkeji.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/* slug idêntico ao de deteccaoGas.ts */
function slugify(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function uniqueSlug(modelo, nome, used) {
  const base = slugify(modelo) || "item";
  if (!used.has(base)) { used.add(base); return base; }
  const disc = (nome.toLowerCase().match(/\b(ppb|ppm|mini|micro|pan-?tilt|bomba|solo|enterrad\w*)\b/) || [])[0];
  let cand = disc ? `${base}-${slugify(disc)}` : `${base}-2`;
  let n = 2;
  while (used.has(cand)) cand = `${base}-${n++}`;
  used.add(cand);
  return cand;
}

async function main() {
  let sharp;
  try { sharp = (await import("sharp")).default; }
  catch { console.error("✗ sharp indisponível. Rode `npm i sharp`."); process.exit(1); }

  const draft = JSON.parse(fs.readFileSync(DRAFT, "utf8"));
  const products = draft.categorias.flatMap((cat) => {
    const used = new Set();
    return cat.produtos.map((p) => {
      const raw = p.imagemUrlOrigem || "";
      const img = raw ? (raw.startsWith("http") ? raw : BASE + raw) : null;
      return { slug: uniqueSlug(p.modelo, p.nome, used), modelo: p.modelo, img };
    });
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const mapping = {};
  const fail = [];
  let ok = 0;

  for (const p of products) {
    if (!p.img) { fail.push(`${p.slug}(sem URL)`); continue; }
    try {
      const res = await fetch(p.img, { headers: { "User-Agent": UA, Referer: BASE } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await sharp(buf).resize({ width: 1100, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(OUT_DIR, `${p.slug}.webp`));
      mapping[p.slug] = `/images/deteccao-gas/${p.slug}.webp`;
      ok++;
    } catch (e) {
      fail.push(`${p.slug}: ${e.message}`);
    }
  }

  const ts = `/** Gerado por scripts/dg-images.mjs — fotos reais dos produtos (WebP). NÃO editar à mão. */\nexport const DG_IMAGENS: Record<string, string> = ${JSON.stringify(mapping, null, 2)};\n`;
  fs.writeFileSync(MAP_FILE, ts);

  console.log(`✓ ${ok}/${products.length} imagens convertidas para WebP.`);
  if (fail.length) console.log("✗ falhas:", fail.join(" | "));
}

main();
