import type { Env } from "../env";
import { json, preflight } from "../shared/http";
import {
  handleAuthCode,
  handleAuthLogout,
  handleAuthSession,
  handleAuthVerify,
} from "./auth";
import { handleNodeRegister } from "./node-register";
import { handlePlatform } from "./platform";

export async function handleControlRoute(
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (request.method === "OPTIONS" && path.startsWith("/api/")) return preflight(request, env);

  try {
    switch (path) {
      case "/api/auth/code":
        return await handleAuthCode(request, env);
      case "/api/auth/verify":
        return await handleAuthVerify(request, env);
      case "/api/auth/session":
        return await handleAuthSession(request, env);
      case "/api/auth/logout":
        return await handleAuthLogout(request, env);
      case "/api/platform":
        return await handlePlatform(request, env, context);
      case "/api/node/register":
        return await handleNodeRegister(request, env, context);
      case "/api/node/bind":
      case "/api/node/sync":
      case "/api/node/poll":
        return json(request, env, 426, { ok: false, error: "upgrade_required" });
      default:
        return null;
    }
  } catch (error) {
    console.error("Control request failed", path, error instanceof Error ? error.message : "unknown error");
    const nodeRoute = path === "/api/node/register";
    return json(request, env, nodeRoute ? 503 : 500, {
      ok: false,
      error: nodeRoute ? "backend_unavailable" : "backend_error",
    });
  }
}
