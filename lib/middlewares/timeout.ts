import type { FreshContext } from "$fresh/server.ts";
import type { ServerState } from "./state.ts";

const TIMEOUT_MS = 30000; // 30 seconds

export default async function timeout(_req: Request, ctx: FreshContext<ServerState>): Promise<Response> {
  if (!ctx.destination) return ctx.next();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await Promise.race([
      ctx.next(),
      new Promise((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("Request timeout")));
      }),
    ]);
    clearTimeout(timeoutId);
    return res as Response;
  } catch (error) {
    if (error.message === "Request timeout") {
      return new Response("Request timed out", { status: 504 });
    }
    throw error;
  }
}
