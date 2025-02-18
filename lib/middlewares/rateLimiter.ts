import type { FreshContext } from "$fresh/server.ts";
import type { ServerState } from "./state.ts";

interface RateLimitConfig {
  readonly WINDOW_SIZE: number;
  readonly MAX_REQUESTS: number;
  readonly MAX_BLOCKED_TIME: number;
  readonly BLOCK_THRESHOLD: number;
  readonly CLEANUP_INTERVAL: number;
}

// Load configuration from environment with validation
const config: RateLimitConfig = {
  WINDOW_SIZE: Math.max(1, parseInt(Deno.env.get("RATE_LIMIT_WINDOW_SIZE") || "60000")),
  MAX_REQUESTS: Math.max(1, parseInt(Deno.env.get("RATE_LIMIT_MAX_REQUESTS") || "250")),
  MAX_BLOCKED_TIME: Math.max(1, parseInt(Deno.env.get("RATE_LIMIT_MAX_BLOCKED_TIME") || "1800000")),
  BLOCK_THRESHOLD: Math.max(1, parseInt(Deno.env.get("RATE_LIMIT_BLOCK_THRESHOLD") || "5")),
  CLEANUP_INTERVAL: Math.max(1, parseInt(Deno.env.get("RATE_LIMIT_CLEANUP_INTERVAL") || "300000")),
} as const;

interface RateLimitEntry {
  readonly bucket: number;
  readonly lastRequest: number;
  readonly violations: number;
  readonly blockedUntil: number;
}

class RateLimiter {
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly cleanupInterval: number;

  constructor(config: RateLimitConfig) {
    this.cleanupInterval = config.CLEANUP_INTERVAL;
    this.startCleanup();
  }

  private startCleanup(): void {
    setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [ip, entry] of this.store.entries()) {
      if (now - entry.lastRequest > config.WINDOW_SIZE * 2) {
        this.store.delete(ip);
      }
    }
  }

  private updateBucket(entry: RateLimitEntry, now: number): RateLimitEntry {
    const timePassed = now - entry.lastRequest;
    const tokensToAdd = (timePassed / config.WINDOW_SIZE) * config.MAX_REQUESTS;
    return {
      ...entry,
      bucket: Math.min(config.MAX_REQUESTS, entry.bucket + tokensToAdd),
      lastRequest: now,
    };
  }

  public checkRateLimit(ip: string): {
    isAllowed: boolean;
    headers: Headers;
    status?: number;
    error?: string;
  } {
    const now = Date.now();
    const headers = new Headers();

    let entry = this.store.get(ip);
    if (!entry) {
      entry = {
        bucket: config.MAX_REQUESTS,
        lastRequest: now,
        violations: 0,
        blockedUntil: 0,
      };
      this.store.set(ip, entry);
    }

    entry = this.updateBucket(entry, now);

    if (now < entry.blockedUntil) {
      headers.set("X-RateLimit-Limit", config.MAX_REQUESTS.toString());
      headers.set("X-RateLimit-Remaining", "0");
      headers.set("X-RateLimit-Reset", entry.blockedUntil.toString());
      return {
        isAllowed: false,
        headers,
        status: 403,
        error: "IP blocked due to repeated rate limit violations.",
      };
    }

    if (entry.bucket < 1) {
      const newViolations = entry.violations + 1;
      if (newViolations >= config.BLOCK_THRESHOLD) {
        const blockedUntil = now + config.MAX_BLOCKED_TIME;
        this.store.set(ip, { ...entry, violations: 0, blockedUntil });

        headers.set("X-RateLimit-Limit", config.MAX_REQUESTS.toString());
        headers.set("X-RateLimit-Remaining", "0");
        headers.set("X-RateLimit-Reset", blockedUntil.toString());
        return {
          isAllowed: false,
          headers,
          status: 403,
          error: "IP blocked due to repeated rate limit violations.",
        };
      }

      const retryAfter = Math.ceil((1 - entry.bucket) * (config.WINDOW_SIZE / config.MAX_REQUESTS) / 1000);
      this.store.set(ip, { ...entry, violations: newViolations });

      headers.set("X-RateLimit-Limit", config.MAX_REQUESTS.toString());
      headers.set("X-RateLimit-Remaining", "0");
      headers.set("X-RateLimit-Reset", (now + retryAfter * 1000).toString());
      headers.set("Retry-After", retryAfter.toString());
      return {
        isAllowed: false,
        headers,
        status: 429,
        error: "Rate limit exceeded. Please try again later.",
      };
    }

    this.store.set(ip, {
      ...entry,
      bucket: Math.max(0, entry.bucket - 1),
      violations: Math.max(0, entry.violations - 1),
    });

    headers.set("X-RateLimit-Limit", config.MAX_REQUESTS.toString());
    headers.set("X-RateLimit-Remaining", Math.floor(entry.bucket - 1).toString());
    headers.set("X-RateLimit-Reset", (now + config.WINDOW_SIZE).toString());
    return { isAllowed: true, headers };
  }
}

const rateLimiter = new RateLimiter(config);

export default async function rateLimiterMiddleware(
  req: Request,
  ctx: FreshContext<ServerState>,
): Promise<Response> {
  if (!ctx.destination) return ctx.next();

  const ip = req.headers.get("x-forwarded-for") || ctx.remoteAddr.hostname;
  if (!ip) {
    return new Response("IP address not found", { status: 403 });
  }

  const { isAllowed, headers, status, error } = rateLimiter.checkRateLimit(ip);
  if (!isAllowed) {
    return new Response(
      JSON.stringify({ error }),
      {
        status: status!,
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
      },
    );
  }

  const response = await ctx.next();
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}
