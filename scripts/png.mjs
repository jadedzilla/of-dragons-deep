// Minimal zero-dependency PNG decode/encode (8-bit RGB/RGBA, non-interlaced), enough to build icon sprite sheets.
import { inflateSync, deflateSync } from "node:zlib";

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Decode a PNG into { width, height, data } where data is RGBA (4 bytes per pixel). */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error("Not a PNG");
  let pos = 8, width, height, depth, ctype, interlace, palette, trns;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      depth = body[8]; ctype = body[9]; interlace = body[12];
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") trns = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (depth !== 8 || interlace || !channels) throw new Error(`Unsupported PNG (depth ${depth}, colour type ${ctype}, interlace ${interlace})`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels, bpp = channels;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride), prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0, b = prev ? prev[x] : 0, c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = src[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = v & 255;
    }
  }

  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels, d = i * 4;
    if (ctype === 6) px.copy(data, d, s, s + 4);
    else if (ctype === 2) { px.copy(data, d, s, s + 3); data[d + 3] = 255; }
    else if (ctype === 0 || ctype === 4) { data[d] = data[d + 1] = data[d + 2] = px[s]; data[d + 3] = ctype === 4 ? px[s + 1] : 255; }
    else { const k = px[s]; palette.copy(data, d, k * 3, k * 3 + 3); data[d + 3] = trns && k < trns.length ? trns[k] : 255; }
  }
  return { width, height, data };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}

/** Encode RGBA pixels as a PNG, choosing the cheapest filter per row (minimum sum of absolute differences). */
export function encodePng({ width, height, data }) {
  const stride = width * 4, raw = Buffer.alloc((stride + 1) * height), cand = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const row = data.subarray(y * stride, (y + 1) * stride), prev = y ? data.subarray((y - 1) * stride, y * stride) : null;
    let best = Infinity, bestF = 0, bestRow = null;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? row[x - 4] : 0, b = prev ? prev[x] : 0, c = prev && x >= 4 ? prev[x - 4] : 0;
        let p = 0;
        if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
        else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const v = (row[x] - p) & 255;
        cand[x] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < best) { best = sum; bestF = f; bestRow = Buffer.from(cand); }
    }
    raw[y * (stride + 1)] = bestF;
    bestRow.copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
