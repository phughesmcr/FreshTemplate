import type { FreshContext } from "$fresh/server.ts";
import { cookieSession, type WithSession } from "fresh-session";
import { Session } from "lib/constants.ts";
import type { User } from "lib/types.ts";

/**
 * Server state interface that extends the session state with application-specific properties
 */
export interface ServerState extends WithSession, Record<string, unknown> {
  user: User | null;
  error: string | null;
  message: string | null;
  sessionTermsAccepted: boolean | null;
}

// Use session configuration from constants
const session = cookieSession({
  expires: Session.CONFIG.EXPIRES,
  httpOnly: Session.CONFIG.HTTP_ONLY,
  path: Session.CONFIG.PATH,
  sameSite: Session.CONFIG.SAME_SITE as "Strict" | "Lax" | "None",
  secure: Session.CONFIG.SECURE,
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
