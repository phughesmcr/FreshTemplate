import type { FreshContext } from "$fresh/server.ts";
import { deleteCookie, getCookies } from "@std/http";
import type { ServerState } from "./state.ts";

export const PROTECTED_ROUTES = ["/api", "/auth", "/chat", "/user"] as const;

export const isProtectedRoute = (path: string) => PROTECTED_ROUTES.includes(path as typeof PROTECTED_ROUTES[number]);

export default function protectedRouteHandler(req: Request, ctx: FreshContext<ServerState>) {
  if (!ctx.destination) return ctx.next();
  const url = new URL(req.url);
  const headers = new Headers(req.headers);
  try {
    const cookies = getCookies(headers);
    const access_token = cookies.auth;

    if (access_token) {
      const { session } = ctx.state;
      if (session) {
        const currentSessionData = session.get("access_token");
        if (access_token !== currentSessionData) {
          session.set("access_token", access_token);
        }

        // this is where supabase etc would go

        ctx.state.user = crypto.randomUUID();
      } else {
        console.warn("Session middleware is not properly set up");
        return new Response(null, { status: 500 });
      }
    }

    if (isProtectedRoute(url.pathname) && !ctx.state.user) {
      headers.set("location", "/");
      return new Response(null, { headers, status: 303 });
    }
  } catch (error) {
    console.error("Error in protectedRouteHandler:", error);
    deleteCookie(headers, "auth", { path: "/", domain: new URL(req.url).hostname });
    ctx.state.session.clear();
    ctx.state.error = "Authentication error";
    headers.set("location", "/");
    return new Response(null, { headers, status: 303 });
  }

  return ctx.next();
}
