import type { FreshContext } from "$fresh/server.ts";
import { compress } from "brotli";
import { gzip } from "compress";
import type { ServerState } from "./state.ts";

const COMPRESSIBLE_TYPES = [
  "text/",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/xhtml+xml",
  "image/svg+xml",
];

const MIN_SIZE = 1024; // Only compress responses larger than 1KB

export default async function Compression(req: Request, ctx: FreshContext<ServerState>) {
  if (!ctx.destination) return ctx.next();
  const resp = await ctx.next();
  const headers = new Headers(resp.headers);

  if (headers.get("Content-Encoding") || headers.get("Content-Type") === "text/event-stream") {
    return resp;
  }

  const contentType = headers.get("Content-Type");
  if (!contentType || !COMPRESSIBLE_TYPES.some((type) => contentType.startsWith(type))) {
    return resp;
  }

  const acceptEncoding = req.headers.get("accept-encoding");
  const body = await resp.arrayBuffer();

  if (body.byteLength <= MIN_SIZE) {
    return new Response(body, {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    });
  }

  if (acceptEncoding?.includes("br")) {
    try {
      const compressedBody = compress(new Uint8Array(body));
      headers.set("Content-Encoding", "br");
      headers.set("Content-Length", compressedBody.length.toString());
      headers.set("Vary", "Accept-Encoding");
      return new Response(compressedBody, {
        status: resp.status,
        statusText: resp.statusText,
        headers,
      });
    } catch (error) {
      console.error("Brotli compression failed:", error);
    }
  } else if (acceptEncoding?.includes("gzip")) {
    try {
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

  return new Response(body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}
