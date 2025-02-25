import type { FreshContext } from "$fresh/server.ts";
import { compress as brotliCompress } from "brotli";
import { gzip } from "compress";
import type { ServerState } from "lib/middlewares/state.ts";

export interface CompressionOptions {
  /** MIME types that should be compressed */
  compressibleTypes?: string[];
  /** Minimum size in bytes before compression is applied */
  minSize?: number;
  /** Compression quality for Brotli (0-11, higher = better compression but slower) */
  brotliQuality?: number;
  /** Compression level for Gzip (1-9, higher = better compression but slower) */
  gzipLevel?: number;
  /** Whether to disable Brotli compression */
  disableBrotli?: boolean;
  /** Whether to disable Gzip compression */
  disableGzip?: boolean;
}

const DEFAULT_OPTIONS: CompressionOptions = {
  compressibleTypes: [
    "text/",
    "application/json",
    "application/xml",
    "application/javascript",
    "application/xhtml+xml",
    "image/svg+xml",
  ],
  minSize: 1024, // 1KB
  brotliQuality: 4,
  gzipLevel: 6,
  disableBrotli: false,
  disableGzip: false,
};

/**
 * Creates a compression middleware for Fresh applications
 * Automatically compresses responses with Brotli or Gzip based on browser support
 */
export function createCompressionMiddleware(options?: CompressionOptions) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async function compressionMiddleware(
    req: Request,
    ctx: FreshContext<ServerState>,
  ) {
    if (!ctx.destination) return ctx.next();

    const resp = await ctx.next();
    const headers = new Headers(resp.headers);

    // Skip compression if already encoded or for event streams
    if (
      headers.get("Content-Encoding") ||
      headers.get("Content-Type") === "text/event-stream"
    ) {
      return resp;
    }

    // Skip compression for non-compressible content types
    const contentType = headers.get("Content-Type");
    if (
      !contentType ||
      !config.compressibleTypes?.some((type) => contentType.startsWith(type))
    ) {
      return resp;
    }

    // Check if client supports compression
    const acceptEncoding = req.headers.get("accept-encoding") || "";

    // Check if we have a content-length header to avoid buffering
    const contentLength = headers.get("Content-Length");
    if (contentLength && parseInt(contentLength, 10) <= (config.minSize || 0)) {
      return resp;
    }

    // Buffer the response to check size and compress
    const originalBody = new Uint8Array(await resp.arrayBuffer());

    // Skip if response is too small
    if (originalBody.byteLength <= (config.minSize || 0)) {
      return new Response(originalBody, {
        status: resp.status,
        statusText: resp.statusText,
        headers,
      });
    }

    // Try Brotli first if supported and enabled
    if (!config.disableBrotli && acceptEncoding.includes("br")) {
      try {
        const compressedBody = brotliCompress(originalBody, config.brotliQuality);

        // Only use compression if it actually reduces size
        if (compressedBody.length < originalBody.byteLength) {
          headers.set("Content-Encoding", "br");
          headers.set("Content-Length", compressedBody.length.toString());
          headers.set("Vary", "Accept-Encoding");

          return new Response(compressedBody, {
            status: resp.status,
            statusText: resp.statusText,
            headers,
          });
        }
      } catch (error) {
        console.error("Brotli compression failed:", error);
      }
    }

    // Try Gzip if Brotli fails or is not supported/enabled
    if (!config.disableGzip && acceptEncoding.includes("gzip")) {
      try {
        // The compress module's gzip function doesn't accept options directly
        // Using default compression level
        const compressedBody = gzip(originalBody);

        // Only use compression if it actually reduces size
        if (compressedBody.length < originalBody.byteLength) {
          headers.set("Content-Encoding", "gzip");
          headers.set("Content-Length", compressedBody.length.toString());
          headers.set("Vary", "Accept-Encoding");

          return new Response(compressedBody, {
            status: resp.status,
            statusText: resp.statusText,
            headers,
          });
        }
      } catch (error) {
        console.error("Gzip compression failed:", error);
      }
    }

    // Return uncompressed response if compression failed or didn't reduce size
    return new Response(originalBody, {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    });
  };
}

// Export a middleware with default options for easy usage
export default createCompressionMiddleware();
