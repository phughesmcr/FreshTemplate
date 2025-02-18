import type { FreshContext } from "$fresh/server.ts";
import { getCookies, setCookie } from "$std/http/cookie.ts";
import { encodeBase64 } from "@std/encoding";
import { PROTECTED_ROUTES } from "lib/middlewares/protectedRoutes.ts";
import type { ServerState } from "./state.ts";

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"] as const;
type SafeMethod = typeof SAFE_METHODS[number];

const CSRF_CONFIG = {
  TOKEN_NAME: "X-CSRF-Token",
  COOKIE_NAME: "csrf_token",
  DIGEST: "SHA-256",
  SAFE_METHODS,
  MAX_AGE: 3600, // 1 hour in seconds
  TOKEN_LENGTH: 32,
} as const;

class CSRFTokenManager {
  private static async generateToken(): Promise<string> {
    const timestamp = Date.now().toString();
    try {
      const buffer = crypto.getRandomValues(new Uint8Array(CSRF_CONFIG.TOKEN_LENGTH));
      const hashBuffer = await crypto.subtle.digest(CSRF_CONFIG.DIGEST, buffer);
      return `${timestamp}.${encodeBase64(new Uint8Array(hashBuffer))}`;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate CSRF token: ${error.message}`);
      }
      throw error;
    }
  }

  private static shouldRegenerateToken(token: string): boolean {
    const tokenAge = Date.now() - parseInt(token.split(".")[0], 10);
    return tokenAge > (CSRF_CONFIG.MAX_AGE * 1000) / 2;
  }

  private static timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);
    for (let i = 0; i < a.length; i++) {
      result |= aBytes[i] ^ bBytes[i];
    }
    return result === 0;
  }

  private static async getToken(req: Request): Promise<string | null> {
    const headerToken = req.headers.get(CSRF_CONFIG.TOKEN_NAME);
    if (headerToken) return headerToken;

    if (req.method === "POST" || req.method === "PUT" || req.method === "DELETE") {
      const clonedReq = req.clone();
      try {
        const form = await clonedReq.formData();
        return form.get("csrf_token")?.toString() || null;
      } catch {
        return null;
      }
    }
    return null;
  }

  public static isSafeMethod(method: string): boolean {
    return SAFE_METHODS.includes(method.toUpperCase() as SafeMethod) || false;
  }

  public static async validateRequest(
    req: Request,
    cookieToken: string | undefined,
  ): Promise<{ isValid: boolean; error?: string }> {
    const csrfToken = await this.getToken(req);
    if (!csrfToken || !cookieToken) {
      return { isValid: false, error: "Missing CSRF token" };
    }
    const isValid = this.timingSafeEqual(cookieToken, csrfToken);
    return {
      isValid,
      ...(isValid ? {} : { error: "Invalid CSRF token" }),
    };
  }

  public static async refreshToken(
    cookieToken: string | undefined,
  ): Promise<{ token: string; shouldRefresh: boolean }> {
    const shouldRefresh = !cookieToken || this.shouldRegenerateToken(cookieToken);
    return {
      token: shouldRefresh ? await this.generateToken() : cookieToken!,
      shouldRefresh,
    };
  }
}

export default async function csrfMiddleware(
  req: Request,
  ctx: FreshContext<ServerState>,
): Promise<Response> {
  if (!ctx.destination) return ctx.next();
  try {
    const url = new URL(req.url);
    const cookies = getCookies(req.headers);
    const cookieToken = cookies[CSRF_CONFIG.COOKIE_NAME];

    // Only validate CSRF token for non-safe methods on protected routes
    if (
      !CSRFTokenManager.isSafeMethod(req.method) &&
      PROTECTED_ROUTES.some((route) => url.pathname.startsWith(route))
    ) {
      const { isValid, error } = await CSRFTokenManager.validateRequest(req, cookieToken);
      if (!isValid) {
        return new Response(error, { status: 403 });
      }
    }

    const { token, shouldRefresh } = await CSRFTokenManager.refreshToken(cookieToken);
    const response = await ctx.next();
    const clonedResponse = response.clone();
    const updatedResponse = new Response(clonedResponse.body, clonedResponse);

    if (shouldRefresh) {
      setCookie(updatedResponse.headers, {
        name: CSRF_CONFIG.COOKIE_NAME,
        value: token,
        maxAge: CSRF_CONFIG.MAX_AGE,
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
        path: "/",
      });
    }

    updatedResponse.headers.set(CSRF_CONFIG.TOKEN_NAME, token);
    return updatedResponse;
  } catch (error) {
    if (error instanceof Error) {
      return new Response(`CSRF middleware error: ${error.message}`, { status: 500 });
    }
    return new Response("CSRF middleware error", { status: 500 });
  }
}
