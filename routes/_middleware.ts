import type { FreshContext } from "$fresh/server.ts";
import compression from "lib/middlewares/compression.ts";
import csrf from "lib/middlewares/csrf.ts";
import httpsRedirect from "lib/middlewares/httpsRedirect.ts";
import protectedRouteHandler from "lib/middlewares/protectedRoutes.ts";
import rateLimiter from "lib/middlewares/rateLimiter.ts";
import securityHeaders from "lib/middlewares/securityHeaders.ts";
import stateHandler, { type ServerState } from "lib/middlewares/state.ts";
import timeout from "lib/middlewares/timeout.ts";

export const handler: ((req: Request, ctx: FreshContext<ServerState, unknown, unknown>) => Promise<Response>)[] = [
  httpsRedirect,
  securityHeaders,
  stateHandler, // server state established here
  protectedRouteHandler,
  rateLimiter,
  csrf,
  timeout,
  compression,
] as const;
