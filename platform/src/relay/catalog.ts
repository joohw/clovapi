import type { Env } from "../env";
import { relayError, utcDay } from "./protocol";

interface AvailableModelRow {
  id: string;
  available_nodes: number;
}

interface UsageRow {
  id: string;
  day: string;
  requests: number;
}

interface UsageTotalRow {
  id: string;
  requests_24h: number;
  requests_7d: number;
}

interface CoverageRow {
  history_since: number;
}

interface CatalogModel {
  id: string;
  availableNodes: number;
  requests24h: number;
  requests7d: number;
  activity: Array<{ date: string; requests: number }>;
}

export interface CatalogSnapshot {
  object: "model_catalog";
  updatedAt: string;
  usageUpdatedAt: string;
  historySince: string;
  refreshAfterSeconds: number;
  stale: false;
  models: CatalogModel[];
  totals: {
    models: number;
    nodes: number;
    requests24h: number;
    requests7d: number;
  };
}

const CATALOG_CACHE_URL = "https://cache.clovapi.internal/model-catalog";
const CATALOG_CACHE_SECONDS = 60;

function availableQuery(): string {
  return `SELECT node_models.model_id AS id, COUNT(DISTINCT nodes.id) AS available_nodes
            FROM node_models
            JOIN nodes ON nodes.id = node_models.node_id
           WHERE nodes.accepting = 1
             AND nodes.paused = 0
             AND nodes.node_key_revoked = 0
             AND (nodes.usage_day <> ? OR nodes.used < nodes.daily_budget)
           GROUP BY node_models.model_id
           ORDER BY node_models.model_id`;
}

export async function availableModels(env: Env): Promise<AvailableModelRow[]> {
  const result = await env.DB.prepare(availableQuery()).bind(utcDay()).all<AvailableModelRow>();
  return result.results;
}

async function loadCatalogSnapshot(env: Env): Promise<CatalogSnapshot> {
    const now = Date.now();
    const end = Math.floor(now / 60_000) * 60_000;
    const since = end - 7 * 24 * 60 * 60_000;
    const since24h = end - 24 * 60 * 60_000;
    const [available, usage, totals, coverage] = await Promise.all([
      availableModels(env),
      env.DB.prepare(
        `SELECT model_id AS id, date(bucket_start / 1000, 'unixepoch') AS day, SUM(requests) AS requests
           FROM model_usage_minutes
          WHERE bucket_start >= ? AND bucket_start < ?
          GROUP BY model_id, day
          ORDER BY model_id, day`,
      ).bind(since, end).all<UsageRow>(),
      env.DB.prepare(
        `SELECT model_id AS id,
                SUM(CASE WHEN bucket_start >= ? THEN requests ELSE 0 END) AS requests_24h,
                SUM(requests) AS requests_7d
           FROM model_usage_minutes
          WHERE bucket_start >= ? AND bucket_start < ?
          GROUP BY model_id`,
      ).bind(since24h, since, end).all<UsageTotalRow>(),
      env.DB.prepare("SELECT history_since FROM model_usage_coverage WHERE id = 1").first<CoverageRow>(),
    ]);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() - (6 - index));
      return date.toISOString().slice(0, 10);
    });
    const byModel = new Map<string, Map<string, number>>();
    for (const row of usage.results) {
      const activity = byModel.get(row.id) ?? new Map<string, number>();
      activity.set(row.day, row.requests);
      byModel.set(row.id, activity);
    }
    const totalsByModel = new Map(totals.results.map((row) => [row.id, row]));
    let requests24h = 0;
    let requests7d = 0;
    const models = available.map((model) => {
      const counts = byModel.get(model.id) ?? new Map<string, number>();
      const activity = days.map((date) => ({ date, requests: counts.get(date) ?? 0 }));
      const aggregate = totalsByModel.get(model.id);
      const total7d = aggregate?.requests_7d ?? 0;
      const total24h = aggregate?.requests_24h ?? 0;
      requests24h += total24h;
      requests7d += total7d;
      return {
        id: model.id,
        availableNodes: model.available_nodes,
        requests24h: total24h,
        requests7d: total7d,
        activity,
      };
    });
    const nodeCount = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM nodes
        WHERE accepting = 1 AND paused = 0 AND node_key_revoked = 0
          AND (usage_day <> ? OR used < daily_budget)`,
    ).bind(utcDay(now)).first<{ count: number }>();
    const stamp = new Date(now).toISOString();
    return {
      object: "model_catalog",
      updatedAt: stamp,
      usageUpdatedAt: new Date(end).toISOString(),
      historySince: new Date(coverage?.history_since ?? now).toISOString(),
      refreshAfterSeconds: 60,
      stale: false,
      models,
      totals: {
        models: models.length,
        nodes: nodeCount?.count ?? 0,
        requests24h,
        requests7d,
      },
    };
}

export async function catalogSnapshot(env: Env, context: ExecutionContext): Promise<CatalogSnapshot> {
  const cacheKey = new Request(CATALOG_CACHE_URL);
  try {
    const cached = await caches.default.match(cacheKey);
    if (cached) return await cached.json() as CatalogSnapshot;
  } catch {
    // Cache API is an optimization. D1 remains the source of truth and is also
    // used by local runtimes that do not expose an edge cache.
  }

  const snapshot = await loadCatalogSnapshot(env);
  const cachedResponse = new Response(JSON.stringify(snapshot), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CATALOG_CACHE_SECONDS}`,
    },
  });
  try {
    context.waitUntil(caches.default.put(cacheKey, cachedResponse).catch(() => undefined));
  } catch {
    // Ignore cache availability failures; callers already have the snapshot.
  }
  return snapshot;
}

export async function publicCatalog(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return relayError("method_not_allowed", 405, { Allow: "GET, HEAD" });
  }
  try {
    const body = JSON.stringify(await catalogSnapshot(env, context));
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=30, s-maxage=${CATALOG_CACHE_SECONDS}, stale-while-revalidate=120`,
      "X-Content-Type-Options": "nosniff",
    });
    return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
  } catch {
    return relayError("catalog_unavailable", 503, { "Retry-After": "60" });
  }
}
