"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import agentsLeaderboardJson from "@/data/agentsleaderboard.json";
import { resolveVendorIcon } from "@/lib/vendor-icon";

type LeaderboardTab =
  | "overall"
  | "value"
  | "office"
  | "coding"
  | "research"
  | "toolUse"
  | "reliability"
  | "speed";

type AgentBenchScore = {
  overall: number | null;
  office: number | null;
  coding: number | null;
  research: number | null;
  toolUse: number | null;
  reliability: number | null;
  speed: number | null;
};

type BenchSource = {
  bench: string;
  metric: string;
  url: string;
};

type AgentLeaderboardItem = {
  agent: string;
  provider: string;
  runtime: string;
  bench: AgentBenchScore;
  sources: {
    overall: BenchSource | null;
    office: BenchSource | null;
    coding: BenchSource | null;
    research: BenchSource | null;
    toolUse: BenchSource | null;
    reliability: BenchSource | null;
    speed: BenchSource | null;
  };
};

type AgentLeaderboardDataset = {
  benchmarks: unknown[];
  agents: AgentLeaderboardItem[];
};

type RankedRow = AgentLeaderboardItem & {
  rank: number;
  valueScore: number | null;
};

const ALIGN_CLASS = "text-right font-mono tabular-nums";
const tabs: { key: LeaderboardTab; label: string }[] = [
  { key: "overall", label: "综合榜" },
  { key: "value", label: "性价比榜" },
  { key: "office", label: "办公效率榜" },
  { key: "coding", label: "代码能力榜" },
  { key: "research", label: "研究分析榜" },
  { key: "toolUse", label: "工具调用榜" },
  { key: "reliability", label: "稳定性榜" },
  { key: "speed", label: "速度榜" },
];

function formatScore(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toFixed(1);
}

function averageAvailable(values: Array<number | null>): number | null {
  const usable = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!usable.length) return null;
  const sum = usable.reduce((acc, cur) => acc + cur, 0);
  return sum / usable.length;
}

function computeValueScore(item: AgentLeaderboardItem): number | null {
  return averageAvailable([
    item.bench.office,
    item.bench.coding,
    item.bench.research,
    item.bench.toolUse,
    item.bench.reliability,
    item.bench.speed,
  ]);
}

function metricForTab(item: RankedRow, tab: LeaderboardTab): number | null {
  if (tab === "value") return item.valueScore;
  return item.bench[tab];
}

function buildRanking(items: AgentLeaderboardItem[], tab: LeaderboardTab): RankedRow[] {
  return [...items]
    .map((item) => ({
      ...item,
      rank: 0,
      valueScore: computeValueScore(item),
    }))
    .filter((item) => metricForTab(item, tab) !== null)
    .sort((a, b) => (metricForTab(b, tab) ?? -1) - (metricForTab(a, tab) ?? -1))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export default function AgentsPage() {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("overall");
  const dataset = agentsLeaderboardJson as AgentLeaderboardDataset;
  const agents = dataset.agents || [];

  const rankings = useMemo(
    () => ({
      overall: buildRanking(agents, "overall"),
      value: buildRanking(agents, "value"),
      office: buildRanking(agents, "office"),
      coding: buildRanking(agents, "coding"),
      research: buildRanking(agents, "research"),
      toolUse: buildRanking(agents, "toolUse"),
      reliability: buildRanking(agents, "reliability"),
      speed: buildRanking(agents, "speed"),
    }),
    [agents],
  );
  return (
    <div className="page-wrap flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
        <section className="panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="panel-body flex min-h-0 flex-1 flex-col">
            <div className="mb-4">
              <h1 className="text-xl font-semibold tracking-tight">Agent Leaderboard</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                仅展示基于公开 benchmark 的可追溯分数；来源链接见 agents-benchmark-sources.md。
              </p>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as LeaderboardTab)}
              className="min-h-0 flex-1"
            >
              <TabsList variant="line" className="w-fit p-0">
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.key} value={tab.key} className="px-3">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {tabs.map((tab) => {
                const tabRows = rankings[tab.key];
                return (
                <TabsContent key={tab.key} value={tab.key} className="mt-3 min-h-0 flex-1">
                  {!tabRows.length ? (
                    <div className="rounded-md border border-border/70 bg-card px-4 py-8 text-sm text-muted-foreground">
                      暂无可展示智能体得分。请在 <code className="font-mono">agentsleaderboard.json</code> 的 <code className="font-mono">agents</code> 中填入带来源链接的权威 benchmark 结果。
                    </div>
                  ) : null}
                  <div className="table-wrap min-h-0 flex-1">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="sticky top-0 z-20 bg-background">排名</th>
                          <th className="sticky top-0 z-20 bg-background">智能体</th>
                          <th className="sticky top-0 z-20 bg-background">供应商</th>
                          <th className="sticky top-0 z-20 bg-background">运行形态</th>
                          <th className="sticky top-0 z-20 bg-background text-right">综合分</th>
                          <th className="sticky top-0 z-20 bg-background text-right">办公</th>
                          <th className="sticky top-0 z-20 bg-background text-right">代码</th>
                          <th className="sticky top-0 z-20 bg-background text-right">研究</th>
                          <th className="sticky top-0 z-20 bg-background text-right">工具调用</th>
                          <th className="sticky top-0 z-20 bg-background text-right">稳定性</th>
                          <th className="sticky top-0 z-20 bg-background text-right">速度</th>
                          <th className="sticky top-0 z-20 bg-background text-right">性价比分</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tabRows.map((item) => (
                          <tr key={`${tab.key}-${item.provider}-${item.agent}`}>
                            <td>#{item.rank}</td>
                            <td className="font-medium">{item.agent}</td>
                            <td>
                              <div className="flex items-center gap-2">
                                {resolveVendorIcon("", item.provider, item.agent) ? (
                                  <img
                                    src={resolveVendorIcon("", item.provider, item.agent)}
                                    alt={item.provider}
                                    className="h-4 w-4 rounded-sm dark:invert"
                                  />
                                ) : null}
                                <span>{item.provider}</span>
                              </div>
                            </td>
                            <td>{item.runtime}</td>
                            <td className={ALIGN_CLASS}>{formatScore(item.bench.overall)}</td>
                            <td className={ALIGN_CLASS}>{formatScore(item.bench.office)}</td>
                            <td className={ALIGN_CLASS}>{formatScore(item.bench.coding)}</td>
                            <td className={ALIGN_CLASS}>{formatScore(item.bench.research)}</td>
                            <td className={ALIGN_CLASS}>{formatScore(item.bench.toolUse)}</td>
                            <td className={ALIGN_CLASS}>{formatScore(item.bench.reliability)}</td>
                            <td className={ALIGN_CLASS}>{formatScore(item.bench.speed)}</td>
                            <td className={ALIGN_CLASS}>{formatScore(item.valueScore)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
                );
              })}
            </Tabs>
          </div>
        </section>
      </div>
    </div>
  );
}
