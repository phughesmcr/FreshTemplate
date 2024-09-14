import { FreshContext } from "$fresh/server.ts";

const TIMEOUT_MS = 30000; // 30 seconds

export default async function handler(_req: Request, ctx: FreshContext) {
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
    return res;
  } catch (error) {
    if (error.message === "Request timeout") {
      return new Response("Request timed out", { status: 504 });
    }
    throw error;
  }
}
