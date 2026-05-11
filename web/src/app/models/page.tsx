"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import modelLeaderboardsJson from "@/data/modelleaderboards.json";
import { resolveVendorIcon } from "@/lib/vendor-icon";

type LeaderboardTab =
  | "capability"
  | "value"
  | "reasoning"
  | "coding"
  | "stability"
  | "speed";

type BenchScore = {
  overall: number;
  reasoning: number;
  coding: number;
  toolUse: number;
  stability: number;
  speed: number;
};

type BenchModel = {
  model: string;
  provider: string;
  apiStyle: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputUsdPerM?: number;
  outputUsdPerM?: number;
  cacheReadUsdPerM?: number;
  bench: BenchScore;
  notes?: string;
};

type RankedRow = BenchModel & {
  rank: number;
  valueScore: number;
  blendedCost: number;
};

const models = modelLeaderboardsJson as BenchModel[];
const PRICE_ALIGN_CLASS = "text-right font-mono tabular-nums";
const tabs: { key: LeaderboardTab; label: string }[] = [
  { key: "capability", label: "能力排行榜" },
  { key: "value", label: "性价比排行榜" },
  { key: "reasoning", label: "推理能力榜" },
  { key: "coding", label: "编码能力榜" },
  { key: "stability", label: "稳定性榜" },
  { key: "speed", label: "速度榜" },
];

function formatPricePerM(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `$${value.toFixed(3)}`;
}

function formatScore(value: number) {
  return value.toFixed(1);
}

function blendedCost(item: BenchModel) {
  const input = item.inputUsdPerM ?? 0;
  const output = item.outputUsdPerM ?? 0;
  const cache = item.cacheReadUsdPerM ?? 0;
  return input * 0.45 + output * 0.5 + cache * 0.05;
}

function buildRanking(
  items: BenchModel[],
  score: (item: BenchModel) => number,
): RankedRow[] {
  return [...items]
    .map((item) => {
      const cost = blendedCost(item);
      return {
        ...item,
        rank: 0,
        blendedCost: cost,
        valueScore: cost > 0 ? item.bench.overall / cost : 0,
      };
    })
    .sort((a, b) => score(b) - score(a))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export default function ModelsPage() {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("capability");

  const rankings = useMemo(
    () => ({
      capability: buildRanking(models, (item) => item.bench.overall),
      value: buildRanking(models, (item) => {
        const cost = blendedCost(item);
        return cost > 0 ? item.bench.overall / cost : 0;
      }),
      reasoning: buildRanking(models, (item) => item.bench.reasoning),
      coding: buildRanking(models, (item) => item.bench.coding),
      stability: buildRanking(models, (item) => item.bench.stability),
      speed: buildRanking(models, (item) => item.bench.speed),
    }),
    [],
  );

  const rows = rankings[activeTab];

  return (
    <div className="page-wrap flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
        <section className="panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="panel-body flex min-h-0 flex-1 flex-col">
            <div className="mb-4">
              <h1 className="text-xl font-semibold tracking-tight">Model Leaderboard</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                单一 JSON 数据源（bench 维度）生成：能力、性价比、推理、编码、稳定性、速度排行榜。
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

              {tabs.map((tab) => (
                <TabsContent key={tab.key} value={tab.key} className="mt-3 min-h-0 flex-1">
                  <div className="table-wrap min-h-0 flex-1">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="sticky top-0 z-20 bg-background">排名</th>
                          <th className="sticky top-0 z-20 bg-background">模型</th>
                          <th className="sticky top-0 z-20 bg-background">供应商</th>
                          <th className="sticky top-0 z-20 bg-background">API 风格</th>
                          <th className="sticky top-0 z-20 bg-background text-right">综合分</th>
                          <th className="sticky top-0 z-20 bg-background text-right">推理</th>
                          <th className="sticky top-0 z-20 bg-background text-right">编码</th>
                          <th className="sticky top-0 z-20 bg-background text-right">稳定性</th>
                          <th className="sticky top-0 z-20 bg-background text-right">速度</th>
                          <th className="sticky top-0 z-20 bg-background text-right">性价比分</th>
                          <th className="sticky top-0 z-20 bg-background text-right">输入价</th>
                          <th className="sticky top-0 z-20 bg-background text-right">输出价</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((item) => (
                          <tr key={`${tab.key}-${item.provider}-${item.model}`}>
                            <td>#{item.rank}</td>
                            <td className="font-medium">{item.model}</td>
                            <td>
                              <div className="flex items-center gap-2">
                                {resolveVendorIcon("", item.provider, item.model) ? (
                                  <img
                                    src={resolveVendorIcon("", item.provider, item.model)}
                                    alt={item.provider}
                                    className="h-4 w-4 rounded-sm dark:invert"
                                  />
                                ) : null}
                                <span>{item.provider}</span>
                              </div>
                            </td>
                            <td>{item.apiStyle}</td>
                            <td className={PRICE_ALIGN_CLASS}>{formatScore(item.bench.overall)}</td>
                            <td className={PRICE_ALIGN_CLASS}>{formatScore(item.bench.reasoning)}</td>
                            <td className={PRICE_ALIGN_CLASS}>{formatScore(item.bench.coding)}</td>
                            <td className={PRICE_ALIGN_CLASS}>{formatScore(item.bench.stability)}</td>
                            <td className={PRICE_ALIGN_CLASS}>{formatScore(item.bench.speed)}</td>
                            <td className={PRICE_ALIGN_CLASS}>{formatScore(item.valueScore)}</td>
                            <td className={PRICE_ALIGN_CLASS}>{formatPricePerM(item.inputUsdPerM)}</td>
                            <td className={PRICE_ALIGN_CLASS}>{formatPricePerM(item.outputUsdPerM)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </section>
      </div>
    </div>
  );
}
