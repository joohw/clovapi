export type PlatformModel = "chat" | "reasoning" | "code";

export interface APIKeyView {
  id: string;
  name: string;
  prefix: string;
  revoked: boolean;
  createdAt: string;
}

export interface ContributionNodeView {
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
}

export interface LedgerEntryView {
  id: string;
  at: string;
  kind: "grant" | "consume" | "contribute";
  source: "official" | "community";
  freeDelta: number;
  creditDelta: number;
}

export interface PlatformState {
  version: 1;
  userId: string;
  free: number;
  credits: number;
  cliKey: { prefix: string; createdAt: string; key: string | null } | null;
  keys: APIKeyView[];
  nodes: ContributionNodeView[];
  entries: LedgerEntryView[];
}

export type PlatformAction =
  | { action: "ensure_cli_key" | "issue_cli_key" | "revoke_cli_key"; expectedUserId: string }
  | { action: "create_key"; name: string }
  | { action: "revoke_key"; id: string }
  | { action: "create_node"; name: string; modelId: string; budget: number }
  | { action: "update_node"; id: string; budget: number }
  | { action: "toggle_node" | "issue_node_key" | "revoke_node_key"; id: string };

export interface ActionResult {
  createdKey?: string;
  createdCLIKey?: string;
  createdNodeKey?: { nodeId: string; key: string };
}
