import type { Env } from "../env";
import { bindAccountSlot, releaseAccountSlot } from "../relay/account-gate";
import { CancellationTombstones, type CancellationTombstone } from "../relay/cancellations";
import {
  INITIAL_WINDOW_BYTES,
  MAX_CHUNK_BYTES,
  MAX_INFLIGHT_FRAMES,
  MAX_RESPONSE_BYTES,
  NODE_CONCURRENCY,
  RELAY_PROTOCOL,
  REQUEST_TIMEOUT_MS,
  admissionRejected,
  compareAuthGeneration,
  decodeBase64,
  isSafeNonNegativeInteger,
  mergeUsageSnapshot,
  normalizeWireModels,
  parseRelayWireMessage,
  relayError,
  utcDay,
  validContentType,
  type RelayWireMessage,
} from "../relay/protocol";
import { MODEL_PATTERN, isRecord } from "../shared/validation";

interface StoredSession {
  nodeId: string;
  userId: string;
  authVersion: number;
  connectionId: string;
  dailyLimit: number;
  used: number;
  usageDay: string;
  policyPaused: boolean;
  localPaused: boolean;
  remaining: number;
  models: string[];
  modelsProjected: boolean;
  ready: boolean;
  connected: boolean;
  updatedAt: number;
}

interface SocketAttachment {
  nodeId: string;
  connectionId: string;
  authVersion: number;
}

interface DispatchInput {
  requestId: string;
  userId: string;
  keyId: string;
  path: "/v1/chat/completions" | "/v1/responses";
  model: string;
  body: Record<string, unknown>;
  deadline: number;
}

interface PolicyRow {
  daily_budget: number;
  used: number;
  usage_day: string;
  paused: number;
  node_key_revoked: number;
  auth_version: number;
  relay_connection_id: string | null;
}

interface ReservationRow {
  used: number;
  daily_budget: number;
  usage_day: string;
}

interface RunningRow {
  id: string;
  user_id: string;
}

interface RelayJob {
  id: string;
  userId: string;
  keyId: string;
  connectionId: string;
  model: string;
  deadline: number;
  expectedSeq: number;
  headersSeen: boolean;
  bodyForbidden: boolean;
  ended: boolean;
  terminal: boolean;
  inflightBytes: number;
  inflightFrames: number;
  totalBytes: number;
  writtenBytes: number;
  responseStatus: number;
  holdsLocalReservation: boolean;
  terminalState?: "completed" | "failed" | "cancelled";
  terminalCode?: string;
  terminalStatus?: number;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  readable: ReadableStream<Uint8Array>;
  writeChain: Promise<void>;
  resolveResponse: (response: Response) => void;
  response: Promise<Response>;
  timeout: ReturnType<typeof setTimeout>;
}

const SESSION_KEY = "session:v1";
const CANCELLATION_PREFIX = "cancel:v1:";
const CANCELLATION_TTL_MS = REQUEST_TIMEOUT_MS + 30_000;
const ACCEPTED_HEADER = { "X-Clovapi-Relay-Admission": "accepted" };

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function integerHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (!value || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function booleanHeader(headers: Headers, name: string): boolean | null {
  const value = headers.get(name);
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

async function readObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function publicNodeError(code: unknown): string {
  switch (code) {
    case "node_busy":
    case "model_unavailable":
    case "node_unavailable":
    case "invalid_request":
    case "response_too_large":
    case "request_timeout":
      return code;
    default:
      return "node_error";
  }
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function modelInsertStatements(env: Env, nodeId: string, connectionId: string, models: string[]): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  for (let offset = 0; offset < models.length; offset += 40) {
    const chunk = models.slice(offset, offset + 40);
    const values = chunk.map(() => "(?)").join(",");
    statements.push(env.DB.prepare(
      `WITH current_node(node_id) AS (
         SELECT id FROM nodes WHERE id = ? AND relay_connection_id = ?
       ), advertised_models(model_id) AS (VALUES ${values})
       INSERT INTO node_models(node_id,model_id)
       SELECT current_node.node_id,advertised_models.model_id
         FROM current_node CROSS JOIN advertised_models`,
    ).bind(nodeId, connectionId, ...chunk));
  }
  return statements;
}

export class NodeSession implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly jobs = new Map<string, RelayJob>();
  private readonly cancellations = new CancellationTombstones();
  private readonly pendingRequestIds = new Set<string>();
  private pendingAdmissions = 0;
  private unsentReservations = 0;
  private connectionTail: Promise<void> = Promise.resolve();
  private stateTail: Promise<void> = Promise.resolve();
  private session: StoredSession | null = null;
  private readonly ready: Promise<void>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.ready = state.blockConcurrencyWhile(async () => {
      const [storedSession, storedCancellations] = await Promise.all([
        state.storage.get<StoredSession>(SESSION_KEY),
        state.storage.list<CancellationTombstone>({ prefix: CANCELLATION_PREFIX }),
      ]);
      this.session = storedSession ?? null;
      for (const [key, tombstone] of storedCancellations) {
        this.cancellations.restore(key.slice(CANCELLATION_PREFIX.length), tombstone);
      }
      await this.pruneCancellations(Date.now());
      if (!this.session) return;
      const connected = this.currentSocket() !== null;
      this.session.connected = connected;
      if (!connected) this.session.ready = false;
      if (connected) {
        await state.storage.put(SESSION_KEY, this.session);
      } else {
        this.session.updatedAt = Date.now();
        await Promise.all([
          state.storage.put(SESSION_KEY, this.session),
          env.DB.prepare(
            `UPDATE nodes SET accepting = 0, relay_connection_id = NULL, last_seen_at = ?
              WHERE id = ? AND relay_connection_id = ?`,
          ).bind(this.session.updatedAt, this.session.nodeId, this.session.connectionId).run(),
        ]);
      }
      await this.reconcileAbandonedRequests();
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const path = new URL(request.url).pathname;
    if (path === "/connect") return this.acceptConnection(request);
    if (path === "/dispatch") return this.dispatch(request);
    if (path === "/control") return this.control(request);
    if (path === "/status") return this.status(request);
    return jsonResponse(404, { ok: false, error: "not_found" });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.ready;
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    const session = this.session;
    if (!session || !this.isCurrent(attachment)) {
      socket.close(4003, "connection_replaced");
      return;
    }
    const frame = parseRelayWireMessage(message);
    if (!frame) {
      await this.closeSession(session, socket, 1008, "invalid_protocol", "invalid_node_response");
      return;
    }
    if (frame.type === "hello" || frame.type === "state") {
      const next = this.stateTail.then(() => this.receiveState(session, socket, frame));
      this.stateTail = next.catch(() => undefined);
      await next;
      return;
    }
    if (frame.type === "headers" || frame.type === "data" || frame.type === "end" || frame.type === "error") {
      if (!this.session?.ready || typeof frame.id !== "string") {
        await this.closeSession(session, socket, 1008, "hello_required", "invalid_node_response");
        return;
      }
      const job = this.jobs.get(frame.id);
      if (job) this.receiveJobFrame(job, frame);
      return;
    }
    await this.closeSession(session, socket, 1008, "invalid_protocol", "invalid_node_response");
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    await this.ready;
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    const session = this.session;
    if (session && this.isCurrent(attachment)) await this.markDisconnected(session, "node_disconnected");
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket);
  }

  async alarm(): Promise<void> {
    await this.ready;
    await this.pruneCancellations(Date.now());
  }

  private async acceptConnection(request: Request): Promise<Response> {
    const previous = this.connectionTail;
    let release!: () => void;
    this.connectionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await this.acceptConnectionLocked(request);
    } finally {
      release();
    }
  }

  private async acceptConnectionLocked(request: Request): Promise<Response> {
    if (request.method !== "GET") return jsonResponse(405, { ok: false, error: "method_not_allowed" });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return jsonResponse(426, { ok: false, error: "websocket_required" });
    }
    const nodeId = request.headers.get("X-Clovapi-Node-Id");
    const userId = request.headers.get("X-Clovapi-User-Id");
    const connectionId = request.headers.get("X-Clovapi-Connection-Id");
    const authVersion = integerHeader(request.headers, "X-Clovapi-Auth-Version");
    const dailyLimit = integerHeader(request.headers, "X-Clovapi-Daily-Limit");
    const rawUsed = integerHeader(request.headers, "X-Clovapi-Used");
    const policyPaused = booleanHeader(request.headers, "X-Clovapi-Paused");
    const incomingDay = request.headers.get("X-Clovapi-Usage-Day");
    if (!nodeId || nodeId.length > 80 || !userId || userId.length > 80 || !connectionId || connectionId.length > 80
      || authVersion === null || dailyLimit === null || dailyLimit < 1 || rawUsed === null || policyPaused === null
      || !incomingDay || !/^\d{4}-\d{2}-\d{2}$/u.test(incomingDay)) {
      return jsonResponse(400, { ok: false, error: "invalid_connection_metadata" });
    }

    let policy: PolicyRow | null;
    try {
      policy = await this.env.DB.prepare(
        `SELECT daily_budget,used,usage_day,paused,node_key_revoked,auth_version,relay_connection_id
           FROM nodes WHERE id = ? AND user_id = ?`,
      ).bind(nodeId, userId).first<PolicyRow>();
    } catch {
      return jsonResponse(503, { ok: false, error: "control_plane_unavailable" });
    }
    if (!policy || policy.node_key_revoked !== 0 || policy.auth_version !== authVersion) {
      return jsonResponse(401, { ok: false, error: "unauthorized" });
    }

    const previousSession = this.session;
    for (const existing of this.state.getWebSockets("node")) existing.close(4003, "connection_replaced");
    if (previousSession) {
      previousSession.connected = false;
      previousSession.ready = false;
      this.failJobsForConnection(previousSession.connectionId, "node_disconnected");
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const today = utcDay();
    const used = policy.usage_day === today ? policy.used : 0;
    this.session = {
      nodeId,
      userId,
      authVersion,
      connectionId,
      dailyLimit: policy.daily_budget,
      used,
      usageDay: today,
      policyPaused: policy.paused !== 0,
      localPaused: false,
      remaining: 0,
      models: [],
      modelsProjected: false,
      ready: false,
      connected: true,
      updatedAt: Date.now(),
    };
    try {
      const [, projection] = await Promise.all([
        this.state.storage.put(SESSION_KEY, this.session),
      this.env.DB.prepare(
        `UPDATE nodes
            SET accepting = 0, last_seen_at = ?, relay_connection_id = ?
          WHERE id = ? AND auth_version = ? AND node_key_revoked = 0`,
        ).bind(Date.now(), connectionId, nodeId, authVersion).run(),
      ]);
      if (projection.meta.changes !== 1) {
        this.session.connected = false;
        this.session.ready = false;
        await this.state.storage.put(SESSION_KEY, this.session);
        return jsonResponse(401, { ok: false, error: "unauthorized" });
      }
    } catch {
      this.session.connected = false;
      this.session.ready = false;
      await this.state.storage.put(SESSION_KEY, this.session);
      return jsonResponse(503, { ok: false, error: "control_plane_unavailable" });
    }
    server.serializeAttachment({ nodeId, connectionId, authVersion } satisfies SocketAttachment);
    this.state.acceptWebSocket(server, ["node"]);
    server.send(JSON.stringify({
      type: "welcome",
      protocol: RELAY_PROTOCOL,
      nodeId,
      concurrency: NODE_CONCURRENCY,
      dailyLimit: policy.daily_budget,
      used,
      paused: policy.paused !== 0,
    } satisfies RelayWireMessage));
    return new Response(null, { status: 101, webSocket: client });
  }

  private async receiveState(session: StoredSession, socket: WebSocket, frame: RelayWireMessage): Promise<void> {
    if (!this.isSameConnection(session, socket)) return;
    const first = !session.ready;
    const paused = frame.paused ?? false;
    const remaining = frame.remaining ?? 0;
    const models = normalizeWireModels(frame.models);
    if ((first && (frame.type !== "hello" || frame.protocol !== RELAY_PROTOCOL))
      || (!first && frame.type === "hello")
      || models === null
      || typeof paused !== "boolean"
      || !isSafeNonNegativeInteger(remaining)
      || frame.concurrency !== NODE_CONCURRENCY) {
      await this.closeSession(session, socket, 1008, "invalid_protocol", "invalid_node_response");
      return;
    }
    let policy: PolicyRow | null;
    try {
      policy = await this.env.DB.prepare(
        `SELECT daily_budget,used,usage_day,paused,node_key_revoked,auth_version,relay_connection_id
           FROM nodes WHERE id = ?`,
      ).bind(session.nodeId).first<PolicyRow>();
    } catch {
      await this.closeSession(session, socket, 1011, "control_plane_unavailable", "node_disconnected");
      return;
    }
    if (!this.isSameConnection(session, socket)) {
      socket.close(4003, "connection_replaced");
      return;
    }
    if (!policy || policy.node_key_revoked !== 0 || policy.auth_version !== session.authVersion
      || policy.relay_connection_id !== session.connectionId) {
      socket.close(4001, "auth_invalid");
      await this.markDisconnected(session, "node_disconnected");
      return;
    }
    const today = utcDay();
    session.dailyLimit = policy.daily_budget;
    const usage = mergeUsageSnapshot(session.usageDay, session.used, policy.usage_day, policy.used, today);
    session.used = usage.used;
    session.usageDay = usage.usageDay;
    session.policyPaused = policy.paused !== 0;
    session.localPaused = paused;
    session.remaining = remaining;
    const nextModels = [...models].sort();
    const modelsChanged = session.modelsProjected !== true || !sameStrings(session.models, nextModels);
    session.models = nextModels;
    session.modelsProjected = true;
    session.ready = true;
    session.updatedAt = Date.now();
    const accepting = this.isAvailable(session) ? 1 : 0;
    const statements: D1PreparedStatement[] = [
      this.env.DB.prepare(
        `UPDATE nodes
            SET accepting = ?, last_seen_at = ?
          WHERE id = ? AND relay_connection_id = ?`,
      ).bind(accepting, session.updatedAt, session.nodeId, session.connectionId),
    ];
    if (modelsChanged) {
      statements.push(
        this.env.DB.prepare(
          `DELETE FROM node_models
            WHERE node_id = ? AND EXISTS (
              SELECT 1 FROM nodes WHERE id = ? AND relay_connection_id = ?
            )`,
        ).bind(session.nodeId, session.nodeId, session.connectionId),
        ...modelInsertStatements(this.env, session.nodeId, session.connectionId, session.models),
      );
    }
    try {
      const [, results] = await Promise.all([
        this.state.storage.put(SESSION_KEY, session),
        this.env.DB.batch(statements),
      ]);
      if (results[0]?.meta.changes !== 1) {
        await this.closeSession(session, socket, 4001, "auth_invalid", "node_disconnected");
      }
    } catch {
      await this.closeSession(session, socket, 1011, "control_plane_unavailable", "node_disconnected");
    }
  }

  private async dispatch(request: Request): Promise<Response> {
    if (request.method !== "POST") return admissionRejected("method_not_allowed");
    const raw = await readObject(request);
    const input = this.parseDispatch(raw);
    if (!input) return admissionRejected("invalid_request");
    if (this.jobs.has(input.requestId) || this.pendingRequestIds.has(input.requestId)) {
      return relayError("request_conflict", 409, ACCEPTED_HEADER);
    }
    const priorCancellation = this.takeCancellation(input.requestId);
    if (priorCancellation) return relayError(priorCancellation.code, 502, ACCEPTED_HEADER);
    if (request.signal.aborted) return admissionRejected("request_cancelled");
    const session = this.session;
    const socket = this.currentSocket();
    if (!session || !socket || !session.connected || !session.ready) return admissionRejected("node_unavailable");
    if (session.policyPaused || session.localPaused) return admissionRejected("node_unavailable");
    if (!session.models.includes(input.model)) return admissionRejected("model_unavailable");
    if (this.jobs.size + this.pendingAdmissions >= NODE_CONCURRENCY) return admissionRejected("node_busy");
    if (session.usageDay !== utcDay()) {
      session.used = 0;
      session.usageDay = utcDay();
    }
    if (session.remaining <= this.pendingAdmissions + this.unsentReservations
      || session.used + this.pendingAdmissions >= session.dailyLimit) {
      return admissionRejected("node_limit_reached");
    }

    this.pendingAdmissions++;
    this.pendingRequestIds.add(input.requestId);
    let pendingHeld = true;
    try {

    let policy: PolicyRow | null;
    try {
      policy = await this.env.DB.prepare(
        `SELECT daily_budget,used,usage_day,paused,node_key_revoked,auth_version,relay_connection_id
           FROM nodes WHERE id = ?`,
      ).bind(session.nodeId).first<PolicyRow>();
    } catch {
      return admissionRejected("control_plane_unavailable");
    }
    if (!this.isSameConnection(session, socket)) return admissionRejected("node_unavailable");
    if (!policy || policy.node_key_revoked !== 0 || policy.auth_version !== session.authVersion
      || policy.relay_connection_id !== session.connectionId || policy.paused !== 0) {
      return admissionRejected("node_unavailable");
    }
    const today = utcDay();
    let reserved: ReservationRow | null;
    try {
      const result = await this.env.DB.prepare(
        `UPDATE nodes
            SET used = CASE WHEN usage_day = ? THEN used + 1 ELSE 1 END,
                usage_day = ?, last_seen_at = ?
          WHERE id = ? AND relay_connection_id = ? AND node_key_revoked = 0 AND paused = 0
            AND (usage_day <> ? OR used < daily_budget)
          RETURNING used,daily_budget,usage_day`,
      ).bind(today, today, Date.now(), session.nodeId, session.connectionId, today).all<ReservationRow>();
      reserved = result.results[0] ?? null;
    } catch {
      return admissionRejected("control_plane_unavailable");
    }
    if (!reserved) return admissionRejected("node_limit_reached");
    if (!this.isSameConnection(session, socket)) {
      await this.rollbackReservation(session, reserved.usage_day, false);
      return admissionRejected("node_unavailable");
    }

    session.dailyLimit = reserved.daily_budget;
    session.used = session.usageDay === today ? Math.max(session.used, reserved.used) : reserved.used;
    session.usageDay = reserved.usage_day;
    session.updatedAt = Date.now();

    if (!await bindAccountSlot(this.env, input.userId, input.requestId, session.nodeId)) {
      await this.rollbackReservation(session, reserved.usage_day, true);
      return admissionRejected("account_gate_unavailable");
    }
    const earlyCancellation = this.takeCancellation(input.requestId);
    if (earlyCancellation) {
      await releaseAccountSlot(this.env, input.userId, input.requestId);
      await this.rollbackReservation(session, reserved.usage_day, true);
      return relayError(earlyCancellation.code, 502, ACCEPTED_HEADER);
    }
    if (!this.isSameConnection(session, socket)) {
      await releaseAccountSlot(this.env, input.userId, input.requestId);
      await this.rollbackReservation(session, reserved.usage_day, true);
      return relayError("node_unavailable", 502, ACCEPTED_HEADER);
    }

    const transform = new TransformStream<Uint8Array, Uint8Array>();
    const writer = transform.writable.getWriter();
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    const job: RelayJob = {
      id: input.requestId,
      userId: input.userId,
      keyId: input.keyId,
      connectionId: session.connectionId,
      model: input.model,
      deadline: input.deadline,
      expectedSeq: 0,
      headersSeen: false,
      bodyForbidden: false,
      ended: false,
      terminal: false,
      inflightBytes: 0,
      inflightFrames: 0,
      totalBytes: 0,
      writtenBytes: 0,
      responseStatus: 502,
      holdsLocalReservation: true,
      writer,
      readable: transform.readable,
      writeChain: Promise.resolve(),
      resolveResponse,
      response,
      timeout: 0 as unknown as ReturnType<typeof setTimeout>,
    };
    job.timeout = setTimeout(() => this.failJob(job, "request_timeout", "failed", 504, true), Math.max(1, input.deadline - Date.now()));
    this.jobs.set(job.id, job);
    this.unsentReservations++;
    this.pendingAdmissions--;
    pendingHeld = false;
    try {
      await Promise.all([
        this.state.storage.put(SESSION_KEY, session),
        this.env.DB.batch([
          this.env.DB.prepare(
            `INSERT INTO relay_requests(
               id,node_id,user_id,api_key_id,connection_id,model,state,created_at,deadline
             ) VALUES(?,?,?,?,?,?, 'running', ?,?)`,
          ).bind(
            job.id,
            session.nodeId,
            job.userId,
            job.keyId,
            job.connectionId,
            job.model,
            Date.now(),
            job.deadline,
          ),
          this.env.DB.prepare(
            `INSERT INTO model_usage_minutes(model_id,bucket_start,requests) VALUES(?,?,1)
             ON CONFLICT(model_id,bucket_start) DO UPDATE SET requests = requests + 1`,
          ).bind(job.model, Math.floor(Date.now() / 60_000) * 60_000),
          this.env.DB.prepare(
            "UPDATE nodes SET accepting = ? WHERE id = ? AND relay_connection_id = ?",
          ).bind(this.isAvailable(session) ? 1 : 0, session.nodeId, session.connectionId),
        ]),
      ]);
    } catch {
      clearTimeout(job.timeout);
      this.jobs.delete(job.id);
      this.releaseUnsentReservation(job);
      await writer.abort("control_plane_unavailable").catch(() => undefined);
      await releaseAccountSlot(this.env, job.userId, job.id);
      await this.rollbackReservation(session, reserved.usage_day, true);
      return relayError("control_plane_unavailable", 503, ACCEPTED_HEADER);
    }
    const abort = () => {
      this.failJob(job, "consumer_disconnected", "cancelled", 499, true);
    };
    request.signal.addEventListener("abort", abort, { once: true });
    writer.closed.catch(() => {
      if (!job.terminal) this.failJob(job, "consumer_disconnected", "cancelled", 499, true);
    });
    if (request.signal.aborted) abort();
    if (job.terminal) {
      await this.recordTerminal(
        job,
        job.terminalState ?? "cancelled",
        job.terminalCode ?? "request_cancelled",
        job.terminalStatus ?? 499,
      );
      return job.response;
    }
    if (!this.isSameConnection(session, socket)) {
      this.failJob(job, "node_disconnected", "failed", 502, false);
      return job.response;
    }
    if (session.remaining <= 0) {
      this.failJob(job, "node_limit_reached", "failed", 502, false);
      return job.response;
    }
    this.releaseUnsentReservation(job);
    session.remaining--;
    session.updatedAt = Date.now();
    this.state.waitUntil(Promise.all([
      this.state.storage.put(SESSION_KEY, session),
      this.env.DB.prepare("UPDATE nodes SET accepting = ? WHERE id = ? AND relay_connection_id = ?")
        .bind(this.isAvailable(session) ? 1 : 0, session.nodeId, session.connectionId)
        .run(),
    ]).then(() => undefined).catch(() => undefined));
    try {
      socket.send(JSON.stringify({
        type: "request",
        id: job.id,
        path: input.path,
        body: input.body,
        deadline: new Date(input.deadline).toISOString(),
      } satisfies RelayWireMessage));
    } catch {
      this.failJob(job, "node_disconnected", "failed", 502, false);
      this.state.waitUntil(this.markDisconnected(session, "node_disconnected").catch(() => undefined));
    }
    return job.response;
    } finally {
      if (pendingHeld) this.pendingAdmissions--;
      this.pendingRequestIds.delete(input.requestId);
    }
  }

  private receiveJobFrame(job: RelayJob, frame: RelayWireMessage): void {
    if (job.terminal) return;
    const sequence = frame.seq ?? 0;
    if (!Number.isSafeInteger(sequence) || sequence !== job.expectedSeq || job.ended) {
      this.failJob(job, "invalid_node_response", "failed", 502, true);
      return;
    }
    switch (frame.type) {
      case "headers": {
        if (job.headersSeen || !Number.isSafeInteger(frame.status) || frame.status! < 200 || frame.status! > 599
          || !validContentType(frame.contentType)) {
          this.failJob(job, "invalid_node_response", "failed", 502, true);
          return;
        }
        job.expectedSeq++;
        job.headersSeen = true;
        job.bodyForbidden = frame.status === 204 || frame.status === 205 || frame.status === 304;
        job.responseStatus = frame.status!;
        const headers = new Headers(ACCEPTED_HEADER);
        headers.set("Content-Type", frame.contentType);
        headers.set("Cache-Control", "no-store");
        headers.set("X-Content-Type-Options", "nosniff");
        job.resolveResponse(new Response(job.bodyForbidden ? null : job.readable, { status: frame.status, headers }));
        return;
      }
      case "data": {
        const bytes = decodeBase64(frame.data);
        if (!job.headersSeen || job.bodyForbidden || !bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_CHUNK_BYTES) {
          this.failJob(job, "invalid_node_response", "failed", 502, true);
          return;
        }
        job.expectedSeq++;
        job.inflightBytes += bytes.byteLength;
        job.inflightFrames++;
        job.totalBytes += bytes.byteLength;
        if (job.inflightBytes > INITIAL_WINDOW_BYTES || job.inflightFrames > MAX_INFLIGHT_FRAMES) {
          this.failJob(job, "node_flow_control_exceeded", "failed", 502, true);
          return;
        }
        if (job.totalBytes > MAX_RESPONSE_BYTES) {
          this.failJob(job, "response_too_large", "failed", 502, true);
          return;
        }
        job.writeChain = job.writeChain.then(async () => {
          await job.writer.write(bytes);
          if (job.terminal) return;
          job.writtenBytes += bytes.byteLength;
          job.inflightBytes -= bytes.byteLength;
          job.inflightFrames--;
          this.sendToConnection(job.connectionId, { type: "ack", id: job.id, bytes: bytes.byteLength });
        }).catch(() => {
          this.failJob(job, "consumer_disconnected", "cancelled", 499, true);
        });
        return;
      }
      case "end":
        if (!job.headersSeen) {
          this.failJob(job, "invalid_node_response", "failed", 502, true);
          return;
        }
        job.expectedSeq++;
        job.ended = true;
        job.writeChain = job.writeChain.then(async () => {
          await job.writer.close();
          this.completeJob(job);
        }).catch(() => {
          this.failJob(job, "consumer_disconnected", "cancelled", 499, true);
        });
        return;
      case "error":
        job.expectedSeq++;
        job.ended = true;
        job.writeChain = job.writeChain.then(() => {
          this.failJob(job, publicNodeError(frame.code), "failed", 502, false);
        });
        return;
    }
  }

  private completeJob(job: RelayJob): void {
    if (job.terminal) return;
    job.terminal = true;
    job.terminalState = "completed";
    job.terminalCode = "";
    job.terminalStatus = job.responseStatus;
    this.releaseUnsentReservation(job);
    clearTimeout(job.timeout);
    this.jobs.delete(job.id);
    this.state.waitUntil(this.recordTerminal(job, "completed", "", job.responseStatus));
  }

  private failJob(job: RelayJob, code: string, state: "failed" | "cancelled", status: number, notifyNode: boolean): void {
    if (job.terminal) return;
    job.terminal = true;
    job.terminalState = state;
    job.terminalCode = code;
    const auditStatus = job.headersSeen ? job.responseStatus : status;
    job.terminalStatus = auditStatus;
    this.releaseUnsentReservation(job);
    job.ended = true;
    clearTimeout(job.timeout);
    this.jobs.delete(job.id);
    if (notifyNode) this.sendToConnection(job.connectionId, { type: "cancel", id: job.id });
    if (!job.headersSeen) {
      job.resolveResponse(relayError(code, status === 499 ? 502 : status, ACCEPTED_HEADER));
    } else {
      void job.writer.abort(new Error(code)).catch(() => undefined);
    }
    this.state.waitUntil(this.recordTerminal(job, state, code, auditStatus));
  }

  private async recordTerminal(job: RelayJob, state: "completed" | "failed" | "cancelled", code: string, status: number): Promise<void> {
    const finishedAt = Date.now();
    const statements = [
      this.env.DB.prepare(
        `UPDATE relay_requests
            SET state = ?, finished_at = ?, response_status = ?, response_bytes = ?, error_code = ?
          WHERE id = ? AND state = 'running'`,
      ).bind(state, finishedAt, status, job.writtenBytes, code || null, job.id),
    ];
    const session = this.session;
    if (session && session.connectionId === job.connectionId) {
      statements.push(this.env.DB.prepare(
        "UPDATE nodes SET accepting = ? WHERE id = ? AND relay_connection_id = ?",
      ).bind(this.isAvailable(session) ? 1 : 0, session.nodeId, session.connectionId));
    }
    await Promise.all([
      this.env.DB.batch(statements).then(() => undefined),
      releaseAccountSlot(this.env, job.userId, job.id),
    ]);
  }

  private async control(request: Request): Promise<Response> {
    if (request.method !== "POST") return jsonResponse(405, { ok: false, error: "method_not_allowed" });
    const body = await readObject(request);
    if (!body) return jsonResponse(400, { ok: false, error: "invalid_request" });
    if (body.action === "cancel") {
      if (typeof body.requestId !== "string" || body.requestId.length === 0 || body.requestId.length > 80) {
        return jsonResponse(400, { ok: false, error: "invalid_request" });
      }
      const job = this.jobs.get(body.requestId);
      const code = typeof body.code === "string" && body.code.length > 0 && body.code.length <= 80
        ? body.code
        : "request_cancelled";
      if (job) {
        this.failJob(job, code, "cancelled", 499, true);
      } else {
        await this.rememberCancellation(body.requestId, code);
      }
      return jsonResponse(200, { ok: true });
    }
    if (body.disconnect === true && compareAuthGeneration(0, body.authVersion) === "invalid") {
      return jsonResponse(400, { ok: false, error: "invalid_request" });
    }
    const session = this.session;
    if (!session) return jsonResponse(200, { ok: true });
    const generation = compareAuthGeneration(session.authVersion, body.authVersion);
    if (body.disconnect === true) {
      if (generation === "newer") {
        await this.closeSession(session, this.currentSocket(session), 4001, "auth_invalid", "node_disconnected");
        return jsonResponse(200, { ok: true });
      }
      return jsonResponse(200, { ok: true, ignored: generation });
    }
    if (generation === "older") return jsonResponse(200, { ok: true, stale: true });
    if (generation === "newer") {
      await this.closeSession(session, this.currentSocket(session), 4001, "auth_invalid", "node_disconnected");
      return jsonResponse(200, { ok: true });
    }
    if (typeof body.paused === "boolean") session.policyPaused = body.paused;
    if (typeof body.dailyLimit === "number" && Number.isSafeInteger(body.dailyLimit) && body.dailyLimit >= 1 && body.dailyLimit <= 100_000) {
      session.dailyLimit = body.dailyLimit;
    }
    session.updatedAt = Date.now();
    await Promise.all([
      this.state.storage.put(SESSION_KEY, session),
      this.env.DB.prepare("UPDATE nodes SET accepting = ? WHERE id = ? AND relay_connection_id = ?")
        .bind(this.isAvailable(session) ? 1 : 0, session.nodeId, session.connectionId)
        .run(),
    ]);
    return jsonResponse(200, { ok: true });
  }

  private status(request: Request): Response {
    if (request.method !== "GET") return jsonResponse(405, { ok: false, error: "method_not_allowed" });
    const session = this.session;
    return jsonResponse(200, {
      ok: true,
      connected: Boolean(session?.connected && this.currentSocket(session)),
      ready: Boolean(session?.ready),
      available: session ? this.isAvailable(session) : false,
      models: session?.models ?? [],
      inflight: this.jobs.size,
    });
  }

  private parseDispatch(raw: Record<string, unknown> | null): DispatchInput | null {
    if (!raw || typeof raw.requestId !== "string" || raw.requestId.length > 80
      || typeof raw.userId !== "string" || raw.userId.length > 80
      || typeof raw.keyId !== "string" || raw.keyId.length > 80
      || (raw.path !== "/v1/chat/completions" && raw.path !== "/v1/responses")
      || typeof raw.model !== "string" || !MODEL_PATTERN.test(raw.model)
      || !isRecord(raw.body)
      || typeof raw.deadline !== "number" || !Number.isSafeInteger(raw.deadline)
      || raw.deadline <= Date.now() || raw.deadline > Date.now() + REQUEST_TIMEOUT_MS + 5_000) return null;
    return raw as unknown as DispatchInput;
  }

  private currentSocket(session: StoredSession | null = this.session): WebSocket | null {
    if (!session) return null;
    for (const socket of this.state.getWebSockets("node")) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.nodeId === session.nodeId && attachment.connectionId === session.connectionId
        && attachment.authVersion === session.authVersion && socket.readyState === 1) return socket;
    }
    return null;
  }

  private isCurrent(attachment: SocketAttachment | null): boolean {
    return Boolean(attachment && this.session
      && attachment.nodeId === this.session.nodeId
      && attachment.connectionId === this.session.connectionId
      && attachment.authVersion === this.session.authVersion);
  }

  private isSameConnection(session: StoredSession, socket: WebSocket): boolean {
    return this.session === session && session.connected && this.currentSocket(session) === socket;
  }

  private isAvailable(session: StoredSession): boolean {
    return session.connected && session.ready && !session.policyPaused && !session.localPaused
      && session.remaining > this.pendingAdmissions + this.unsentReservations
      && session.used < session.dailyLimit && session.models.length > 0
      && this.jobs.size + this.pendingAdmissions < NODE_CONCURRENCY;
  }

  private releaseUnsentReservation(job: RelayJob): void {
    if (!job.holdsLocalReservation) return;
    job.holdsLocalReservation = false;
    this.unsentReservations = Math.max(0, this.unsentReservations - 1);
  }

  private sendToConnection(connectionId: string, message: RelayWireMessage): boolean {
    const session = this.session;
    if (!session || session.connectionId !== connectionId) return false;
    const socket = this.currentSocket(session);
    if (!socket) {
      this.state.waitUntil(this.markDisconnected(session, "node_disconnected").catch(() => undefined));
      return false;
    }
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      this.state.waitUntil(this.markDisconnected(session, "node_disconnected").catch(() => undefined));
      return false;
    }
  }

  private async closeSession(
    session: StoredSession,
    socket: WebSocket | null,
    code: number,
    reason: string,
    failure: string,
  ): Promise<void> {
    if (this.session !== session) {
      try {
        socket?.close(4003, "connection_replaced");
      } catch {
        // The replacement is already authoritative.
      }
      return;
    }
    try {
      socket?.close(code, reason);
    } catch {
      // The disconnect projection and in-flight failures still need to happen.
    }
    await this.markDisconnected(session, failure);
  }

  private async markDisconnected(session: StoredSession, failure: string): Promise<void> {
    if (this.session !== session || !session.connected) return;
    session.connected = false;
    session.ready = false;
    session.updatedAt = Date.now();
    try {
      await Promise.all([
        this.state.storage.put(SESSION_KEY, session),
        this.env.DB.prepare(
          `UPDATE nodes SET accepting = 0, relay_connection_id = NULL, last_seen_at = ?
            WHERE id = ? AND relay_connection_id = ?`,
        ).bind(session.updatedAt, session.nodeId, session.connectionId).run(),
      ]);
    } finally {
      this.failJobsForConnection(session.connectionId, failure);
    }
  }

  private failJobsForConnection(connectionId: string, code: string): void {
    for (const job of [...this.jobs.values()]) {
      if (job.connectionId === connectionId) this.failJob(job, code, "failed", 502, false);
    }
  }

  private async rollbackReservation(session: StoredSession, reservationDay: string, localApplied: boolean): Promise<void> {
    const databaseRollback = this.env.DB.prepare(
      `UPDATE nodes SET used = CASE WHEN used > 0 THEN used - 1 ELSE 0 END
        WHERE id = ? AND usage_day = ?`,
    ).bind(session.nodeId, reservationDay).run();
    if (!localApplied || this.session !== session || session.usageDay !== reservationDay) {
      await databaseRollback;
      return;
    }
    session.used = Math.max(0, session.used - 1);
    await Promise.all([this.state.storage.put(SESSION_KEY, session), databaseRollback]);
  }

  private async rememberCancellation(requestId: string, code: string): Promise<void> {
    const now = Date.now();
    const tombstone: CancellationTombstone = { code, expiresAt: now + CANCELLATION_TTL_MS };
    const removed = this.cancellations.remember(requestId, tombstone, now);
    await Promise.all([
      this.state.storage.put(CANCELLATION_PREFIX + requestId, tombstone),
      ...removed.map((id) => this.state.storage.delete(CANCELLATION_PREFIX + id)),
    ]);
    await this.scheduleCancellationAlarm(now);
  }

  private takeCancellation(requestId: string): CancellationTombstone | null {
    const now = Date.now();
    const result = this.cancellations.take(requestId, now);
    if (result.removed.length > 0) {
      this.state.waitUntil(Promise.all([
        ...result.removed.map((id) => this.state.storage.delete(CANCELLATION_PREFIX + id)),
        this.scheduleCancellationAlarm(now),
      ]).then(() => undefined).catch(() => undefined));
    }
    return result.tombstone;
  }

  private async pruneCancellations(now: number): Promise<void> {
    const removed = this.cancellations.prune(now);
    await Promise.all(removed.map((id) => this.state.storage.delete(CANCELLATION_PREFIX + id)));
    await this.scheduleCancellationAlarm(now);
  }

  private async scheduleCancellationAlarm(now: number): Promise<void> {
    const next = this.cancellations.nextExpiration();
    if (next === null) {
      await this.state.storage.deleteAlarm();
      return;
    }
    await this.state.storage.setAlarm(Math.max(now + 1_000, next));
  }

  private async reconcileAbandonedRequests(): Promise<void> {
    const session = this.session;
    if (!session) return;
    const result = await this.env.DB.prepare(
      "SELECT id,user_id FROM relay_requests WHERE node_id = ? AND state = 'running'",
    ).bind(session.nodeId).all<RunningRow>();
    if (result.results.length === 0) return;
    const now = Date.now();
    await this.env.DB.prepare(
      `UPDATE relay_requests
          SET state = 'failed', finished_at = ?, response_status = 502, error_code = 'node_restarted'
        WHERE node_id = ? AND state = 'running'`,
    ).bind(now, session.nodeId).run();
    for (const row of result.results) {
      this.state.waitUntil(releaseAccountSlot(this.env, row.user_id, row.id));
    }
  }
}
