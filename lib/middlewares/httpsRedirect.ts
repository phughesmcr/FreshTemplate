import type { FreshContext } from "$fresh/server.ts";
import type { ServerState } from "lib/middlewares/state.ts";
import { HttpsRedirect } from "lib/constants.ts";

export interface HttpsRedirectOptions {
  /** Enable/disable the redirect */
  enabled?: boolean;
  /** Use 308 (permanent) or 307 (temporary) redirect */
  permanent?: boolean;
  /** Additional hostnames to exclude from redirect */
  excludedHosts?: string[];
  /** Environment values that indicate development mode */
  devEnvironments?: string[];
}

/**
 * Creates an HTTPS redirect middleware with configurable options
 */
export function createHttpsRedirect(options?: HttpsRedirectOptions) {
  const config = {
    enabled: HttpsRedirect.ENABLED,
    permanent: HttpsRedirect.PERMANENT,
    excludedHosts: HttpsRedirect.EXCLUDED_HOSTS,
    devEnvironments: HttpsRedirect.DEV_ENVIRONMENTS,
    ...options,
  };

  return async function httpsRedirect(
    req: Request,
    ctx: FreshContext<ServerState>,
  ): Promise<Response> {
    if (!ctx.destination || !config.enabled) return ctx.next();

    try {
      // Check X-Forwarded-Proto from proxies first
      const forwardedProto = req.headers.get("x-forwarded-proto");
      if (forwardedProto === "https") {
        return await ctx.next();
      }

      const url = new URL(req.url);

      // Skip redirect for excluded hosts
      const isExcludedHost = config.excludedHosts.includes(url.hostname);

      // Check environment
      const currentEnv = Deno.env.get("DENO_ENV") || "";
      const isDev = config.devEnvironments.includes(currentEnv.toLowerCase());

      if (url.protocol === "http:" && !isExcludedHost && !isDev) {
        url.protocol = "https:";

        return new Response(null, {
          status: config.permanent ? HttpsRedirect.STATUS_CODES.PERMANENT : HttpsRedirect.STATUS_CODES.TEMPORARY,
          headers: {
            "Location": url.toString(),
            "Cache-Control": config.permanent ? "max-age=63072000" : "no-cache",
            "X-Redirected-By": "HTTPS Enforcer",
          },
        });
      }

      return await ctx.next();
    } catch (error) {
      console.error("[HTTPS Redirect] Error:", error);
      return await ctx.next();
    }
  };
}

// Export a middleware with default options for easy usage
export default createHttpsRedirect();
