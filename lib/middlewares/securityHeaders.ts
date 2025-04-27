import type { FreshContext } from "$fresh/server.ts";
import { encodeHex } from "@std/encoding/hex";
import { md5 } from "@takker/md5";
import { MimeTypes, Security } from "lib/constants.ts";
import { isProtectedRoute } from "lib/middlewares/protectedRoutes.ts";
import type { ServerState } from "lib/middlewares/state.ts";

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
  // Using CSP directives from constants file
  "Content-Security-Policy": Security.CSP_DIRECTIVES.join("; "),
  // Using common headers from constants file
  ...Security.COMMON_HEADERS,
  // Permissions policy is long and complex - keeping it inline for now
  "Permissions-Policy": [
    // Sensors and device access
    "accelerometer=()",
    "ambient-light-sensor=()",
    "battery=()",
    "camera=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=()",
    "midi=()",
    "payment=()",
    "usb=()",
    // Geolocation and positioning
    "geolocation=()",
    // Device info
    "display-capture=()",
    "document-domain=()",
    // Various features
    "encrypted-media=()",
    "fullscreen=(self)",
    "gamepad=()",
    "hid=()",
    "idle-detection=()",
    "interest-cohort=()",
    "picture-in-picture=(self)",
    "publickey-credentials-get=()",
    "screen-wake-lock=()",
    "serial=()",
    "sync-xhr=()",
    "web-share=(self)",
    "xr-spatial-tracking=()",
  ].join(", "),
};

/**
 * Cache for ETag values to avoid recalculating
 */
const etagCache = new Map<string, string>();

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
  const mimeType = MimeTypes.MAP.get(extension);
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
    if (MimeTypes.CACHEABLE_EXTENSIONS.has(extension)) {
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
