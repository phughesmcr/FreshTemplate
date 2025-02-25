import { FreshContext } from "$fresh/server.ts";
import { Jokes } from "lib/constants.ts";

// Jokes courtesy of https://punsandoneliners.com/randomness/programmer-jokes/

export const handler = (_req: Request, _ctx: FreshContext): Response => {
  const randomIndex = Math.floor(Math.random() * Jokes.length);
  const body = Jokes[randomIndex];
  return new Response(body);
};
