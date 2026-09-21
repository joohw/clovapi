import type { Env } from "../env";
import { releaseAccountSlot, acquireAccountSlot } from "./account-gate";
import { authenticateConsumer, authenticateNode, recordConsumerUse } from "./auth";
import { catalogSnapshot, publicCatalog } from "./catalog";
import {
  REQUEST_TIMEOUT_MS,
  isAdmissionRejected,
  readRelayRequest,
  relayError,
  utcDay,
} from "./protocol";

interface CandidateRow {
  node_id: string;
}

function nodeStub(env: Env, nodeId: string): DurableObjectStub {
  return env.NODE_SESSIONS.get(env.NODE_SESSIONS.idFromName(nodeId));
}

function withoutAdmissionHeader(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete("X-Clovapi-Relay-Admission");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function health(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return relayError("method_not_allowed", 405, { Allow: "GET, HEAD" });
  }
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  return new Response(request.method === "HEAD" ? null : JSON.stringify({ ok: true, service: "clovapi-platform" }), {
    status: 200,
    headers,
  });
}

async function connectNode(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return relayError("method_not_allowed", 405, { Allow: "GET" });
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return relayError("websocket_required", 426);
  if (request.headers.has("Origin")) return relayError("unauthorized", 401);
  let identity;
  try {
    identity = await authenticateNode(request, env);
  } catch {
    return relayError("control_plane_unavailable", 503);
  }
  if (!identity) return relayError("unauthorized", 401);
  const headers = new Headers({
    Upgrade: "websocket",
    "X-Clovapi-Node-Id": identity.nodeId,
    "X-Clovapi-User-Id": identity.userId,
    "X-Clovapi-Connection-Id": crypto.randomUUID(),
    "X-Clovapi-Auth-Version": String(identity.authVersion),
    "X-Clovapi-Daily-Limit": String(identity.dailyLimit),
    "X-Clovapi-Used": String(identity.used),
    "X-Clovapi-Usage-Day": identity.usageDay,
    "X-Clovapi-Paused": String(identity.paused),
  });
  return nodeStub(env, identity.nodeId).fetch("https://node-session.internal/connect", { method: "GET", headers });
}

async function authenticatedModels(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
  if (request.method !== "GET") return relayError("method_not_allowed", 405, { Allow: "GET" });
  let identity;
  try {
    identity = await authenticateConsumer(request, env);
  } catch {
    return relayError("control_plane_unavailable", 503);
  }
  if (!identity) return relayError("unauthorized", 401);
  recordConsumerUse(env, context, identity.keyId);
  try {
    const catalog = await catalogSnapshot(env, context);
    return new Response(JSON.stringify({
      object: "list",
      data: catalog.models.map(({ id }) => ({ id, object: "model", created: 0, owned_by: "clovapi" })),
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return relayError("control_plane_unavailable", 503);
  }
}

async function relayRequest(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") return relayError("method_not_allowed", 405, { Allow: "POST" });
  let identity;
  try {
    identity = await authenticateConsumer(request, env);
  } catch {
    return relayError("control_plane_unavailable", 503);
  }
  if (!identity) return relayError("unauthorized", 401);
  recordConsumerUse(env, context, identity.keyId);
  const parsed = await readRelayRequest(request);
  if (parsed instanceof Response) return parsed;

  const requestId = crypto.randomUUID();
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  let gateOwned = false;
  try {
    const acquired = await acquireAccountSlot(env, identity.userId, identity.keyId, requestId, deadline);
    if (!acquired.ok) {
      if (acquired.code === "key_revoked") return relayError("unauthorized", 401);
      return relayError(acquired.code, acquired.status);
    }
    gateOwned = true;
    const today = utcDay();
    const candidates = await env.DB.prepare(
      `SELECT node_models.node_id
         FROM node_models
         JOIN nodes ON nodes.id = node_models.node_id
        WHERE node_models.model_id = ?
          AND nodes.accepting = 1
          AND nodes.paused = 0
          AND nodes.node_key_revoked = 0
          AND (nodes.usage_day <> ? OR nodes.used < nodes.daily_budget)
        ORDER BY CASE WHEN nodes.usage_day = ? THEN nodes.used ELSE 0 END ASC,
                 COALESCE(nodes.last_seen_at, 0) ASC,
                 node_models.node_id
        LIMIT 24`,
    ).bind(parsed.body.model, today, today).all<CandidateRow>();

    for (const candidate of candidates.results) {
      let response: Response;
      try {
        response = await nodeStub(env, candidate.node_id).fetch("https://node-session.internal/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: request.signal,
          body: JSON.stringify({
            requestId,
            userId: identity.userId,
            keyId: identity.keyId,
            path: new URL(request.url).pathname,
            model: parsed.body.model,
            body: parsed.body,
            deadline,
          }),
        });
      } catch {
        // Delivery may have crossed the DO admission boundary. Do not duplicate
        // the request on another node; the gate alarm is the final leak guard.
        gateOwned = false;
        return relayError("relay_unavailable", 503);
      }
      if (isAdmissionRejected(response)) {
        await response.arrayBuffer().catch(() => undefined);
        continue;
      }
      gateOwned = false;
      return withoutAdmissionHeader(response);
    }
    return relayError("no_node_capacity", 503);
  } catch {
    return relayError("control_plane_unavailable", 503);
  } finally {
    if (gateOwned) context.waitUntil(releaseAccountSlot(env, identity.userId, requestId));
  }
}

export async function handleRelayRoute(
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === "/health") return health(request);
  if (path === "/api/node/connect") return connectNode(request, env);
  if (path === "/api/models") return publicCatalog(request, env, context);
  if (path === "/v1/models") return authenticatedModels(request, env, context);
  if (path === "/v1/chat/completions" || path === "/v1/responses") {
    return relayRequest(request, env, context);
  }
  if (path === "/api/internal" || path.startsWith("/api/internal/") || path === "/internal" || path.startsWith("/internal/")) {
    return relayError("not_found", 404);
  }
  if (path.startsWith("/v1/")) return relayError("not_found", 404);
  return null;
}
