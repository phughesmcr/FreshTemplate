import type { FreshContext } from "$fresh/server.ts";
import { getCookies, setCookie } from "$std/http/cookie.ts";
import { encodeBase64 } from "@std/encoding";
import { PROTECTED_ROUTES } from "lib/middlewares/protectedRoutes.ts";
import type { ServerState } from "lib/middlewares/state.ts";
import { CSRF } from "lib/constants.ts";

const SAFE_METHODS = CSRF.CONFIG.safeMethods;
type SafeMethod = typeof SAFE_METHODS[number];

export interface CSRFConfig {
  /** HTTP header name for CSRF token */
  tokenName: string;
  /** Cookie name for storing CSRF token */
  cookieName: string;
  /** Hashing algorithm to use */
  digest: string;
  /** HTTP methods that don't require CSRF protection */
  safeMethods: readonly string[];
  /** Token lifetime in seconds */
  maxAge: number;
  /** Length of random token buffer in bytes */
  tokenLength: number;
  /** Only refresh token when it reaches this percentage of its lifetime (0.0-1.0) */
  refreshThreshold: number;
  /** Routes that are exempt from CSRF protection even if they're in protected routes */
  exemptRoutes: readonly string[];
}

const DEFAULT_CONFIG: CSRFConfig = CSRF.CONFIG;

/**
 * CSRF Token Manager handles token generation, validation and refresh
 */
class CSRFTokenManager {
  private config: CSRFConfig;

  constructor(config: CSRFConfig) {
    this.config = config;
  }

  /**
   * Generates a new CSRF token with timestamp and a masked version for client-side use
   */
  public async generateToken(): Promise<{ token: string; maskedToken: string }> {
    const timestamp = Date.now().toString();
    try {
      // Generate random bytes and hash them
      const buffer = crypto.getRandomValues(new Uint8Array(this.config.tokenLength));
      const hashBuffer = await crypto.subtle.digest(this.config.digest, buffer);
      const token = `${timestamp}.${encodeBase64(new Uint8Array(hashBuffer))}`;

      // Create a masked version for client-side use (double-submit pattern)
      const maskedBuffer = await crypto.subtle.digest(
        this.config.digest,
        new TextEncoder().encode(token),
      );
      const maskedToken = encodeBase64(new Uint8Array(maskedBuffer));

      return { token, maskedToken };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate CSRF token: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Checks if a token should be regenerated based on its age
   */
  public shouldRegenerateToken(token: string): boolean {
    try {
      const parts = token.split(".");
      if (parts.length !== 2) return true;

      const tokenAge = Date.now() - parseInt(parts[0], 10);
      const maxTokenAge = this.config.maxAge * 1000;

      // Only regenerate if token has exceeded the refresh threshold
      return tokenAge > maxTokenAge * this.config.refreshThreshold;
    } catch {
      // If we can't parse the token, generate a new one
      return true;
    }
  }

  /**
   * Performs a timing-safe comparison of two strings
   */
  public timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);
    for (let i = 0; i < a.length; i++) {
      result |= aBytes[i] ^ bBytes[i];
    }
    return result === 0;
  }

  /**
   * Extracts CSRF token from request (header or form data)
   */
  public async getToken(req: Request): Promise<string | null> {
    const headerToken = req.headers.get(this.config.tokenName);
    if (headerToken) return headerToken;

    if (this.isUnsafeMethod(req.method)) {
      const clonedReq = req.clone();
      try {
        const form = await clonedReq.formData();
        const formToken = form.get("csrf_token")?.toString();
        if (formToken) return formToken;

        // Also check for token in JSON body for API requests
        try {
          const jsonBody = await req.clone().json();
          return jsonBody.csrf_token || null;
        } catch {
          // Not JSON or doesn't have token
          return null;
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Checks if the HTTP method is considered "safe" (doesn't need CSRF protection)
   */
  public isSafeMethod(method: string): boolean {
    return this.config.safeMethods.includes(method.toUpperCase() as SafeMethod);
  }

  /**
   * Checks if the HTTP method is considered "unsafe" (needs CSRF protection)
   */
  public isUnsafeMethod(method: string): boolean {
    return !this.isSafeMethod(method);
  }

  /**
   * Validates that request origin matches the host
   */
  public validateOrigin(req: Request, host: string): boolean {
    const origin = req.headers.get("Origin");
    const referer = req.headers.get("Referer");

    // Some older browsers don't send these headers for same-origin requests
    if (!origin && !referer) {
      return true;
    }

    if (origin) {
      try {
        const originUrl = new URL(origin);
        return originUrl.host === host;
      } catch {
        return false;
      }
    }

    if (referer) {
      try {
        const refererUrl = new URL(referer);
        return refererUrl.host === host;
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Checks if the route is exempt from CSRF protection
   */
  public isExemptRoute(pathname: string): boolean {
    return this.config.exemptRoutes.some((route) => pathname.startsWith(route));
  }

  /**
   * Checks if the route requires CSRF protection
   */
  public requiresProtection(pathname: string): boolean {
    return PROTECTED_ROUTES.some((route) => pathname.startsWith(route)) &&
      !this.isExemptRoute(pathname);
  }

  /**
   * Validates the CSRF token from the request against the cookie token
   */
  public async validateRequest(
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

  /**
   * Checks if token needs to be refreshed and generates a new one if needed
   */
  public async refreshToken(
    cookieToken: string | undefined,
  ): Promise<{ token: string; maskedToken: string; shouldRefresh: boolean }> {
    const shouldRefresh = !cookieToken || this.shouldRegenerateToken(cookieToken);

    if (shouldRefresh) {
      const { token, maskedToken } = await this.generateToken();
      return { token, maskedToken, shouldRefresh: true };
    }

    // If no refresh needed, generate a masked token from the existing one
    try {
      const maskedBuffer = await crypto.subtle.digest(
        this.config.digest,
        new TextEncoder().encode(cookieToken),
      );
      const maskedToken = encodeBase64(new Uint8Array(maskedBuffer));
      return { token: cookieToken, maskedToken, shouldRefresh: false };
    } catch {
      // If generating masked token fails, create a new token pair
      const { token, maskedToken } = await this.generateToken();
      return { token, maskedToken, shouldRefresh: true };
    }
  }
}

/**
 * Creates a CSRF middleware with customizable configuration
 */
export function createCsrfMiddleware(config?: Partial<CSRFConfig>) {
  const csrfConfig: CSRFConfig = { ...DEFAULT_CONFIG, ...config };
  const tokenManager = new CSRFTokenManager(csrfConfig);

  return async function csrfMiddleware(
    req: Request,
    ctx: FreshContext<ServerState>,
  ): Promise<Response> {
    if (!ctx.destination) return ctx.next();

    try {
      const url = new URL(req.url);
      const cookies = getCookies(req.headers);
      const cookieToken = cookies[csrfConfig.cookieName];

      // Validate for unsafe methods on protected routes
      if (
        tokenManager.isUnsafeMethod(req.method) &&
        tokenManager.requiresProtection(url.pathname)
      ) {
        // Origin validation (adds protection against CORS-based attacks)
        if (!tokenManager.validateOrigin(req, url.host)) {
          return new Response(
            JSON.stringify({ error: "Invalid request origin" }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Token validation
        const { isValid, error } = await tokenManager.validateRequest(req, cookieToken);
        if (!isValid) {
          return new Response(
            JSON.stringify({ error }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      }

      // Refresh token if needed and prepare response
      const { token, maskedToken, shouldRefresh } = await tokenManager.refreshToken(cookieToken);
      const response = await ctx.next();

      // Create a clone to modify headers
      const headers = new Headers(response.headers);

      // Add no-cache headers for unsafe methods
      if (tokenManager.isUnsafeMethod(req.method)) {
        headers.set("Cache-Control", "no-store, max-age=0");
        headers.set("Pragma", "no-cache");
        headers.set("Expires", "0");
      }

      // Set cookie if token needs refresh
      if (shouldRefresh) {
        setCookie(headers, {
          name: csrfConfig.cookieName,
          value: token,
          maxAge: csrfConfig.maxAge,
          httpOnly: true,
          secure: true,
          sameSite: "Strict",
          path: "/",
        });
      }

      // Add token header for JavaScript to use (masked version)
      headers.set(csrfConfig.tokenName, maskedToken);

      // Return the updated response
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error("CSRF middleware error:", error);
      if (error instanceof Error) {
        return new Response(
          JSON.stringify({ error: `CSRF middleware error: ${error.message}` }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response(
        JSON.stringify({ error: "CSRF middleware error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  };
}

// Export middleware with default configuration
export default createCsrfMiddleware();
