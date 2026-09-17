export type PlatformModel = "chat" | "reasoning" | "code";

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  revoked: boolean;
  createdAt: string;
};

export type ContributionNode = {
  id: string;
  name: string;
  model: PlatformModel;
  budget: number;
  reserve: number;
  schedule: "spare" | "anytime";
  paused: boolean;
  used: number;
  day: string;
  modelId: string;
  models: string[];
  deviceId: string | null;
  online: boolean;
  lastSeenAt: string | null;
  keyPrefix: string | null;
  keyRevoked: boolean;
};

export type LedgerEntry = {
  id: string;
  at: string;
  kind: "grant" | "consume" | "contribute";
  source: "official" | "community";
  freeDelta: number;
  creditDelta: number;
};

export type PlatformState = {
  version: 1;
  userId: string;
  free: number;
  credits: number;
  cliKey: { prefix: string; createdAt: string; key: string | null } | null;
  keys: ApiKey[];
  nodes: ContributionNode[];
  entries: LedgerEntry[];
};

export type PlatformAction =
  | { action: "ensure_cli_key" | "issue_cli_key" | "revoke_cli_key"; expectedUserId: string }
  | { action: "create_key"; name: string }
  | { action: "revoke_key"; id: string }
  | { action: "create_node"; name: string; modelId: string; budget: number }
  | { action: "update_node"; id: string; budget: number }
  | { action: "toggle_node" | "issue_node_key" | "revoke_node_key"; id: string };

export type PlatformErrorCode =
  | "backend_error"
  | "unauthorized"
  | "account_changed"
  | "invalid_request"
  | "item_limit"
  | "not_found";

export type PlatformResponse =
  | { ok: true; state: PlatformState; createdKey?: string; createdCLIKey?: string; createdNodeKey?: { nodeId: string; key: string } }
  | { ok: false; error: PlatformErrorCode };
