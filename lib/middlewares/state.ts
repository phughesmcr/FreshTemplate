import type { FreshContext } from "$fresh/server.ts";
import { cookieSession, type WithSession } from "fresh-session";
import type { User } from "../types.ts";

/**
 * Server state interface that extends the session state with application-specific properties
 */
export interface ServerState extends WithSession, Record<string, unknown> {
  user: User | null;
  error: string | null;
  message: string | null;
  sessionTermsAccepted: boolean | null;
}

// Load configuration from environment with fallbacks
const SESSION_CONFIG = {
  EXPIRES: parseInt(Deno.env.get("SESSION_EXPIRES") || "2592000000"), // 30 days in ms
  HTTP_ONLY: Deno.env.get("SESSION_HTTP_ONLY") !== "false",
  PATH: Deno.env.get("SESSION_PATH") || "/",
  SAME_SITE: Deno.env.get("SESSION_SAME_SITE") || "Strict",
  SECURE: Deno.env.get("SESSION_SECURE") !== "false",
};

const session = cookieSession({
  expires: SESSION_CONFIG.EXPIRES,
  httpOnly: SESSION_CONFIG.HTTP_ONLY,
  path: SESSION_CONFIG.PATH,
  sameSite: SESSION_CONFIG.SAME_SITE as "Strict" | "Lax" | "None",
  secure: SESSION_CONFIG.SECURE,
});

/**
 * Initializes server state and session handling
 * Must be placed early in the middleware chain as other middleware depends on it
 */
export default async function stateHandler(
  req: Request,
  ctx: FreshContext<ServerState>,
): Promise<Response> {
  try {
    // Initialize default state values
    ctx.state = {
      ...ctx.state,
      user: ctx.state.user ?? null,
      error: ctx.state.error ?? null,
      message: ctx.state.message ?? null,
      sessionTermsAccepted: ctx.state.sessionTermsAccepted ?? null,
    };
    
    // Apply session middleware
    return await session(req, ctx);
  } catch (error) {
    console.error("Session initialization error:", error);
    // Continue without session if there's an error
    return ctx.next();
  }
}
