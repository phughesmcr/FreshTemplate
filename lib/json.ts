import { compress, decompress } from "brotli";

/**
 * Compresses a JSON-serializable object into a Uint8Array using Brotli compression.
 *
 * @param data The data to compress
 * @returns Compressed binary data
 * @throws Error if serialization or compression fails
 */
export function compressJson(data: unknown): Uint8Array {
  try {
    const jsonStr = JSON.stringify(data);
    const enc = new TextEncoder().encode(jsonStr);
    const compressed = compress(enc);

    if (!compressed) {
      throw new Error("Compression failed");
    }

    return compressed;
  } catch (error) {
    throw new Error(`Failed to compress JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Decompresses a Uint8Array created by compressJson back into its original object.
 *
 * @template T The expected type of the decompressed data
 * @param data The compressed data to decompress
 * @returns The decompressed data cast to type T
 * @throws Error if decompression or parsing fails
 */
export function decompressJson<T = unknown>(data: Uint8Array): T {
  if (!(data instanceof Uint8Array) || data.length === 0) {
    throw new Error("Invalid compressed data: must be a non-empty Uint8Array");
  }

  try {
    const decompressed = decompress(data);

    if (!decompressed) {
      throw new Error("Decompression failed");
    }

    const decStr = new TextDecoder().decode(decompressed);
    return JSON.parse(decStr) as T;
  } catch (error) {
    throw new Error(`Failed to decompress JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
