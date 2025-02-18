import type { FreshContext } from "$fresh/server.ts";
import { deleteCookie, getCookies } from "@std/http";
import type { ServerState } from "./state.ts";

export const PROTECTED_ROUTES = ["/api", "/auth", "/chat", "/user"] as const;
export type ProtectedRoute = typeof PROTECTED_ROUTES[number];

export const isProtectedRoute = (path: string): path is ProtectedRoute => {
  return PROTECTED_ROUTES.some((route) => path.startsWith(route));
};

export default async function protectedRouteHandler(
  req: Request,
  ctx: FreshContext<ServerState>,
): Promise<Response> {
  if (!ctx.destination) return ctx.next();
  const url = new URL(req.url);
  const headers = new Headers(req.headers);

  try {
    const cookies = getCookies(headers);
    const accessToken = cookies.auth;

    if (accessToken) {
      const { session } = ctx.state;
      if (!session) {
        throw new Error("Session middleware is not properly set up");
      }

      const currentSessionToken = session.get("access_token");
      if (accessToken !== currentSessionToken) {
        session.set("access_token", accessToken);
      }

      // this is where supabase etc would go
      ctx.state.user = {
        id: crypto.randomUUID(),
        username: "user", // or get from your auth system
      };
    }

    if (isProtectedRoute(url.pathname) && !ctx.state.user) {
      headers.set("location", "/");
      return new Response(null, {
        headers,
        status: 303,
        statusText: "See Other",
      });
    }

    return await ctx.next();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Session middleware is not properly set up") {
        return new Response(error.message, { status: 500 });
      }

      // Clear auth state on error
      deleteCookie(headers, "auth", {
        path: "/",
        domain: url.hostname,
        secure: true,
      });

      if (ctx.state.session) {
        ctx.state.session.clear();
      }

      ctx.state.error = "Authentication error";
      headers.set("location", "/");

      return new Response(null, {
        headers,
        status: 303,
        statusText: "See Other",
      });
    }
    throw error; // Re-throw unknown errors
  }
}
