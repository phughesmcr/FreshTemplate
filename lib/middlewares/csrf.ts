import type { FreshContext } from "$fresh/server.ts";
import { getCookies, setCookie } from "$std/http/cookie.ts";
import { encodeBase64 } from "@std/encoding";
import { PROTECTED_ROUTES } from "lib/middlewares/protectedRoutes.ts";
import type { ServerState } from "./state.ts";

const CSRF_TOKEN_NAME = "X-CSRF-Token";
const CSRF_COOKIE_NAME = "csrf_token";
const DIGEST = "SHA-256";
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];
const MAX_AGE = 3600; // 1 hour in seconds
const TOKEN_LENGTH = 32;

function shouldRegenerateToken(token: string): boolean {
  const tokenAge = Date.now() - parseInt(token.split(".")[0], 10);
  return tokenAge > (MAX_AGE * 1000) / 2; // Regenerate after half the max age
}

async function generateToken(): Promise<string> {
  const timestamp = Date.now().toString();
  try {
    const buffer = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH));
    const hashBuffer = await crypto.subtle.digest(DIGEST, buffer);
    return `${timestamp}.${encodeBase64(new Uint8Array(hashBuffer))}`;
  } catch (error) {
    console.error("Error generating CSRF token:", error);
    throw new Error("Failed to generate CSRF token");
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  for (let i = 0; i < a.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

async function getToken(req: Request): Promise<string | null> {
  const headerToken = req.headers.get(CSRF_TOKEN_NAME);
  if (headerToken) return headerToken;

  if (req.method === "POST" || req.method === "PUT" || req.method === "DELETE") {
    const clonedReq = req.clone(); // Clone the request to avoid consuming the original body
    const form = await clonedReq.formData();
    return form.get("csrf_token")?.toString() || null;
  }
  return null;
}

export default async function CSRF(req: Request, ctx: FreshContext<ServerState>) {
  if (!ctx.destination) return await ctx.next();
  try {
    const url = new URL(req.url);
    const cookies = getCookies(req.headers);
    let cookieToken = cookies[CSRF_COOKIE_NAME];

    // Only validate CSRF token for non-safe methods on protected routes
    if (
      !SAFE_METHODS.includes(req.method) && PROTECTED_ROUTES.includes(url.pathname as typeof PROTECTED_ROUTES[number])
    ) {
      const csrfToken = await getToken(req);
      if (!csrfToken || !cookieToken || !timingSafeEqual(cookieToken, csrfToken)) {
        return new Response("CSRF validation failed", { status: 403 });
      }
    }

    // Decide whether to regenerate the token
    if (!cookieToken || (cookieToken && shouldRegenerateToken(cookieToken))) {
      cookieToken = await generateToken();
    }

    const response = await ctx.next();
    const clonedResponse = response.clone();
    const updatedResponse = new Response(clonedResponse.body, clonedResponse);

    // Always set/update the CSRF cookie
    setCookie(updatedResponse.headers, {
      name: CSRF_COOKIE_NAME,
      value: cookieToken,
      maxAge: MAX_AGE,
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      path: "/",
    });

    // Set the CSRF token in the response header for client-side access
    updatedResponse.headers.set(CSRF_TOKEN_NAME, cookieToken);

    return updatedResponse;
  } catch (error) {
    console.error("CSRF middleware error:", error);
    return new Response("CSRF middleware error", { status: 500 });
  }
}
