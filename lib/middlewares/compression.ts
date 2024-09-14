import type { FreshContext } from "$fresh/server.ts";
import { compress } from "brotli";
import { gzip } from "compress";

const COMPRESSIBLE_TYPES = [
  "text/",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/xhtml+xml",
  "image/svg+xml",
];

const MIN_SIZE = 1024; // Only compress responses larger than 1KB

export default async function handler(req: Request, ctx: FreshContext) {
  const resp = await ctx.next();
  const headers = resp.headers;

  // Skip compression if already encoded or for event streams
  if (headers.get("Content-Encoding") || headers.get("Content-Type") === "text/event-stream") {
    return resp;
  }

  const contentType = headers.get("Content-Type");
  if (!contentType || !COMPRESSIBLE_TYPES.some((type) => contentType.startsWith(type))) {
    return resp;
  }

  // Check if the client accepts Brotli compression
  const acceptEncoding = req.headers.get("accept-encoding");
  if (acceptEncoding?.includes("br")) {
    try {
      const body = await resp.arrayBuffer();

      // Only compress if there's a substantial body to compress
      if (body.byteLength > MIN_SIZE) {
        const compressedBody = compress(new Uint8Array(body));

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
      // Fall back to uncompressed response
    }
  } else if (acceptEncoding?.includes("gzip")) {
    try {
      const body = await resp.arrayBuffer();
      const compressedBody = gzip(new Uint8Array(body));
      headers.set("Content-Encoding", "gzip");
      headers.set("Content-Length", compressedBody.length.toString());
      headers.set("Vary", "Accept-Encoding");

      return new Response(compressedBody, {
        status: resp.status,
        statusText: resp.statusText,
        headers,
      });
    } catch (error) {
      console.error("Gzip compression failed:", error);
    }
  }

  return resp;
}
