// Reencoder de captura para o PNG canonico que a atestacao de navegador real exige.
//
// POR QUE ISSO EXISTE. `validateRealBrowserScreenshotPng` aceita somente os chunks IHDR, PLTE, IDAT
// e IEND. Ferramenta de captura do Windows, extensao de navegador e editor de imagem injetam pHYs,
// sRGB, gAMA, tEXt, iTXt, tIME ou tRNS sem perguntar, e o resultado reprova com
// `screenshot_chunk_not_canonical`. A janela do desafio e de 15 minutos, unica e nao renovavel:
// descobrir isso na hora custa a janela inteira.
//
// O QUE ELE NAO FAZ. Nao inventa pixel, nao recorta e nao muda o que a captura mostra. Reescreve o
// mesmo conteudo na forma que o validador aceita; quando o orcamento de bytes nao fecha, reduz a
// resolucao por fator inteiro, dizendo exatamente qual fator usou.
//
// GARANTIA. A saida so e escrita depois de passar pelo proprio validador da atestacao, importado
// daqui e nao reimplementado. Se ele recusar, o arquivo nao e gravado e os codigos de violacao sao
// impressos.

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

import {
  MAX_REAL_BROWSER_SCREENSHOT_BYTES,
  MAX_REAL_BROWSER_VARIABLE_BYTES,
  validateRealBrowserScreenshotPng,
} from "./real-browser-attestation-store-lib.mjs";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const dLeft = Math.abs(estimate - left);
  const dUp = Math.abs(estimate - up);
  const dUpLeft = Math.abs(estimate - upLeft);
  if (dLeft <= dUp && dLeft <= dUpLeft) return left;
  return dUp <= dUpLeft ? up : upLeft;
}

function unfilter(raw, height, rowBytes, pixelBytes) {
  const output = Buffer.alloc(rowBytes * height);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (rowBytes + 1)];
    const source = raw.subarray(row * (rowBytes + 1) + 1, (row + 1) * (rowBytes + 1));
    const target = output.subarray(row * rowBytes, (row + 1) * rowBytes);
    const previous = row > 0 ? output.subarray((row - 1) * rowBytes, row * rowBytes) : null;
    for (let index = 0; index < rowBytes; index += 1) {
      const left = index >= pixelBytes ? target[index - pixelBytes] : 0;
      const up = previous ? previous[index] : 0;
      const upLeft = previous && index >= pixelBytes ? previous[index - pixelBytes] : 0;
      const value = source[index];
      if (filter === 0) target[index] = value;
      else if (filter === 1) target[index] = (value + left) & 0xff;
      else if (filter === 2) target[index] = (value + up) & 0xff;
      else if (filter === 3) target[index] = (value + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) target[index] = (value + paeth(left, up, upLeft)) & 0xff;
      else throw new Error("SCREENSHOT_SOURCE_FILTER_INVALID");
    }
  }
  return output;
}

function readBits(row, index, bitDepth) {
  const perByte = 8 / bitDepth;
  const byte = row[Math.floor(index / perByte)];
  const shift = 8 - bitDepth * ((index % perByte) + 1);
  return (byte >> shift) & ((1 << bitDepth) - 1);
}

/** Le um PNG arbitrario e devolve os pixels em RGBA de 8 bits, ignorando chunks acessorios. */
export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.subarray(0, 8).equals(PNG_SIGNATURE))
    throw new Error("SCREENSHOT_SOURCE_NOT_PNG");

  let offset = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (offset + 12 + length > buffer.length) throw new Error("SCREENSHOT_SOURCE_TRUNCATED");
    if (type === "IHDR")
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") transparency = Buffer.from(data);
    else if (type === "IDAT") idat.push(Buffer.from(data));
    offset += 12 + length;
  }
  if (!header || !idat.length) throw new Error("SCREENSHOT_SOURCE_INCOMPLETE");
  // Entrelacamento Adam7 exigiria um segundo decodificador inteiro e nenhuma ferramenta de captura o
  // produz. Recusar e mais honesto do que decodificar errado em silencio.
  if (header.interlace !== 0) throw new Error("SCREENSHOT_SOURCE_INTERLACED");
  if (!(header.colorType in CHANNELS)) throw new Error("SCREENSHOT_SOURCE_COLOR_TYPE_INVALID");
  if (![1, 2, 4, 8, 16].includes(header.bitDepth)) throw new Error("SCREENSHOT_SOURCE_BIT_DEPTH_INVALID");

  const { width, height, bitDepth, colorType } = header;
  const channels = CHANNELS[colorType];
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  const pixelBytes = Math.max(1, Math.ceil((channels * bitDepth) / 8));
  const rows = unfilter(inflateSync(Buffer.concat(idat)), height, rowBytes, pixelBytes);

  const pixels = Buffer.alloc(width * height * 4);
  const sample = (row, index) => {
    if (bitDepth === 16) return rows[row * rowBytes + index * 2];
    if (bitDepth === 8) return rows[row * rowBytes + index];
    return readBits(rows.subarray(row * rowBytes, (row + 1) * rowBytes), index, bitDepth);
  };
  const scale = bitDepth < 8 && colorType !== 3 ? 255 / ((1 << bitDepth) - 1) : 1;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const target = (row * width + column) * 4;
      const base = column * channels;
      if (colorType === 3) {
        const index = sample(row, base);
        if (!palette || index * 3 + 2 >= palette.length) throw new Error("SCREENSHOT_SOURCE_PALETTE_INVALID");
        pixels[target] = palette[index * 3];
        pixels[target + 1] = palette[index * 3 + 1];
        pixels[target + 2] = palette[index * 3 + 2];
        pixels[target + 3] = transparency && index < transparency.length ? transparency[index] : 255;
      } else if (colorType === 0 || colorType === 4) {
        const grey = Math.round(sample(row, base) * scale);
        pixels[target] = grey;
        pixels[target + 1] = grey;
        pixels[target + 2] = grey;
        pixels[target + 3] = colorType === 4 ? sample(row, base + 1) : 255;
      } else {
        pixels[target] = sample(row, base);
        pixels[target + 1] = sample(row, base + 1);
        pixels[target + 2] = sample(row, base + 2);
        pixels[target + 3] = colorType === 6 ? sample(row, base + 3) : 255;
      }
    }
  }
  return { width, height, pixels };
}

/** Reducao por fator inteiro com media de caixa. Mantem o que a captura mostra legivel. */
export function downscale({ width, height, pixels }, factor) {
  if (factor <= 1) return { width, height, pixels };
  const target = {
    width: Math.max(1, Math.floor(width / factor)),
    height: Math.max(1, Math.floor(height / factor)),
  };
  const output = Buffer.alloc(target.width * target.height * 4);
  for (let row = 0; row < target.height; row += 1) {
    for (let column = 0; column < target.width; column += 1) {
      const totals = [0, 0, 0, 0];
      let samples = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        const sourceRow = row * factor + dy;
        if (sourceRow >= height) break;
        for (let dx = 0; dx < factor; dx += 1) {
          const sourceColumn = column * factor + dx;
          if (sourceColumn >= width) break;
          const base = (sourceRow * width + sourceColumn) * 4;
          for (let channel = 0; channel < 4; channel += 1) totals[channel] += pixels[base + channel];
          samples += 1;
        }
      }
      const base = (row * target.width + column) * 4;
      for (let channel = 0; channel < 4; channel += 1)
        output[base + channel] = Math.round(totals[channel] / samples);
    }
  }
  return { ...target, pixels: output };
}

function filterRows(raw, height, rowBytes, pixelBytes) {
  const output = Buffer.alloc((rowBytes + 1) * height);
  const candidate = Buffer.alloc(rowBytes);
  for (let row = 0; row < height; row += 1) {
    const current = raw.subarray(row * rowBytes, (row + 1) * rowBytes);
    const previous = row > 0 ? raw.subarray((row - 1) * rowBytes, row * rowBytes) : null;
    let best = { filter: 0, score: Number.POSITIVE_INFINITY, bytes: current };
    for (let filter = 0; filter <= 4; filter += 1) {
      let score = 0;
      for (let index = 0; index < rowBytes; index += 1) {
        const left = index >= pixelBytes ? current[index - pixelBytes] : 0;
        const up = previous ? previous[index] : 0;
        const upLeft = previous && index >= pixelBytes ? previous[index - pixelBytes] : 0;
        let value = current[index];
        if (filter === 1) value = (value - left) & 0xff;
        else if (filter === 2) value = (value - up) & 0xff;
        else if (filter === 3) value = (value - ((left + up) >> 1)) & 0xff;
        else if (filter === 4) value = (value - paeth(left, up, upLeft)) & 0xff;
        candidate[index] = value;
        score += value < 128 ? value : 256 - value;
      }
      if (score < best.score) best = { filter, score, bytes: Buffer.from(candidate) };
    }
    output[row * (rowBytes + 1)] = best.filter;
    best.bytes.copy(output, row * (rowBytes + 1) + 1);
  }
  return output;
}

/** Escreve o PNG canonico: assinatura, IHDR, PLTE quando couber, IDAT e IEND. Nada mais. */
export function encodeCanonicalPng({ width, height, pixels }) {
  const opaque = (() => {
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 255) return false;
    return true;
  })();

  const colors = new Map();
  if (opaque) {
    for (let index = 0; index < pixels.length && colors.size <= 256; index += 4) {
      const key = (pixels[index] << 16) | (pixels[index + 1] << 8) | pixels[index + 2];
      if (!colors.has(key)) colors.set(key, colors.size);
    }
  }

  const variants = [];
  const push = (colorType, rowBytes, pixelBytes, fill, extra = []) => {
    const raw = Buffer.alloc(rowBytes * height);
    fill(raw, rowBytes);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = colorType;
    const body = deflateSync(filterRows(raw, height, rowBytes, pixelBytes), { level: 9 });
    variants.push({
      colorType,
      buffer: Buffer.concat([
        PNG_SIGNATURE,
        chunk("IHDR", ihdr),
        ...extra,
        chunk("IDAT", body),
        chunk("IEND"),
      ]),
    });
  };

  if (opaque && colors.size <= 256) {
    const palette = Buffer.alloc(colors.size * 3);
    for (const [key, index] of colors) {
      palette[index * 3] = (key >> 16) & 0xff;
      palette[index * 3 + 1] = (key >> 8) & 0xff;
      palette[index * 3 + 2] = key & 0xff;
    }
    push(
      3,
      width,
      1,
      (raw, rowBytes) => {
        for (let row = 0; row < height; row += 1)
          for (let column = 0; column < width; column += 1) {
            const base = (row * width + column) * 4;
            const key = (pixels[base] << 16) | (pixels[base + 1] << 8) | pixels[base + 2];
            raw[row * rowBytes + column] = colors.get(key);
          }
      },
      [chunk("PLTE", palette)],
    );
  }
  if (opaque) {
    push(2, width * 3, 3, (raw, rowBytes) => {
      for (let row = 0; row < height; row += 1)
        for (let column = 0; column < width; column += 1) {
          const source = (row * width + column) * 4;
          const target = row * rowBytes + column * 3;
          raw[target] = pixels[source];
          raw[target + 1] = pixels[source + 1];
          raw[target + 2] = pixels[source + 2];
        }
    });
  }
  push(6, width * 4, 4, (raw, rowBytes) => {
    for (let row = 0; row < height; row += 1)
      pixels.copy(raw, row * rowBytes, row * width * 4, (row + 1) * width * 4);
  });

  return variants.reduce((best, variant) => (variant.buffer.length < best.buffer.length ? variant : best));
}

/**
 * Reencoda respeitando o orcamento. `maxBytes` default nao e o teto do PNG: o wrapper selado leva o
 * screenshot em base64 junto do relatorio, com teto proprio, entao o PNG precisa caber com folga.
 */
export function canonicalizeScreenshot(source, { maxBytes = 28_000 } = {}) {
  if (maxBytes < 1 || maxBytes > MAX_REAL_BROWSER_SCREENSHOT_BYTES)
    throw new Error("SCREENSHOT_BUDGET_INVALID");
  const decoded = decodePng(source);
  for (const factor of [1, 2, 3, 4, 6, 8]) {
    const scaled = downscale(decoded, factor);
    const { colorType, buffer } = encodeCanonicalPng(scaled);
    if (buffer.length <= maxBytes || factor === 8) {
      const verdict = validateRealBrowserScreenshotPng(buffer);
      if (!verdict.valid) throw new Error(`SCREENSHOT_CANONICAL_REFUSED:${verdict.violations.join(",")}`);
      return {
        buffer,
        bytes: buffer.length,
        width: scaled.width,
        height: scaled.height,
        sourceWidth: decoded.width,
        sourceHeight: decoded.height,
        downscaleFactor: factor,
        colorType,
        withinBudget: buffer.length <= maxBytes,
        base64Bytes: Math.ceil(buffer.length / 3) * 4,
        variableBudgetBytes: MAX_REAL_BROWSER_VARIABLE_BYTES,
      };
    }
  }
  throw new Error("SCREENSHOT_BUDGET_UNREACHABLE");
}

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

async function main() {
  const input = argument("--input");
  const output = argument("--output");
  if (!input || !output) throw new Error("SCREENSHOT_PATHS_REQUIRED");
  const maxBytes = Number(argument("--max-bytes", "28000"));
  const result = canonicalizeScreenshot(await readFile(input), { maxBytes });
  await writeFile(output, result.buffer, { mode: 0o600 });
  console.log(
    JSON.stringify({
      event: "g12.real_browser.screenshot.canonicalized",
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      sourceWidth: result.sourceWidth,
      sourceHeight: result.sourceHeight,
      downscaleFactor: result.downscaleFactor,
      colorType: result.colorType,
      withinBudget: result.withinBudget,
      base64Bytes: result.base64Bytes,
      variableBudgetBytes: result.variableBudgetBytes,
    }),
  );
  if (!result.withinBudget) throw new Error(`SCREENSHOT_BUDGET_EXCEEDED:${result.bytes}>${maxBytes}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
