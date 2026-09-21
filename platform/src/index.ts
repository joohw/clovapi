import type { Env } from "./env";
import { handleControlRoute } from "./control/router";
import { AccountGate } from "./durable/account-gate";
import { AuthRateGate } from "./durable/auth-rate-gate";
import { NodeSession } from "./durable/node-session";
import { cleanupExpiredState } from "./maintenance";
import { handleRelayRoute } from "./relay/router";
import { allowedOrigin, hasAllowedOrigin, json, preflight } from "./shared/http";

export { AccountGate, AuthRateGate, NodeSession };

function withCors(request: Request, env: Env, response: Response): Response {
  const origin = allowedOrigin(request, env);
  if (!origin || response.status === 101) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  const vary = headers.get("Vary");
  if (!vary?.split(",").some((value) => value.trim().toLowerCase() === "origin")) {
    headers.append("Vary", "Origin");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (origin && !hasAllowedOrigin(request, env)) {
      return json(request, env, 403, { ok: false, error: "forbidden" });
    }
    if (request.method === "OPTIONS") return preflight(request, env);

    const control = await handleControlRoute(request, env, context);
    if (control) return control;
    const relay = await handleRelayRoute(request, env, context);
    if (relay) return withCors(request, env, relay);
    return json(request, env, 404, { ok: false, error: "not_found" });
  },

  scheduled(controller: ScheduledController, env: Env, context: ExecutionContext): void {
    context.waitUntil(
      cleanupExpiredState(env, controller.scheduledTime)
        .catch((error: unknown) => console.error("Scheduled platform cleanup failed", error)),
    );
  },
} satisfies ExportedHandler<Env>;
