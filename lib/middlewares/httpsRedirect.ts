import type { FreshContext } from "$fresh/server.ts";
import type { ServerState } from "./state.ts";

export default async function httpsRedirect(req: Request, ctx: FreshContext<ServerState>) {
  if (!ctx.destination) return ctx.next();
  const url = new URL(req.url);
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const isDev = Deno.env.get("DENO_ENV") === "development";
  if (url.protocol === "http:" && !isLocalhost && !isDev) {
    url.protocol = "https:";
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.toString(),
      },
    });
  }
  return await ctx.next();
}
