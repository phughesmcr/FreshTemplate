import type { FreshContext } from "$fresh/server.ts";
import { encodeHex } from "@std/encoding/hex";
import { md5 } from "@takker/md5";
import { isProtectedRoute } from "lib/middlewares/protectedRoutes.ts";
import type { ServerState } from "./state.ts";

/**
 * Security header names type for type safety
 */
export type SecurityHeaderName =
  | "Content-Security-Policy"
  | "Cross-Origin-Embedder-Policy"
  | "Cross-Origin-Opener-Policy"
  | "Cross-Origin-Resource-Policy"
  | "Expect-CT"
  | "Origin-Agent-Cluster"
  | "Permissions-Policy"
  | "Referrer-Policy"
  | "Strict-Transport-Security"
  | "X-Content-Type-Options"
  | "X-DNS-Prefetch-Control"
  | "X-Download-Options"
  | "X-Frame-Options"
  | "X-Permitted-Cross-Domain-Policies"
  | "X-XSS-Protection";

/**
 * Security headers to be applied to all responses
 */
const SECURITY_HEADERS: Record<SecurityHeaderName, string> = {
  // deno-fmt-ignore
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
    "connect-src 'self' https://api.openai.com",
    "media-src 'self' data: blob:",
    "manifest-src 'self'",
    "worker-src 'self' blob:"
  ].join("; "),
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Expect-CT": "max-age=86400, enforce",
  "Origin-Agent-Cluster": "?1",
  // deno-fmt-ignore
  "Permissions-Policy": [
    // Sensors and device access
    "accelerometer=()",
    "ambient-light-sensor=()",
    "battery=()",
    "camera=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=()",
    
    // Feature policies
    "autoplay=()",
    "document-domain=()",
    "encrypted-media=()",
    "fullscreen=()",
    "geolocation=()",
    "picture-in-picture=()",
    
    // Advanced features
    "payment=()",
    "publickey-credentials-get=()",
    "usb=()",
    "xr-spatial-tracking=()",
    
    // Performance and monitoring
    "execution-while-not-rendered=()",
    "execution-while-out-of-viewport=()",
    "sync-xhr=()",
    
    // Privacy-sensitive features
    "screen-wake-lock=()",
    "web-share=()",
    "clipboard-read=()",
    "clipboard-write=()",
    "gamepad=()",
    "speaker-selection=()",
    "interest-cohort=()",
    
    // Experimental features
    "conversion-measurement=()",
    "focus-without-user-activation=()",
    "hid=()",
    "idle-detection=()",
    "serial=()",
    "trust-token-redemption=()",
    "window-placement=()",
    "vertical-scroll=()",
    "keyboard-map=()",
    "midi=()",
    "navigation-override=()",
    "cross-origin-isolated=()",
    "display-capture=()"
  ].join(", "),
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-DNS-Prefetch-Control": "off",
  "X-Download-Options": "noopen",
  "X-Frame-Options": "DENY",
  "X-Permitted-Cross-Domain-Policies": "none",
  "X-XSS-Protection": "0", // Modern browsers don't need this
};

/**
 * Cache for ETag values to avoid recalculating
 */
const etagCache = new Map<string, string>();

/**
 * Maps file extensions to MIME types
 */
const MIME_TYPES = new Map<string, string>([
  // Text
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json"],
  [".xml", "application/xml"],
  [".txt", "text/plain"],
  [".md", "text/markdown"],
  [".webmanifest", "application/manifest+json"],

  // Images
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],

  // Audio
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],

  // Video
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],

  // Fonts
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
  [".eot", "application/vnd.ms-fontobject"],

  // Documents
  [".pdf", "application/pdf"],
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".xls", "application/vnd.ms-excel"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".ppt", "application/vnd.ms-powerpoint"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],

  // Archives
  [".zip", "application/zip"],
  [".rar", "application/x-rar-compressed"],
  [".7z", "application/x-7z-compressed"],
  [".tar", "application/x-tar"],
  [".gz", "application/gzip"],

  // Other
  [".wasm", "application/wasm"],
]);

/**
 * File extensions that should be cached
 */
const CACHEABLE_EXTENSIONS = new Set([".css", ".jpg", ".js", ".png", ".svg", ".woff", ".woff2"]);

/**
 * Extracts file extension from a path
 */
const getExtension = (path: string): string => {
  const lastDotIndex = path.lastIndexOf(".");
  return lastDotIndex !== -1 ? path.substring(lastDotIndex).toLowerCase() : "";
};

/**
 * Applies security headers to the response
 */
const setSecurityHeaders = (headers: Headers): void => {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });
};

/**
 * Sets the appropriate Content-Type based on file extension
 */
const setContentType = (headers: Headers, path: string): void => {
  const extension = getExtension(path);
  const mimeType = MIME_TYPES.get(extension);
  if (mimeType) {
    headers.set("Content-Type", mimeType);
  }
};

/**
 * Sets appropriate cache control headers based on resource type
 */
const setCacheControl = (headers: Headers, path: string): void => {
  if (isProtectedRoute(path)) {
    headers.set("Cache-Control", "no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
  } else {
    const extension = getExtension(path);
    if (CACHEABLE_EXTENSIONS.has(extension)) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
  }
};

/**
 * Calculates and sets an ETag header for the response
 */
const setETag = (headers: Headers, path: string): void => {
  const extension = getExtension(path);
  if (extension === ".css" || extension === ".js") {
    // Use cached ETag if available
    if (!etagCache.has(path)) {
      const hash = encodeHex(md5(path));
      etagCache.set(path, `"${hash}"`);
    }
    headers.set("ETag", etagCache.get(path)!);
  }
};

/**
 * Sets CORS headers if the origin is allowed
 */
const setCorsHeaders = (headers: Headers, method: string, origin: string | null): void => {
  if (!origin) return;

  const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];
  if (!allowedOrigins.includes(origin)) return;

  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");

  if (method === "OPTIONS") {
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      [
        "Content-Type",
        "Authorization",
        "X-CSRF-Token",
        "X-Requested-With",
      ].join(", "),
    );
    headers.set("Access-Control-Max-Age", "86400"); // 24 hours
  }

  headers.append("Vary", "Origin");
};

/**
 * Removes any X-Powered-By headers to reduce information disclosure
 */
const deleteXPowerBy = (headers: Headers): void => {
  headers.delete("X-Powered-By");
};

/**
 * Applies all security and content-related headers
 */
const applyHeaders = (headers: Headers, path: string, method: string, origin: string | null): void => {
  setSecurityHeaders(headers);
  setCacheControl(headers, path);
  setETag(headers, path);
  setContentType(headers, path);
  setCorsHeaders(headers, method, origin);
  deleteXPowerBy(headers);
};

/**
 * Fresh middleware that applies security headers and content type information
 */
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
