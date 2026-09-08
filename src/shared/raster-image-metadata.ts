export const MAX_RASTER_BYTES = 20 * 1024 * 1024;
export const MAX_RASTER_DIMENSION = 20_000;
export const MAX_RASTER_PIXELS = 32_000_000;

export type RasterMime = "image/png" | "image/jpeg" | "image/webp" | "image/avif";

export type RasterImageMetadata = {
  mime: RasterMime;
  encodedWidth: number;
  encodedHeight: number;
  width: number;
  height: number;
  orientation: number;
};

type Box = { type: string; start: number; dataStart: number; end: number };

const decoder = new TextDecoder("latin1");

function invalid(): never {
  throw new Error("INVALID_RASTER_METADATA");
}

function text(bytes: Uint8Array, start: number, length: number): string {
  if (start < 0 || length < 0 || start + length > bytes.length) invalid();
  return decoder.decode(bytes.subarray(start, start + length));
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function uint24LittleEndian(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 3 > bytes.length) invalid();
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function uint24BigEndian(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 3 > bytes.length) invalid();
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

function safeMetadata(
  mime: RasterMime,
  encodedWidth: number,
  encodedHeight: number,
  orientation = 1,
): RasterImageMetadata {
  if (
    !Number.isSafeInteger(encodedWidth) ||
    !Number.isSafeInteger(encodedHeight) ||
    encodedWidth < 1 ||
    encodedHeight < 1 ||
    encodedWidth > MAX_RASTER_DIMENSION ||
    encodedHeight > MAX_RASTER_DIMENSION ||
    encodedWidth * encodedHeight > MAX_RASTER_PIXELS ||
    !Number.isInteger(orientation) ||
    orientation < 1 ||
    orientation > 8
  )
    invalid();
  const swapsAxes = orientation >= 5;
  return {
    mime,
    encodedWidth,
    encodedHeight,
    width: swapsAxes ? encodedHeight : encodedWidth,
    height: swapsAxes ? encodedWidth : encodedHeight,
    orientation,
  };
}

function parseExifOrientation(payload: Uint8Array): number {
  let start = 0;
  if (payload.length >= 6 && text(payload, 0, 6) === "Exif\0\0") start = 6;
  if (start + 8 > payload.length) invalid();
  const byteOrder = text(payload, start, 2);
  if (byteOrder !== "II" && byteOrder !== "MM") invalid();
  const littleEndian = byteOrder === "II";
  const view = viewOf(payload);
  if (view.getUint16(start + 2, littleEndian) !== 42) invalid();
  const firstIfdOffset = view.getUint32(start + 4, littleEndian);
  const ifdStart = start + firstIfdOffset;
  if (firstIfdOffset < 8 || ifdStart + 2 > payload.length) invalid();
  const entryCount = view.getUint16(ifdStart, littleEndian);
  if (entryCount > 4_096 || ifdStart + 2 + entryCount * 12 + 4 > payload.length) invalid();
  let orientation = 1;
  let found = false;
  for (let index = 0; index < entryCount; index += 1) {
    const entry = ifdStart + 2 + index * 12;
    if (view.getUint16(entry, littleEndian) !== 0x0112) continue;
    if (
      found ||
      view.getUint16(entry + 2, littleEndian) !== 3 ||
      view.getUint32(entry + 4, littleEndian) !== 1
    )
      invalid();
    orientation = view.getUint16(entry + 8, littleEndian);
    if (orientation < 1 || orientation > 8) invalid();
    found = true;
  }
  return orientation;
}

function parsePng(bytes: Uint8Array): RasterImageMetadata {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 45 || !signature.every((value, index) => bytes[index] === value)) invalid();
  const view = viewOf(bytes);
  if (view.getUint32(8) !== 13 || text(bytes, 12, 4) !== "IHDR") invalid();
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  if (
    ![0, 2, 3, 4, 6].includes(colorType) ||
    ![1, 2, 4, 8, 16].includes(bitDepth) ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    bytes[28] > 1
  )
    invalid();
  let offset = 8;
  let orientation = 1;
  let sawExif = false;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = text(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const end = dataStart + length;
    if (end + 4 > bytes.length) invalid();
    if (type === "eXIf") {
      if (sawExif) invalid();
      orientation = parseExifOrientation(bytes.subarray(dataStart, end));
      sawExif = true;
    }
    offset = end + 4;
    if (type === "IEND") {
      if (length !== 0 || offset !== bytes.length) invalid();
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd) invalid();
  return safeMetadata("image/png", width, height, orientation);
}

const jpegStartOfFrameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function parseJpeg(bytes: Uint8Array): RasterImageMetadata {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) invalid();
  const view = viewOf(bytes);
  let offset = 2;
  let width = 0;
  let height = 0;
  let orientation = 1;
  let sawExif = false;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) invalid();
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) invalid();
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0xda) {
      if (!width || !height) invalid();
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) invalid();
    const segmentLength = view.getUint16(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) invalid();
    const payloadStart = offset + 2;
    const payloadEnd = offset + segmentLength;
    if (marker === 0xe1 && payloadEnd - payloadStart >= 6 && text(bytes, payloadStart, 6) === "Exif\0\0") {
      if (sawExif) invalid();
      orientation = parseExifOrientation(bytes.subarray(payloadStart, payloadEnd));
      sawExif = true;
    }
    if (jpegStartOfFrameMarkers.has(marker)) {
      if (segmentLength < 8 || width || height) invalid();
      height = view.getUint16(payloadStart + 1);
      width = view.getUint16(payloadStart + 3);
    }
    offset += segmentLength;
  }
  if (!width || !height) invalid();
  return safeMetadata("image/jpeg", width, height, orientation);
}

function parseWebp(bytes: Uint8Array): RasterImageMetadata {
  if (bytes.length < 20 || text(bytes, 0, 4) !== "RIFF" || text(bytes, 8, 4) !== "WEBP") invalid();
  const view = viewOf(bytes);
  if (view.getUint32(4, true) !== bytes.length - 8) invalid();
  let offset = 12;
  let width = 0;
  let height = 0;
  let orientation = 1;
  let sawExtendedHeader = false;
  let sawImagePayload = false;
  let sawExif = false;
  while (offset + 8 <= bytes.length) {
    const type = text(bytes, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const end = dataStart + length;
    if (end > bytes.length) invalid();
    if (type === "VP8X") {
      if (length !== 10 || sawExtendedHeader || sawImagePayload) invalid();
      width = uint24LittleEndian(bytes, dataStart + 4) + 1;
      height = uint24LittleEndian(bytes, dataStart + 7) + 1;
      sawExtendedHeader = true;
    } else if (type === "VP8 ") {
      if (
        length < 10 ||
        sawImagePayload ||
        bytes[dataStart + 3] !== 0x9d ||
        bytes[dataStart + 4] !== 0x01 ||
        bytes[dataStart + 5] !== 0x2a
      )
        invalid();
      const payloadWidth = view.getUint16(dataStart + 6, true) & 0x3fff;
      const payloadHeight = view.getUint16(dataStart + 8, true) & 0x3fff;
      if (sawExtendedHeader && (payloadWidth !== width || payloadHeight !== height)) invalid();
      width = payloadWidth;
      height = payloadHeight;
      sawImagePayload = true;
    } else if (type === "VP8L") {
      if (length < 5 || sawImagePayload || bytes[dataStart] !== 0x2f) invalid();
      const packed = view.getUint32(dataStart + 1, true);
      const payloadWidth = (packed & 0x3fff) + 1;
      const payloadHeight = ((packed >>> 14) & 0x3fff) + 1;
      if (sawExtendedHeader && (payloadWidth !== width || payloadHeight !== height)) invalid();
      width = payloadWidth;
      height = payloadHeight;
      sawImagePayload = true;
    } else if (type === "EXIF") {
      if (sawExif) invalid();
      orientation = parseExifOrientation(bytes.subarray(dataStart, end));
      sawExif = true;
    }
    offset = end + (length % 2);
  }
  if (!sawImagePayload || offset !== bytes.length) invalid();
  return safeMetadata("image/webp", width, height, orientation);
}

function readBoxes(bytes: Uint8Array, start: number, end: number): Box[] {
  if (start < 0 || end > bytes.length || start > end) invalid();
  const view = viewOf(bytes);
  const boxes: Box[] = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) invalid();
    let size = view.getUint32(offset);
    const type = text(bytes, offset + 4, 4);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > end) invalid();
      const largeSize = view.getBigUint64(offset + 8);
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
      size = Number(largeSize);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) invalid();
    boxes.push({ type, start: offset, dataStart: offset + headerSize, end: offset + size });
    offset += size;
  }
  return boxes;
}

function parseAvif(bytes: Uint8Array): RasterImageMetadata {
  const top = readBoxes(bytes, 0, bytes.length);
  const ftyp = top.find((box) => box.type === "ftyp");
  if (!ftyp || ftyp.end - ftyp.dataStart < 8) invalid();
  const brands = text(bytes, ftyp.dataStart, ftyp.end - ftyp.dataStart);
  if (!brands.includes("avif") && !brands.includes("avis")) invalid();
  const meta = top.find((box) => box.type === "meta");
  if (!meta || meta.dataStart + 4 > meta.end) invalid();
  const metaChildren = readBoxes(bytes, meta.dataStart + 4, meta.end);
  const pitm = metaChildren.find((box) => box.type === "pitm");
  const iprp = metaChildren.find((box) => box.type === "iprp");
  if (!pitm || !iprp || pitm.dataStart + 6 > pitm.end) invalid();
  const view = viewOf(bytes);
  const pitmVersion = bytes[pitm.dataStart];
  const primaryItemId =
    pitmVersion === 0
      ? view.getUint16(pitm.dataStart + 4)
      : pitm.dataStart + 8 <= pitm.end
        ? view.getUint32(pitm.dataStart + 4)
        : invalid();
  const iprpChildren = readBoxes(bytes, iprp.dataStart, iprp.end);
  const ipco = iprpChildren.find((box) => box.type === "ipco");
  const ipma = iprpChildren.find((box) => box.type === "ipma");
  if (!ipco || !ipma || ipma.dataStart + 8 > ipma.end) invalid();
  const properties = readBoxes(bytes, ipco.dataStart, ipco.end);
  const ipmaVersion = bytes[ipma.dataStart];
  if (ipmaVersion > 1) invalid();
  const ipmaFlags = uint24BigEndian(bytes, ipma.dataStart + 1);
  const largeAssociations = (ipmaFlags & 1) === 1;
  let offset = ipma.dataStart + 4;
  const entryCount = view.getUint32(offset);
  offset += 4;
  let propertyIndexes: number[] | null = null;
  for (let entry = 0; entry < entryCount; entry += 1) {
    const idBytes = ipmaVersion < 1 ? 2 : 4;
    if (offset + idBytes + 1 > ipma.end) invalid();
    const itemId = idBytes === 2 ? view.getUint16(offset) : view.getUint32(offset);
    offset += idBytes;
    const associationCount = bytes[offset++];
    const indexes: number[] = [];
    for (let association = 0; association < associationCount; association += 1) {
      if (largeAssociations) {
        if (offset + 2 > ipma.end) invalid();
        indexes.push(view.getUint16(offset) & 0x7fff);
        offset += 2;
      } else {
        if (offset + 1 > ipma.end) invalid();
        indexes.push(bytes[offset++] & 0x7f);
      }
    }
    if (itemId === primaryItemId) {
      if (propertyIndexes) invalid();
      propertyIndexes = indexes.filter((index) => index > 0);
    }
  }
  if (offset !== ipma.end || !propertyIndexes) invalid();
  let width = 0;
  let height = 0;
  let orientation = 1;
  let sawRotation = false;
  for (const propertyIndex of propertyIndexes) {
    const property = properties[propertyIndex - 1];
    if (!property) invalid();
    if (property.type === "ispe") {
      if (width || height || property.dataStart + 12 > property.end) invalid();
      width = view.getUint32(property.dataStart + 4);
      height = view.getUint32(property.dataStart + 8);
    } else if (property.type === "irot") {
      if (sawRotation || property.dataStart + 1 !== property.end) invalid();
      const angle = bytes[property.dataStart] & 0x03;
      orientation = angle === 1 ? 8 : angle === 2 ? 3 : angle === 3 ? 6 : 1;
      sawRotation = true;
    }
  }
  if (!width || !height) invalid();
  return safeMetadata("image/avif", width, height, orientation);
}

export function inspectRasterImage(bytes: Uint8Array): RasterImageMetadata {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > MAX_RASTER_BYTES) invalid();
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  )
    return parsePng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return parseJpeg(bytes);
  if (text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 4) === "WEBP") return parseWebp(bytes);
  if (text(bytes, 4, 4) === "ftyp") return parseAvif(bytes);
  return invalid();
}

export function containedRasterDimensions(
  width: number,
  height: number,
  maximumEdge: number,
): { width: number; height: number } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(maximumEdge) ||
    width < 1 ||
    height < 1 ||
    maximumEdge < 1 ||
    width > MAX_RASTER_DIMENSION ||
    height > MAX_RASTER_DIMENSION ||
    width * height > MAX_RASTER_PIXELS
  )
    invalid();
  const scale = Math.min(1, Math.round(maximumEdge) / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
