import type { FreshContext } from "$fresh/server.ts";
import type { ServerState } from "lib/middlewares/state.ts";
import { HttpStatus, Timeout } from "lib/constants.ts";

export interface TimeoutOptions {
  /** Default timeout in milliseconds */
  defaultTimeout?: number;
  /** Custom timeouts for specific route patterns (in milliseconds) */
  routeTimeouts?: Record<string, number>;
  /** Routes that should be exempt from timeout */
  excludedRoutes?: string[];
  /** Whether to include additional details in timeout responses */
  detailedErrors?: boolean;
  /** Custom timeout response handler */
  customTimeoutHandler?: (req: Request, ctx: FreshContext<ServerState>, timeoutMs: number) => Response;
}

const DEFAULT_OPTIONS: TimeoutOptions = {
  defaultTimeout: Timeout.DEFAULT_TIMEOUT,
  routeTimeouts: Timeout.ROUTE_TIMEOUTS,
  excludedRoutes: Timeout.EXCLUDED_ROUTES,
  detailedErrors: false,
};

/**
 * Creates a timeout middleware for Fresh applications
 * Automatically aborts requests that exceed their timeout threshold
 */
export function createTimeoutMiddleware(options?: TimeoutOptions) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async function timeoutMiddleware(
    req: Request,
    ctx: FreshContext<ServerState>,
  ): Promise<Response> {
    if (!ctx.destination) return ctx.next();

    const url = new URL(req.url);
    const path = url.pathname;

    // Skip timeout for excluded routes
    if (config.excludedRoutes?.some((route) => path.startsWith(route))) {
      return ctx.next();
    }

    // Determine appropriate timeout for this route
    let timeoutMs = config.defaultTimeout || Timeout.DEFAULT_TIMEOUT;

    if (config.routeTimeouts) {
      for (const [routePrefix, routeTimeout] of Object.entries(config.routeTimeouts)) {
        if (path.startsWith(routePrefix)) {
          timeoutMs = routeTimeout;
          break;
        }
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await Promise.race([
        ctx.next(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error(`Request timeout after ${timeoutMs}ms`)));
        }),
      ]);

      clearTimeout(timeoutId);
      return res as Response;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Request timeout")) {
        console.warn(`[TIMEOUT] ${req.method} ${path} exceeded ${timeoutMs}ms timeout`);

        if (config.customTimeoutHandler) {
          return config.customTimeoutHandler(req, ctx, timeoutMs);
        }

        const statusText = "Request Timeout";
        const body = config.detailedErrors
          ? JSON.stringify({
            error: statusText,
            path,
            method: req.method,
            timeoutMs,
            timestamp: new Date().toISOString(),
            message: `The request to ${path} exceeded the ${timeoutMs}ms timeout limit.`,
          })
          : statusText;

        const headers = new Headers({
          "Content-Type": config.detailedErrors ? "application/json" : "text/plain",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        });

        return new Response(body, { status: HttpStatus.REQUEST_TIMEOUT, statusText, headers });
      }

      throw error;
    }
  };
}

// Export a middleware with default options for easy usage
export default createTimeoutMiddleware();
