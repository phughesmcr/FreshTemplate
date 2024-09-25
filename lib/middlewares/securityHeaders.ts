import type { FreshContext } from "$fresh/server.ts";
import { encodeHex } from "@std/encoding/hex";
import { md5 } from "@takker/md5";
import { isProtectedRoute } from "lib/middlewares/protectedRoutes.ts";
import type { ServerState } from "./state.ts";

const SECURITY_HEADERS: Record<string, string> = {
  // "Access-Control-Allow-Origin": "https://trusted-site.com",
  // deno-fmt-ignore
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'; upgrade-insecure-requests; frame-ancestors 'none'; connect-src 'self' https://api.openai.com; media-src 'self' data: blob:; manifest-src 'self';",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
  // "Cross-Origin-Resource-Policy": "same-origin",
  "Expect-CT": "max-age=86400, enforce",
  // "NEL": "{\"report_to\":\"default\",\"max_age\":31536000,\"include_subdomains\":true}",
  "Origin-Agent-Cluster": "?1",
  // deno-fmt-ignore
  "Permissions-Policy": "accelerometer=(), camera=(), encrypted-media=(), gyroscope=(), interest-cohort=(), microphone=(), magnetometer=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), sync-xhr=(), usb=(), xr-spatial-tracking=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  // "Report-To": "{\"group\":\"default\",\"max_age\":31536000,\"endpoints\":[{\"url\":\"https://your-report-collector.example.com/reports\"}]}"
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-DNS-Prefetch-Control": "off",
  "X-Download-Options": "noopen",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Permitted-Cross-Domain-Policies": "none",
  "X-XSS-Protection": "1; mode=block",
};

const MIME_TYPES: Record<string, string> = {
  // Text
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".webmanifest": "application/manifest+json",

  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",

  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",

  // Video
  ".mp4": "video/mp4",
  ".webm": "video/webm",

  // Fonts
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",

  // Documents
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  // Archives
  ".zip": "application/zip",
  ".rar": "application/x-rar-compressed",
  ".7z": "application/x-7z-compressed",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",

  // Other
  ".wasm": "application/wasm",
};

const CACHEABLE_EXTENSIONS: Set<string> = new Set([".css", ".jpg", ".js", ".png", ".svg"]);

const setSecurityHeaders = (headers: Headers): void => {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => headers.set(key, value));
};

const setContentType = (headers: Headers, path: string): void => {
  const extension = path.substring(path.lastIndexOf(".")).toLowerCase();
  const mimeType = MIME_TYPES[extension];
  if (mimeType) {
    headers.set("Content-Type", mimeType);
  }
};

const setCacheControl = (headers: Headers, path: string): void => {
  if (isProtectedRoute(path)) {
    headers.set("Cache-Control", "no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
  } else {
    const extension = path.substring(path.lastIndexOf("."));
    if (CACHEABLE_EXTENSIONS.has(extension)) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
  }
};

const setETag = (headers: Headers, path: string): void => {
  const extension = path.substring(path.lastIndexOf("."));
  if (extension === ".css" || extension === ".js") {
    const hash = encodeHex(md5(path));
    headers.set("ETag", `"${hash}"`);
  }
};

const setCorsHeaders = (headers: Headers, method: string, origin: string | null): void => {
  if (!origin) return;
  if (method === "OPTIONS") {
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  } else {
    headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With",
    );
  }
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "POST, GET");
  headers.set("Access-Control-Max-Age", "86400");
};

const deleteXPowerBy = (headers: Headers): void => {
  headers.delete("X-Powered-By");
};

const applyHeaders = (headers: Headers, path: string, method: string, origin: string | null): void => {
  setSecurityHeaders(headers);
  setCacheControl(headers, path);
  setETag(headers, path);
  setContentType(headers, path);
  setCorsHeaders(headers, method, origin);
  deleteXPowerBy(headers);
};

export default async function securityHeaders(req: Request, ctx: FreshContext<ServerState>) {
  if (!ctx.destination) return ctx.next();
  try {
    const origin = req.headers.get("Origin");
    const resp = await ctx.next();
    const path = new URL(req.url).pathname;
    applyHeaders(resp.headers, path, req.method, origin);
    return resp;
  } catch (error) {
    console.error("Security headers middleware error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
