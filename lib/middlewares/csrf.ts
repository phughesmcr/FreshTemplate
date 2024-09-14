import { FreshContext } from "$fresh/server.ts";
import { getCookies, setCookie } from "$std/http/cookie.ts";

const CSRF_TOKEN_NAME = "X-CSRF-Token";
const CSRF_COOKIE_NAME = "csrf_token";
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];
const MAX_AGE = 3600; // 1 hour in seconds
const TOKEN_LENGTH = 32;

async function generateToken(): Promise<string> {
  try {
    const buffer = new Uint8Array(TOKEN_LENGTH);
    crypto.getRandomValues(buffer);
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "")
      .slice(0, TOKEN_LENGTH);
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

function isTokenExpired(token: string): boolean {
  const [, timestamp] = token.split(".");
  if (!timestamp) return true;
  const tokenAge = Date.now() - parseInt(timestamp, 10);
  return tokenAge > MAX_AGE * 1000;
}

export default async function handler(req: Request, ctx: FreshContext) {
  try {
    const url = new URL(req.url);

    if (SAFE_METHODS.includes(req.method) || url.pathname.startsWith("/api/")) {
      return await ctx.next();
    }

    const cookies = getCookies(req.headers);
    const cookieToken = cookies[CSRF_COOKIE_NAME];
    const headerToken = req.headers.get(CSRF_TOKEN_NAME);

    if (!cookieToken || !headerToken) {
      console.warn(`CSRF token missing: cookie=${!!cookieToken}, header=${!!headerToken}`);
      return new Response("CSRF token missing", { status: 403 });
    }

    if (isTokenExpired(cookieToken)) {
      console.warn("CSRF token expired");
      return new Response("CSRF token expired", { status: 403 });
    }

    if (!timingSafeEqual(cookieToken, headerToken)) {
      console.warn("CSRF token mismatch");
      return new Response("CSRF token validation failed", { status: 403 });
    }

    const response = await ctx.next();
    const updatedResponse = new Response(response.body, response);
    const newToken = await generateToken();
    setCookie(updatedResponse.headers, {
      name: CSRF_COOKIE_NAME,
      value: newToken,
      maxAge: MAX_AGE,
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      path: "/",
    });

    updatedResponse.headers.set(CSRF_TOKEN_NAME, newToken);

    return updatedResponse;
  } catch (error) {
    console.error("CSRF middleware error:", error);
    return new Response("CSRF middleware error", { status: 500 });
  }
}
