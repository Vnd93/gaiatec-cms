/**
 * Substitui as imagens dos produtos de Detecção de Gás pelas versões oficiais
 * da Gaiatec (renders com a marca, sem logo de fabricante) hospedadas no Drive.
 * Baixa por URL pública (uc?export), converte para WebP e sobrescreve
 * public/images/deteccao-gas/<slug>.webp (mesmos slugs → site usa automaticamente).
 *
 * Uso: node scripts/dg-images-drive.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "public/images/deteccao-gas");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/* slug (existente no site) → fileId da imagem principal no Drive (render Gaiatec). */
const MAP = {
  // Detecção Móvel
  "s-series": "1n_lPXcnCHvOPrO4PvhDyvsVDI-LSoKdd",
  "s800": "1B9H-PEoI0faIOqVx8g_DGb5F7Tdl96L0",
  "s800-bomba": "1w8vThqusp9P5ykA_ooOLoS4G5oS_7QSG",
  "s600": "1q4cpTvGfU8UXaSV3OXW0_IZ5x0zXE6u-",
  "s700": "1ug6mzZCDJjHzUuiHHzMqImXfhdxreLFU",
  "ks100": "10Z2_aBz0L8ABkBcMX8TYJhW-vUmQtWoa",
  "veiculo-autonomo": "1T1JeWeC7dJpKmCmclzvDVBFxBiWUyjYo",
  "m10": "1FocOpC-peOUIZCX2VrnbAx_IlnStkaZk",
  "c200mini": "1uNhlUGAwjbmcykiTL0MVORWjAnBqxeEr",
  "uf100": "1U7x3r5El0pkpAt5PusKIcgJTrjWGYWuW",
  "ws100mini": "1LI1Yq7XK_Omikn4ZTaY_Jh4ei38BoeqE",
  "h10": "18OTYEzwKbrCtJyxgw0bE8UCOgSNefPzp",
  "ws100": "1tT1hxnLPL8fTzoDF1yOSKfdX9RBFfmWT",
  // Monitoramento Online
  "sz100": "1T_MY9msMNwNdbJSkdoc88xBELtYAWpQh",
  "poste-ia": "1-XI6jtdq_KPGyMPKHPRwUChiE-8Vmm1F",
  "gq-tx100": "1ZCaXiRIC5Ye5zkXbOTd4n5i6dmURDaq4",
  "gtq-wx200": "1nCrAGm-RS83G0dQ-21vpAIuEH6K7RIKi",
  "gtq-wx200mini": "12gjDqaQ8UNyJj3ZMsUnREhsSwY3xqH1a",
  "gq-pm100": "1R0IQPeg_htNI1HJsFORwtMFZyJYjgHD6",
  "gq-pm200": "1BaFVHSp4SrGimhWJXsW5zx0BBGSzy0sE",
  "bomba-poco-de-valvula": "15lXFdVMZcjfJodsYO22K1l9fg3BT54-3",
  "dt-kny-wx300": "1F8jN8Txi89V2Rnl6q9JN0iriaHxuCQ8X",
  "dm10": "1wXc1LJkO_ANlZHXYjgqCW9xPKwZA7OCS",
  "c10": "1uofBhfYDF7Tp7bNaBlU8gvpa29tdKNXd",
  "vibracao-acustico": "1EWp6KQqfIrclWj5gLp4O-8-0XRVK6_bu",
  "poste-de-solo": "1JtLx4bpLibtWfkCO9r-tS9ztBW7XFHKg",
  "enterrado": "1Re1pEt390snbEVBKX4YDLtCi9C2R7cqh",
  "pressao-sem-fio": "1FJUFmK52Rvk_GsOnQyDJCCBMalqCv-bw",
  "poco-de-valvula": "1O0Cw0T4ZmkzQGVLbZ9B1Qa3TmYz0EqcJ",
  // Localizador de Tubulações PE
  "a200": "1Ut_OsG31eISp20tvzrMEvB9ujPXJ_8A3",
  // Detector de Rede Subterrânea
  "st100": "1qGmLbGb8WHuaI5z558vag7Ct2oghsj2y",
  // Detectores Portáteis
  "dg100": "1S0CCDP2yEj5PzBlOYdysj7qaAWW1XudX",
  "dg100-tht": "1sFyYl5RmD92jHB2qWzoYX8-01YM_p3Dk",
  "dx300": "127KsVy3_rilNKRGzmJL_aiMpzU2bi0be",
  "dx200": "1vq5lKg-vflWvc3JRpy652k6fstI4unTI",
  "cl01": "1qaOZLgvKyp05ldFYPKSKwIKKF9gA1Yvk",
  "dx100": "1eHDmaxwIVt0d7Wsyf9llfiBXqQgG1FWc",
  "cp": "1EccykyiLD7A414Y9k3kNXPP7UbHpgFNk",
  "dx200-2": "1FUnu2xs8twDPnYYcIRqBNR2ME7JZ0qeb",
  "f40": "11aHAd4T14iquKfa9YxskZwWh9NHXPqMx",
  // Monitoramento Meteorológico
  "estacao-portatil": "1RS1YA3xEFezT_ldATmVCoJurpEQaDcJ8",
  "estacao-movel": "1lf9-BibnbZJ_B9nKRDakhxS8PUHpmRS-",
};

async function main() {
  let sharp;
  try { sharp = (await import("sharp")).default; }
  catch { console.error("✗ sharp indisponível."); process.exit(1); }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const entries = Object.entries(MAP);
  let ok = 0;
  const fail = [];

  for (const [slug, id] of entries) {
    try {
      const res = await fetch(`https://drive.google.com/uc?export=download&id=${id}`, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const head = buf.subarray(0, 4).toString("hex");
      const isImg = head === "89504e47" /* png */ || head.startsWith("ffd8") /* jpg */;
      if (!isImg) throw new Error("não-imagem (login/confirm?)");
      await sharp(buf).resize({ width: 1400, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(OUT_DIR, `${slug}.webp`));
      ok++;
    } catch (e) {
      fail.push(`${slug}: ${e.message}`);
    }
  }

  console.log(`✓ ${ok}/${entries.length} imagens Gaiatec aplicadas (WebP).`);
  if (fail.length) console.log("✗ falhas:", fail.join(" | "));
}

main();
