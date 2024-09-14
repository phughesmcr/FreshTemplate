import type { FreshContext } from "$fresh/server.ts";
import { encodeHex } from "@std/encoding/hex";
import { md5 } from "@takker/md5";

const ALLOWED_ORIGINS: string[] = [
  "http://localhost",
  "http://localhost:8000",
  "http://127.0.0.1",
  "http://127.0.0.1:8000",
];

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
  "X-XSS-Protection": "0",
};

const CONTENT_TYPES: Map<string, string> = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "application/javascript"],
  [".json", "application/json"],
  [".mp3", "audio/mpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
]);

const CACHEABLE_EXTENSIONS: Set<string> = new Set([".css", ".jpg", ".js", ".png", ".svg"]);

const SENSITIVE_PATHS = new Set(["/api"]);

const setSecurityHeaders = (headers: Headers): void => {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => headers.set(key, value));
};

const setContentType = (headers: Headers, path: string): void => {
  const extension = path.substring(path.lastIndexOf("."));
  const contentType = CONTENT_TYPES.get(extension);
  if (contentType) headers.set("Content-Type", contentType);
};

const setCacheControl = (headers: Headers, path: string): void => {
  if (SENSITIVE_PATHS.has(path)) {
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

const applyHeaders = (headers: Headers, path: string): void => {
  [setSecurityHeaders, setContentType, setCacheControl, setETag]
    .forEach((fn) => fn(headers, path));
};

const setCorsHeaders = (headers: Headers, method: string, origin: string): void => {
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

export default async function handler(req: Request, ctx: FreshContext) {
  try {
    const origin = req.headers.get("Origin");
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }
    const resp = await ctx.next();
    const path = new URL(req.url).pathname;
    if (origin) {
      setCorsHeaders(resp.headers, req.method, origin);
    }
    if (!path.startsWith("/_frsh/")) {
      applyHeaders(resp.headers, path);
    }
    deleteXPowerBy(resp.headers);
    return resp;
  } catch (error) {
    console.error("Error in security middleware:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
