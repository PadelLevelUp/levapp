export interface ShardFile {
  warmup?: string;
  starts: string[];
  chains?: string[][];
}
export declare const EXCLUDED_TAGS: string[];
export declare function parseFlowsOrder(configText: string): string[];
export declare function isExcluded(flowText: string): boolean;
export declare function runnableSuite(order: string[], flows: Record<string, string>): string[];
export declare function planShards(suite: string[], starts: string[]): string[][];
export declare function checkShards(suite: string[], shardFile: ShardFile, flows: Record<string, string>): string[];
export declare function shardFlows(suite: string[], shardFile: ShardFile, k: number | "changed", changed?: string[]): string[];
export declare function changedFlows(suite: string[], paths: string[]): string[];
export declare function shardMatrix(shardFile: ShardFile, opts: { full: boolean; changed: boolean }): string[];
export declare function shardConfig(names: string[]): string;
export declare function readWorkspace(maestroDir: string): {
  order: string[];
  shardFile: ShardFile;
  flows: Record<string, string>;
  suite: string[];
};
export declare function currentFlow(logText: string): string | null;
export interface WatchdogState {
  startedAt: number;
  flow: string | null;
  flowSince: number;
}
export declare function watchdogStep(
  state: WatchdogState | null,
  flow: string | null,
  now: number,
  limits: { flowLimitMs: number; shardBudgetMs: number }
): { state: WatchdogState; stop: string | null };
export interface ShardResult {
  shard: string;
  missing: boolean;
  rc: number | null;
  expected: number | null;
  finished: number | null;
  stop: string;
  failed: { flow: string; reason: string }[];
}
export declare function readShardResults(dir: string, shards: string[]): ShardResult[];
export declare function laneVerdict(
  results: ShardResult[],
  opts: { experimental: boolean; recentGreens: number }
): { conclusion: "success" | "neutral" | "failure"; title: string; summary: string; strict: boolean };
