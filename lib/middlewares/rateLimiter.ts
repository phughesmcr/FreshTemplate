import type { FreshContext } from "$fresh/server.ts";
import type { ServerState } from "./state.ts";

// Add type for environment variables
interface EnvConfig {
  WINDOW_SIZE: number;
  MAX_REQUESTS: number;
  MAX_BLOCKED_TIME: number;
  BLOCK_THRESHOLD: number;
}

// Load configuration from environment
const config: EnvConfig = {
  WINDOW_SIZE: Math.max(1, parseInt(Deno.env.get("RATE_LIMIT_WINDOW_SIZE") || "60000")),
  MAX_REQUESTS: Math.max(1, parseInt(Deno.env.get("RATE_LIMIT_MAX_REQUESTS") || "250")),
  MAX_BLOCKED_TIME: Math.max(1, parseInt(Deno.env.get("RATE_LIMIT_MAX_BLOCKED_TIME") || "1800000")),
  BLOCK_THRESHOLD: Math.max(1, parseInt(Deno.env.get("RATE_LIMIT_BLOCK_THRESHOLD") || "5")),
};

interface RateLimitEntry {
  bucket: number;
  lastRequest: number;
  violations: number;
  blockedUntil: number;
}

const store = new Map<string, RateLimitEntry>();

function updateBucket(entry: RateLimitEntry, now: number): void {
  const timePassed = now - entry.lastRequest;
  const tokensToAdd = (timePassed / config.WINDOW_SIZE) * config.MAX_REQUESTS;
  entry.bucket = Math.min(config.MAX_REQUESTS, entry.bucket + tokensToAdd);
  entry.lastRequest = now;
}

export default async function rateLimiter(req: Request, ctx: FreshContext<ServerState>) {
  if (!ctx.destination) return ctx.next();
  const ip = req.headers.get("x-forwarded-for") || ctx.remoteAddr.hostname;
  if (!ip) {
    return new Response("IP address not found", { status: 403 });
  }
  const now = Date.now();

  let entry = store.get(ip);
  if (!entry) {
    entry = { bucket: config.MAX_REQUESTS, lastRequest: now, violations: 0, blockedUntil: 0 };
    store.set(ip, entry);
  }

  updateBucket(entry, now);

  if (now < entry.blockedUntil) {
    return new Response(
      JSON.stringify({ error: "IP blocked due to repeated rate limit violations." }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": config.MAX_REQUESTS.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": entry.blockedUntil.toString(),
        },
      },
    );
  }

  if (entry.bucket < 1) {
    entry.violations++;
    if (entry.violations >= config.BLOCK_THRESHOLD) {
      entry.blockedUntil = now + config.MAX_BLOCKED_TIME;
      entry.violations = 0; // Reset violations count
      return new Response(
        JSON.stringify({ error: "IP blocked due to repeated rate limit violations." }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": config.MAX_REQUESTS.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": entry.blockedUntil.toString(),
          },
        },
      );
    }

    const retryAfter = Math.ceil((1 - entry.bucket) * (config.WINDOW_SIZE / config.MAX_REQUESTS) / 1000);
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": config.MAX_REQUESTS.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": (now + retryAfter * 1000).toString(),
          "Retry-After": retryAfter.toString(),
        },
      },
    );
  }

  entry.bucket = Math.max(0, entry.bucket - 1);
  entry.violations = Math.max(0, entry.violations - 1);

  const resp = await ctx.next();
  const headers = resp.headers;

  headers.set("X-RateLimit-Limit", config.MAX_REQUESTS.toString());
  headers.set("X-RateLimit-Remaining", Math.floor(entry.bucket).toString());
  headers.set("X-RateLimit-Reset", (now + config.WINDOW_SIZE).toString());

  return resp;
}

// Add a cleanup function to prevent memory leaks
function cleanupStore() {
  const now = Date.now();
  for (const [ip, entry] of store.entries()) {
    if (now - entry.lastRequest > config.WINDOW_SIZE * 2) {
      store.delete(ip);
    }
  }
}

// Make cleanup interval configurable
const CLEANUP_INTERVAL = parseInt(Deno.env.get("RATE_LIMIT_CLEANUP_INTERVAL") || "300000"); // 5 minutes default
setInterval(cleanupStore, CLEANUP_INTERVAL);
