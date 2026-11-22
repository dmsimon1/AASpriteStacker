/**
 * Exports edge-dilated horizontal slice-strip PNGs from built-in @aastack/blueprint presets
 * into the Godot 4 sample project and Unity URP UPM package (zero external dependencies).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { compileBlueprint, createCottageBlueprint, createSportsCarBlueprint } from "../packages/blueprint/dist/index.js";

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodeRgbaPng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowOff = y * (stride + 1);
    raw[rowOff] = 0; // filter None
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), rowOff + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

function exportAssetStrip(asset) {
  const width = asset.w * asset.h;
  const height = asset.l;
  const strip = new Uint8Array(width * height * 4);
  const area = asset.w * asset.l;
  for (let z = 0; z < asset.h; z++) {
    for (let y = 0; y < asset.l; y++) {
      for (let x = 0; x < asset.w; x++) {
        const src = (z * area + y * asset.w + x) * 4;
        const dst = (y * width + (z * asset.w + x)) * 4;
        strip[dst + 0] = asset.rgba[src + 0];
        strip[dst + 1] = asset.rgba[src + 1];
        strip[dst + 2] = asset.rgba[src + 2];
        strip[dst + 3] = asset.rgba[src + 3];
      }
    }
  }
  return { width, height, png: encodeRgbaPng(width, height, strip) };
}

const presets = [
  { file: "car_slices.png", asset: compileBlueprint(createSportsCarBlueprint("car")) },
  { file: "cottage_slices.png", asset: compileBlueprint(createCottageBlueprint("cottage")) },
];

const targets = [
  resolve("shaders/godot4/assets"),
  resolve("shaders/unity-urp/Samples~/Demo/Textures"),
];

for (const { file, asset } of presets) {
  const { width, height, png } = exportAssetStrip(asset);
  for (const dir of targets) {
    const outPath = resolve(dir, file);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, png);
  }
  console.log(`Exported ${file} (${width}x${height}, ${asset.h} slices, ${png.length} B)`);
}
