import { FreshContext } from "$fresh/server.ts";

export default function handler(req: Request, ctx: FreshContext) {
  const url = new URL(req.url);
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const isDev = Deno.env.get("DENO_ENV") === "development";
  if (url.protocol === "http:" && !isLocalhost && !isDev) {
    url.protocol = "https:";
    return Response.redirect(url.toString(), 301);
  }
  return ctx.next();
}
