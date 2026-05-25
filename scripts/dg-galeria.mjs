/**
 * Baixa a galeria de imagens (até 3 por produto) da linha Detecção de Gás do
 * Drive da Gaiatec, converte para WebP em public/images/deteccao-gas/ como
 * <slug>.webp (principal), <slug>-2.webp, <slug>-3.webp, e gera
 * src/app/data/dgGaleria.ts (mapa slug → [caminhos]) para a galeria do modal.
 *
 * Uso: node scripts/dg-galeria.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "public/images/deteccao-gas");
const MAP_FILE = path.resolve(__dirname, "..", "src/app/data/dgGaleria.ts");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/* slug → [fileId principal, ...extras] (ordem = ordem na galeria). */
const GALERIA = {
  "s-series": ["1n_lPXcnCHvOPrO4PvhDyvsVDI-LSoKdd", "1pXKJWBV4NhcbdScQu4KwStw2oD5VjZs7", "11nLIZQwKE0xz5pah6RgdInnfYGyLTR49"],
  "s800": ["1B9H-PEoI0faIOqVx8g_DGb5F7Tdl96L0", "1ffD9MV0xM6PR2giNDh1YgEn63PluSaTz", "1PnnOSYDVe3ycQ7NUzqbg1UvVx3EdoWPH"],
  "s800-bomba": ["1w8vThqusp9P5ykA_ooOLoS4G5oS_7QSG"],
  "s600": ["1q4cpTvGfU8UXaSV3OXW0_IZ5x0zXE6u-"],
  "s700": ["1ug6mzZCDJjHzUuiHHzMqImXfhdxreLFU"],
  "ks100": ["10Z2_aBz0L8ABkBcMX8TYJhW-vUmQtWoa"],
  "veiculo-autonomo": ["1T1JeWeC7dJpKmCmclzvDVBFxBiWUyjYo", "1NTDx1sZa4ifTpUZ4I-za8nuA0IUBsNPV", "1vzih6-__5JNVmHbWZAhQQZUk0d75fF7D"],
  "m10": ["1FocOpC-peOUIZCX2VrnbAx_IlnStkaZk", "1-8N5IxgayXZBfTM41b5a3Ct3OoYvT5mN"],
  "c200mini": ["1uNhlUGAwjbmcykiTL0MVORWjAnBqxeEr", "1xe8vnTBR2ZTJG3E8g3ryWxo7Ro0d8fR2", "18piaSZEhlSXoGT8FnFI61TpSGRDj4URb"],
  "uf100": ["1U7x3r5El0pkpAt5PusKIcgJTrjWGYWuW", "1R5Y0kZs5UYCI3Dlwzti8wQAFI9LYIjT_", "1y9fLsyq9uOGUMU9bDqf3Hw1FmAXId8HW"],
  "ws100mini": ["1LI1Yq7XK_Omikn4ZTaY_Jh4ei38BoeqE", "1fTvJiVJXriM7nhdgIOtCFn3Fk9bQtx3I", "1uwZsUSekhCbhqAXZMbZ5sOEbj1fmNKRH"],
  "h10": ["18OTYEzwKbrCtJyxgw0bE8UCOgSNefPzp", "10r2ICyT1pjkHx2AXS8eIo4OFRS86pFDB"],
  "ws100": ["1tT1hxnLPL8fTzoDF1yOSKfdX9RBFfmWT"],
  "sz100": ["1T_MY9msMNwNdbJSkdoc88xBELtYAWpQh", "1Nz5F6CZ23GLSqTIY_xNP0lDCEYoLxVgL"],
  "poste-ia": ["1-XI6jtdq_KPGyMPKHPRwUChiE-8Vmm1F", "1FxHJ8IFEoQze3tdO4WRKbjSn35vnViRc", "1Xd_ChJFMvntkngCsKtxGhsk4lbyD7DSY"],
  "gq-tx100": ["1ZCaXiRIC5Ye5zkXbOTd4n5i6dmURDaq4", "1AtDh7nShx4_UpdXmyztyzCPr3iE0OCEr"],
  "gtq-wx200": ["1nCrAGm-RS83G0dQ-21vpAIuEH6K7RIKi", "12JdmUb5Hr0AKLZ7HTs6REQECQ_IWFwff", "1kL0Y0xOAP8z0QnnsL8KX2QgauF5L6reU"],
  "gtq-wx200mini": ["12gjDqaQ8UNyJj3ZMsUnREhsSwY3xqH1a"],
  "gq-pm100": ["1R0IQPeg_htNI1HJsFORwtMFZyJYjgHD6", "1dOetlidbAs8QqaoOsHcWqzyZ-FgGfINV"],
  "gq-pm200": ["1BaFVHSp4SrGimhWJXsW5zx0BBGSzy0sE"],
  "bomba-poco-de-valvula": ["15lXFdVMZcjfJodsYO22K1l9fg3BT54-3"],
  "dt-kny-wx300": ["1F8jN8Txi89V2Rnl6q9JN0iriaHxuCQ8X", "1nISBf1FAywpnlT3VhqCd8mWmY1XPa0V9"],
  "dm10": ["1wXc1LJkO_ANlZHXYjgqCW9xPKwZA7OCS"],
  "c10": ["1uofBhfYDF7Tp7bNaBlU8gvpa29tdKNXd", "1GaeuTBfy7iR2dZq_WckGTX_SDi2NCmfj"],
  "vibracao-acustico": ["1EWp6KQqfIrclWj5gLp4O-8-0XRVK6_bu", "1MU9HHB0rpzvDt84WIvcF18A4NvWbk8dA"],
  "poste-de-solo": ["1JtLx4bpLibtWfkCO9r-tS9ztBW7XFHKg", "1km5pu5gC4ahskKWjqGc_Bq_Fc8iKPntC"],
  "enterrado": ["1Re1pEt390snbEVBKX4YDLtCi9C2R7cqh", "1jJCklBnHexPwpZCVR9dAruoNCVcYUHNB"],
  "pressao-sem-fio": ["1FJUFmK52Rvk_GsOnQyDJCCBMalqCv-bw", "1QT6UZNSv1uW4n3LeIettuqHkoRrK6UXE", "1Ti1os7tN49syzRnsqSwKtlgIeywwwgDp"],
  "poco-de-valvula": ["1O0Cw0T4ZmkzQGVLbZ9B1Qa3TmYz0EqcJ", "1tVClMy-CDgLRNuFDBvOD1f4KbGmFNhgj", "1BkrT0gBj8qyzKEDZh5QrG9lz7H9MHRdn"],
  "a200": ["1Ut_OsG31eISp20tvzrMEvB9ujPXJ_8A3", "1pLzNuyBAjzDPH13u0WtzFCP0_qidrZrM", "1kJSsSVsi3jAUBn2_RFTRog9QioyHfRFR"],
  "st100": ["1qGmLbGb8WHuaI5z558vag7Ct2oghsj2y", "1wnJSxIZfBDl1uO8H0XZqAjuzx6SOVBD1", "1pudZyxCF8r4baAQFSaLcszK87lWANlzS"],
  "dg100": ["1S0CCDP2yEj5PzBlOYdysj7qaAWW1XudX", "1J9lTJmeFEVAXZXHIWQdueu1amDSVVs6O", "1xNrelLNnfr4bCXJo8AZelDE7pSMsZy4L"],
  "dg100-tht": ["1sFyYl5RmD92jHB2qWzoYX8-01YM_p3Dk", "1ALYE6fKHP9OJecTQUFQdlg1x229WeK-D", "1e8i5-DqBIOLlkPXx-nIy6BCqGwwFz-32"],
  "dx300": ["127KsVy3_rilNKRGzmJL_aiMpzU2bi0be", "1pLFS0rF9r6ODuAUH_kn1b9mzL5A_6OaI", "1xkzCreW-O2iTNcjRVcZc6qmiTwcuoC0K"],
  "dx200": ["1vq5lKg-vflWvc3JRpy652k6fstI4unTI", "1DfQDItBUzhBy0pI-JRd2_hxHdyTq1QFt", "1x9iwMMUxAVPVx50r5e-dEqMX1IwzU6XD"],
  "cl01": ["1qaOZLgvKyp05ldFYPKSKwIKKF9gA1Yvk", "1rxevTuDa2ovojfR5Q4utBzHjpcQk-Kw0", "17oBvHXQti6RqlJWtUqFRZkajecTE3oQ4"],
  "dx100": ["1eHDmaxwIVt0d7Wsyf9llfiBXqQgG1FWc", "1fAIYKtAzrXpvy7TEXXwnq5ZAOgBMfurM", "1MSQuX25GEPXypv6JHFNmw9ZHJsvon_t9"],
  "cp": ["1EccykyiLD7A414Y9k3kNXPP7UbHpgFNk", "142M8qAHZ3moIbOnEphnDVhQzBOMCJRxC", "150HYza_taO-CcDsilzlXzb58fI-rVKAP"],
  "dx200-2": ["1FUnu2xs8twDPnYYcIRqBNR2ME7JZ0qeb", "1pDNMTxqqchwPyulovSmRfgQG_tgvyevs"],
  "f40": ["11aHAd4T14iquKfa9YxskZwWh9NHXPqMx", "1RM8tr17TLk6ZU-ybbPBMfC6k8COYsiCA", "1pIXWdYqARli88ZTfAliPWdB8OOPFaxv0"],
  "estacao-portatil": ["1RS1YA3xEFezT_ldATmVCoJurpEQaDcJ8"],
  "estacao-movel": ["1lf9-BibnbZJ_B9nKRDakhxS8PUHpmRS-"],
};

async function main() {
  let sharp;
  try { sharp = (await import("sharp")).default; }
  catch { console.error("✗ sharp indisponível."); process.exit(1); }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const galeria = {};
  let okImgs = 0;
  const fail = [];

  for (const [slug, ids] of Object.entries(GALERIA)) {
    const paths = [];
    for (let i = 0; i < ids.length; i++) {
      const name = i === 0 ? `${slug}.webp` : `${slug}-${i + 1}.webp`;
      try {
        const res = await fetch(`https://drive.google.com/uc?export=download&id=${ids[i]}`, { headers: { "User-Agent": UA } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const head = buf.subarray(0, 4).toString("hex");
        if (head !== "89504e47" && !head.startsWith("ffd8")) throw new Error("não-imagem");
        await sharp(buf).resize({ width: 1400, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(OUT_DIR, name));
        paths.push(`/images/deteccao-gas/${name}`);
        okImgs++;
      } catch (e) {
        fail.push(`${name}: ${e.message}`);
      }
    }
    if (paths.length) galeria[slug] = paths;
  }

  const ts = `/** Gerado por scripts/dg-galeria.mjs — galeria de imagens por produto (WebP). NÃO editar à mão. */\nexport const DG_GALERIA: Record<string, string[]> = ${JSON.stringify(galeria, null, 2)};\n`;
  fs.writeFileSync(MAP_FILE, ts);

  const multi = Object.values(galeria).filter((a) => a.length > 1).length;
  console.log(`✓ ${okImgs} imagens em ${Object.keys(galeria).length} produtos (${multi} com galeria de 2+).`);
  if (fail.length) console.log("✗ falhas:", fail.join(" | "));
}

main();
