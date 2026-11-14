// Minimal GRIB2 reader for NOAA GFS fields on a regular lat/lon grid (template 3.0) packed with
// simple packing (5.0, NOMADS sub-region files) or complex packing + spatial differencing (5.3, global files).
// shortcut: only templates 3.0 / 5.0 / 5.3 without a bitmap are handled; anything else throws, so a format change is loud.

export interface GribField {
  category: number; // section 4 parameter category (2 = momentum)
  parameter: number; // 2 = UGRD, 3 = VGRD
  ni: number; // points along a parallel (longitudes)
  nj: number; // points along a meridian (latitudes)
  lat1: number; // first grid point, degrees
  lng1: number;
  scanMode: number;
  values: Float32Array; // row by row as scanned
}

class Bits {
  pos = 0; // bit position
  constructor(private b: Uint8Array, start: number) { this.pos = start * 8; }
  read(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.b[this.pos >> 3]!;
      v = v * 2 + ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v;
  }
  align() { this.pos = Math.ceil(this.pos / 8) * 8; }
}

const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
const u16 = (b: Uint8Array, o: number) => (b[o]! << 8) + b[o + 1]!;
// GRIB2 signed integers are sign-magnitude, not two's complement.
const s16 = (b: Uint8Array, o: number) => (b[o]! & 0x80 ? -1 : 1) * (((b[o]! & 0x7f) << 8) + b[o + 1]!);
const s32 = (b: Uint8Array, o: number) => (b[o]! & 0x80 ? -1 : 1) * (((b[o]! & 0x7f) << 24) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!);
const signedN = (v: number, n: number) => { const top = 2 ** (8 * n - 1); return v >= top ? -(v - top) : v; };
const f32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset + o, 4).getFloat32(0, false);

export function decodeGrib2(buf: Uint8Array): GribField[] {
  const out: GribField[] = [];
  let o = 0;
  while (o + 16 <= buf.length && String.fromCharCode(...buf.subarray(o, o + 4)) === "GRIB") {
    const total = u32(buf, o + 12); // high 32 bits of the 64-bit length are 0 for these small messages
    const end = o + total;
    let p = o + 16;
    const f: Partial<GribField> = {};
    let s5 = -1;
    let packing = -1;
    while (p < end - 4) {
      const len = u32(buf, p);
      const num = buf[p + 4];
      if (num === 3) {
        if (u16(buf, p + 12) !== 0) throw new Error("GRIB2: only lat/lon grids (3.0) supported");
        f.ni = u32(buf, p + 30);
        f.nj = u32(buf, p + 34);
        f.lat1 = s32(buf, p + 46) / 1e6;
        f.lng1 = s32(buf, p + 50) / 1e6;
        f.scanMode = buf[p + 71]!;
      } else if (num === 4) {
        f.category = buf[p + 9]!;
        f.parameter = buf[p + 10]!;
      } else if (num === 5) {
        packing = u16(buf, p + 9);
        if (packing !== 0 && packing !== 3) throw new Error(`GRIB2: packing 5.${packing} not supported`);
        s5 = p;
      } else if (num === 6) {
        if (buf[p + 5] !== 255) throw new Error("GRIB2: bitmaps not supported");
      } else if (num === 7) {
        f.values = (packing === 0 ? unpack50 : unpack53)(buf, s5, p + 5, f.ni! * f.nj!);
      }
      p += len;
    }
    out.push(f as GribField);
    o = end;
  }
  return out;
}

function unpack50(b: Uint8Array, s5: number, data: number, n: number): Float32Array {
  const R = f32(b, s5 + 11), E = s16(b, s5 + 15), D = s16(b, s5 + 17), nbits = b[s5 + 19]!;
  const bits = new Bits(b, data);
  const scaleE = 2 ** E, scaleD = 10 ** -D;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = (R + (nbits ? bits.read(nbits) : 0) * scaleE) * scaleD;
  return v;
}

function unpack53(b: Uint8Array, s5: number, data: number, n: number): Float32Array {
  // Offsets below are the spec's 1-based octet numbers minus 1, relative to the section start.
  const R = f32(b, s5 + 11);
  const E = s16(b, s5 + 15);
  const D = s16(b, s5 + 17);
  const nbits = b[s5 + 19]!;
  const NG = u32(b, s5 + 31);
  const widthRef = b[s5 + 35]!;
  const widthBits = b[s5 + 36]!;
  const lenRef = u32(b, s5 + 37);
  const lenInc = b[s5 + 41]!;
  const lastLen = u32(b, s5 + 42);
  const lenBits = b[s5 + 46]!;
  const order = b[s5 + 47]!;
  const extra = b[s5 + 48]!;

  const bits = new Bits(b, data);
  const h: number[] = [];
  for (let i = 0; i < order; i++) h.push(signedN(bits.read(8 * extra), extra));
  const gmin = signedN(bits.read(8 * extra), extra);

  const refs = new Array<number>(NG), widths = new Array<number>(NG), lens = new Array<number>(NG);
  for (let g = 0; g < NG; g++) refs[g] = bits.read(nbits);
  bits.align();
  for (let g = 0; g < NG; g++) widths[g] = widthRef + bits.read(widthBits);
  bits.align();
  for (let g = 0; g < NG; g++) lens[g] = lenRef + lenInc * bits.read(lenBits);
  lens[NG - 1] = lastLen;
  bits.align();

  const x = new Float64Array(n);
  let k = 0;
  for (let g = 0; g < NG; g++) {
    for (let i = 0; i < lens[g]! && k < n; i++) x[k++] = refs[g]! + (widths[g]! ? bits.read(widths[g]!) : 0);
  }
  // Undo spatial differencing.
  if (order === 1) {
    x[0] = h[0]!;
    for (let i = 1; i < n; i++) x[i] = x[i]! + gmin + x[i - 1]!;
  } else if (order === 2) {
    x[0] = h[0]!;
    x[1] = h[1]!;
    for (let i = 2; i < n; i++) x[i] = x[i]! + gmin + 2 * x[i - 1]! - x[i - 2]!;
  }
  const scaleE = 2 ** E, scaleD = 10 ** -D;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = (R + x[i]! * scaleE) * scaleD;
  return v;
}
