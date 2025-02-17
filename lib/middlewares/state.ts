import type { FreshContext } from "$fresh/server.ts";
import { cookieSession, type WithSession } from "fresh-session";
import type { User } from "../types.ts";

export interface ServerState extends WithSession, Record<string, unknown> {
  user: User | null;
  error: string | null;
  message: string | null;
  sessionTermsAccepted: boolean | null;
}

const session = cookieSession({
  expires: 1000 * 60 * 60 * 24 * 30,
  httpOnly: true,
  path: "/",
  sameSite: "Strict",
  secure: true,
});

export default async function stateHandler(
  req: Request,
  ctx: FreshContext<ServerState>,
): Promise<Response> {
  ctx.state = {
    ...ctx.state,
    user: ctx.state.user ?? null,
    error: ctx.state.error ?? null,
    message: ctx.state.message ?? null,
    sessionTermsAccepted: ctx.state.sessionTermsAccepted ?? null,
  };
  const response = await session(req, ctx);
  return response;
}
