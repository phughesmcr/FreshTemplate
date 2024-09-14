import { compress, decompress } from "brotli";

export function compressJson(data: unknown): Uint8Array {
  const jsonStr = JSON.stringify(data);
  const enc = new TextEncoder().encode(jsonStr);
  return compress(enc);
}

export function decompressJson(data: Uint8Array): unknown {
  const dec = decompress(data);
  const decStr = new TextDecoder().decode(dec);
  return JSON.parse(decStr);
}
