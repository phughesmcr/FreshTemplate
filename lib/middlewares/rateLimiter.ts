import type { FreshContext } from "$fresh/server.ts";
import { HttpStatus, RateLimit } from "lib/constants.ts";
import type { ServerState } from "lib/middlewares/state.ts";

interface RateLimitEntry {
  readonly bucket: number;
  readonly lastRequest: number;
  readonly violations: number;
  readonly blockedUntil: number;
}

class RateLimiter {
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly cleanupInterval: number;

  constructor() {
    this.cleanupInterval = RateLimit.CLEANUP_INTERVAL;
    this.startCleanup();
  }

  private startCleanup(): void {
    setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [ip, entry] of this.store.entries()) {
      if (now - entry.lastRequest > RateLimit.WINDOW_SIZE * 2) {
        this.store.delete(ip);
      }
    }
  }

  private updateBucket(entry: RateLimitEntry, now: number): RateLimitEntry {
    const timePassed = now - entry.lastRequest;
    const tokensToAdd = (timePassed / RateLimit.WINDOW_SIZE) * RateLimit.MAX_REQUESTS;
    return {
      ...entry,
      bucket: Math.min(RateLimit.MAX_REQUESTS, entry.bucket + tokensToAdd),
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
        bucket: RateLimit.MAX_REQUESTS,
        lastRequest: now,
        violations: 0,
        blockedUntil: 0,
      };
      this.store.set(ip, entry);
    }

    entry = this.updateBucket(entry, now);

    if (now < entry.blockedUntil) {
      headers.set("X-RateLimit-Limit", RateLimit.MAX_REQUESTS.toString());
      headers.set("X-RateLimit-Remaining", "0");
      headers.set("X-RateLimit-Reset", entry.blockedUntil.toString());
      return {
        isAllowed: false,
        headers,
        status: HttpStatus.FORBIDDEN,
        error: "IP blocked due to repeated rate limit violations.",
      };
    }

    if (entry.bucket < 1) {
      const newViolations = entry.violations + 1;
      if (newViolations >= RateLimit.BLOCK_THRESHOLD) {
        const blockedUntil = now + RateLimit.MAX_BLOCKED_TIME;
        this.store.set(ip, { ...entry, violations: 0, blockedUntil });

        headers.set("X-RateLimit-Limit", RateLimit.MAX_REQUESTS.toString());
        headers.set("X-RateLimit-Remaining", "0");
        headers.set("X-RateLimit-Reset", blockedUntil.toString());
        return {
          isAllowed: false,
          headers,
          status: HttpStatus.FORBIDDEN,
          error: "IP blocked due to repeated rate limit violations.",
        };
      }

      const retryAfter = Math.ceil((1 - entry.bucket) * (RateLimit.WINDOW_SIZE / RateLimit.MAX_REQUESTS) / 1000);
      this.store.set(ip, { ...entry, violations: newViolations });

      headers.set("X-RateLimit-Limit", RateLimit.MAX_REQUESTS.toString());
      headers.set("X-RateLimit-Remaining", "0");
      headers.set("X-RateLimit-Reset", (now + retryAfter * 1000).toString());
      headers.set("Retry-After", retryAfter.toString());
      return {
        isAllowed: false,
        headers,
        status: HttpStatus.TOO_MANY_REQUESTS,
        error: "Rate limit exceeded. Please try again later.",
      };
    }

    this.store.set(ip, {
      ...entry,
      bucket: Math.max(0, entry.bucket - 1),
      violations: Math.max(0, entry.violations - 1),
    });

    headers.set("X-RateLimit-Limit", RateLimit.MAX_REQUESTS.toString());
    headers.set("X-RateLimit-Remaining", Math.floor(entry.bucket - 1).toString());
    headers.set("X-RateLimit-Reset", (now + RateLimit.WINDOW_SIZE).toString());
    return { isAllowed: true, headers };
  }
}

const rateLimiter = new RateLimiter();

export default async function rateLimiterMiddleware(
  req: Request,
  ctx: FreshContext<ServerState>,
): Promise<Response> {
  if (!ctx.destination) return ctx.next();

  const ip = req.headers.get("x-forwarded-for") || ctx.remoteAddr.hostname;
  if (!ip) {
    return new Response("IP address not found", { status: HttpStatus.FORBIDDEN });
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
