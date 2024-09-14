import compression from "lib/middlewares/compression.ts";
import csrf from "lib/middlewares/csrf.ts";
import httpsRedirect from "lib/middlewares/httpsRedirect.ts";
import timeout from "lib/middlewares/timeout.ts";
import rateLimiter from "../lib/middlewares/rateLimiter.ts";
import securityHeaders from "../lib/middlewares/securityHeaders.ts";

export const handler = [
  httpsRedirect,
  securityHeaders,
  rateLimiter,
  csrf,
  timeout,
  compression,
];
