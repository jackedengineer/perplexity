import {getDb} from "@/db";
import {guestSignIn} from "@/server/auth/guest";
import { getAuth } from "@/lib/auth";

export const runtime = "nodejs";

async function handle(request: Request) {
  const requestId = crypto.randomUUID();
  const start = performance.now();
  let response: Response;
  try {
    const forwarded=new Headers(request.headers);forwarded.delete("x-perplex-guest-validated");
    const sanitized=new Request(request,{headers:forwarded});
    response = new URL(request.url).pathname==="/api/auth/sign-in/anonymous"
      ? await guestSignIn(sanitized,getDb(),process.env,r=>getAuth().handler(r))
      : await getAuth().handler(sanitized);
  } catch {
    response = Response.json({ error: "Authentication is temporarily unavailable.", requestId }, { status: 503 });
  }
  const duration = Math.round(performance.now() - start);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("Server-Timing", `auth;dur=${duration}`);
  console.info(JSON.stringify({ event: "auth.request", requestId, status: response.status, durationMs: duration }));
  return response;
}

export { handle as GET, handle as POST };
