// Wickfleet: the hub behind the same origin lists the bots this login may
// see. Each one is logged in automatically; the hub injects the bot's key,
// so the credentials sent here are placeholders.
import { ofetch } from 'ofetch';
import type { Spec } from './strategySpec';

export interface DraftJob {
  id: string;
  state: 'running' | 'done' | 'failed';
  error?: string;
  result?: { spec: Spec; describe: string; provider: string; attempts: number; seconds: number };
}

export interface SpecSummary {
  name: string;
  description?: string;
  author?: string;
  timeframe: string;
  model: boolean;
  used_by: string[];
  editable: boolean;
}

export interface HubBot {
  name: string;
  owner: string;
  strategy: string;
  strategy_file?: string;
  exchange: string;
  pairs: string[];
  stake_currency: string;
  wallet: number;
  max_open_trades: number;
  fee?: number;
  fiat?: string;
  image?: string;
  mem_limit?: string;
  url: string;
  editable: boolean;
}

export interface HubBots {
  bots: HubBot[];
  role: 'viewer' | 'operator' | 'admin' | 'none';
  user: string;
  images: string[];
}

export interface FleetBot {
  name: string;
  owner: string;
  dry: boolean;
  stake: string;
  investment: number;
  value: number;
  profit_net: number;
  fees: number;
  profit_gross: number;
  return_pct: number;
  trades: number;
  closed: number;
  fee_per_trade: number;
  error?: string;
}

export interface FleetTotals {
  dry: boolean;
  stake: string;
  bots: number;
  investment: number;
  value: number;
  profit_net: number;
  fees: number;
  profit_gross: number;
  return_pct: number;
  trades: number;
}

export interface FleetReport {
  at: string;
  bots: FleetBot[];
  totals: FleetTotals[];
}

export interface Signal {
  symbol: string;
  month: string;
  hold: boolean;
  close: number;
  sma10m: number;
  gap: number;
  error?: string;
}

/** A watched Yahoo symbol: ETF, stock, crypto (BTC-USD), FX (CADUSD=X). */
export interface Watch {
  symbol: string;
  note?: string;
}

// One entry rule of a bot on a pair's last closed candle (/hub/api/watch).
export interface WaitingRule {
  bot: string;
  owner: string;
  pair: string;
  rule: string;
  date?: string;
  met: boolean;
  left: number;
  right: number;
  gap: number;
  error?: string;
}

export interface Watchlist {
  symbols: Watch[];
  editable: boolean;
}

export interface ReplaySummary {
  strategy: string;
  stake: string;
  start: string;
  end: string;
  trades: number;
  wins: number;
  losses: number;
  start_balance: number;
  final_balance: number;
  profit_net: number;
  profit_pct: number;
  fees: number;
  profit_gross: number;
  max_drawdown: number;
  max_drawdown_pct: number;
  market_pct: number;
}

export interface ReplayJob {
  id: string;
  kind: 'replay' | 'fetch';
  owner: string;
  bot: string;
  exchange: string;
  pairs: string[];
  strategy?: string;
  from?: string;
  to?: string;
  state: 'queued' | 'downloading' | 'testing' | 'done' | 'failed';
  note?: string;
  error?: string;
  created: string;
  started?: string;
  finished?: string;
  summary?: ReplaySummary;
  bias?: ReplayBias;
  robust?: ReplayRobust;
}

/** freqtrade's lookahead and recursive analysis of the replayed strategy. */
export interface ReplayBias {
  lookahead: 'clean' | 'biased' | 'inconclusive' | 'skipped';
  signals?: number;
  indicators?: string;
  recursive: 'clean' | 'variance' | 'skipped';
  note?: string;
}

export interface ReplayWindow {
  from: string;
  to: string;
  trades: number;
  profit_pct: number;
}

export interface ReplayMonteCarlo {
  runs: number;
  median_return_pct: number;
  p5_return_pct: number;
  median_drawdown_pct: number;
  p95_drawdown_pct: number;
  ruin_pct: number;
  judged: boolean;
}

/** Walk-forward and Monte Carlo verdict; it gates live, warns on dry runs. */
export interface ReplayRobust {
  pass: boolean;
  reasons?: string[];
  windows: ReplayWindow[];
  profitable: number;
  worst_pct: number;
  vs_hold_pct: number;
  monte_carlo?: ReplayMonteCarlo;
}

export interface ReplayTrade {
  pair: string;
  open: string;
  close: string;
  open_rate: number;
  close_rate: number;
  stake: number;
  profit_net: number;
  profit_pct: number;
  fee: number;
  exit_reason: string;
}

export interface ReplayList {
  enabled: boolean;
  since?: string;
  /** Start per exchange, lower case; overrides since. */
  since_by_exchange?: Record<string, string>;
  can_run: boolean;
  jobs: ReplayJob[];
}

/** One bot's replay in a comparison. Missing fields are not in the replay result. */
export interface CompareMetrics {
  stake: string;
  /** Money fields are missing for viewers: the hub leaves them out. */
  start_balance?: number;
  final_balance?: number;
  profit_pct: number;
  profit_abs?: number;
  market_pct: number;
  max_drawdown_pct: number;
  sharpe?: number;
  sortino?: number;
  calmar?: number;
  profit_factor?: number;
  win_rate_pct?: number;
  trades: number;
  avg_duration_s?: number;
  windows: number;
  windows_passed: number;
  mc_p95_drawdown_pct?: number;
  mc_ruin_pct?: number;
  mc_judged: boolean;
  verdict: 'pass' | 'fail' | 'biased' | 'unknown';
  reasons?: string[];
}

export interface EquityPoint {
  date: string;
  equity?: number;
  return_pct: number;
}

export interface CompareRow {
  bot: string;
  owner: string;
  exchange: string;
  strategy: string;
  dry: boolean;
  replay?: string;
  state: 'waiting' | ReplayJob['state'];
  note?: string;
  error?: string;
  metrics?: CompareMetrics;
  equity?: EquityPoint[];
}

export interface Comparison {
  id: string;
  owner: string;
  from: string;
  to: string;
  state: 'running' | 'done' | 'failed';
  error?: string;
  created: string;
  finished?: string;
  bots: CompareRow[];
  /** Viewer view: no balances, absolute profit or equity values. */
  redacted?: boolean;
}

export interface CompareList {
  enabled: boolean;
  demo: boolean;
  can_run: boolean;
  max_bots: number;
  comparisons: Comparison[];
}

/** Live risk of one bot. Money fields are missing for viewers. */
export interface RiskBot {
  name: string;
  owner: string;
  dry: boolean;
  stake: string;
  open_trades: number;
  max_open_trades: number;
  at_stake?: number;
  value?: number;
  drawdown_pct: number;
  max_drawdown_pct: number;
  of_worst_pct?: number;
  error?: string;
}

export interface RiskPosition {
  bot: string;
  owner: string;
  dry: boolean;
  stake: string;
  pair: string;
  coin: string;
  amount?: number;
  at_stake?: number;
  value?: number;
  profit_pct: number;
  stop_dist_pct?: number;
  open_date?: string;
}

export interface RiskTotals {
  dry: boolean;
  stake: string;
  bots: number;
  open_trades: number;
  at_stake: number;
  value: number;
}

export interface RiskPair {
  pair: string;
  dry: boolean;
  stake: string;
  bots: string[];
  trades: number;
  at_stake: number;
  value: number;
  share_pct?: number;
}

export interface RiskCoin {
  coin: string;
  dry: boolean;
  bots: string[];
  trades: number;
  amount: number;
  at_stake: Record<string, number>;
  value: Record<string, number>;
}

export interface RiskReport {
  at: string;
  redacted: boolean;
  bots: RiskBot[];
  positions: RiskPosition[];
  totals?: RiskTotals[];
  pairs?: RiskPair[];
  coins?: RiskCoin[];
  overlap: { pair: string; bots: string[]; open: string[] }[];
}

export type BotInput = Partial<
  Pick<
    HubBot,
    | 'owner'
    | 'strategy'
    | 'strategy_file'
    | 'exchange'
    | 'pairs'
    | 'stake_currency'
    | 'wallet'
    | 'max_open_trades'
    | 'fee'
    | 'fiat'
    | 'image'
    | 'mem_limit'
  >
>;

const hubAvailable = ref(false);
const hubRole = ref<HubBots['role']>('none');
const hubUser = ref('');
let syncing: Promise<void> | null = null;

const botUrl = (name: string) => `${window.location.origin}/bots/${name}`;

/** What to change so the bot list matches the hub. Bots on other origins stay. */
export function planSync(
  origin: string,
  hubBots: Pick<HubBot, 'name'>[],
  have: { botId: string; botUrl: string }[],
): { add: string[]; remove: string[] } {
  const prefix = `${origin}/bots/`;
  const want = new Set(hubBots.map((b) => `${prefix}${b.name}`));
  const remove = have
    .filter((b) => b.botUrl.startsWith(prefix) && !want.has(b.botUrl))
    .map((b) => b.botId);
  const haveUrls = new Set(have.map((b) => b.botUrl));
  const add = hubBots.filter((b) => !haveUrls.has(`${prefix}${b.name}`)).map((b) => b.name);
  return { add, remove };
}

export const hubApi = {
  bots: () => ofetch<HubBots>('/hub/api/bots'),
  strategies: () => ofetch<{ strategies: string[] }>('/hub/api/strategies'),
  fleet: () => ofetch<FleetReport>('/hub/api/fleet'),
  waiting: () => ofetch<WaitingRule[]>('/hub/api/watch'),
  signals: () => ofetch<{ rule: string; signals: Signal[] }>('/hub/api/signals'),
  // The custom header forces a CORS preflight; the hub refuses writes without it.
  save: (name: string, body: BotInput) =>
    ofetch(`/hub/api/bots/${name}`, {
      method: 'PUT',
      body,
      headers: { 'X-Wickfleet-Request': '1' },
    }),
  remove: (name: string) =>
    ofetch(`/hub/api/bots/${name}`, {
      method: 'DELETE',
      headers: { 'X-Wickfleet-Request': '1' },
    }),
  replays: () => ofetch<ReplayList>('/hub/api/replays'),
  replay: (id: string) =>
    ofetch<{ job: ReplayJob; trades?: ReplayTrade[] }>(`/hub/api/replays/${id}`),
  startReplay: (body: { bot?: string; draft?: BotInput; from: string; to: string }) =>
    ofetch<{ id: string; state: string }>('/hub/api/replays', {
      method: 'POST',
      body,
      headers: { 'X-Wickfleet-Request': '1' },
    }),
  compareList: () => ofetch<CompareList>('/hub/api/compare'),
  compare: (id: string) => ofetch<Comparison>(`/hub/api/compare/${id}`),
  startCompare: (body: { bots?: string[]; all?: boolean; from: string; to: string }) =>
    ofetch<{ id: string; state: string }>('/hub/api/compare', {
      method: 'POST',
      body,
      headers: { 'X-Wickfleet-Request': '1' },
    }),
  risk: () => ofetch<RiskReport>('/hub/api/risk'),
  specs: () =>
    ofetch<{ specs: SpecSummary[]; can_create: boolean; can_draft?: boolean }>('/hub/api/specs'),
  draftStart: (sentence: string) =>
    ofetch<DraftJob>('/hub/api/specs/draft', {
      method: 'POST',
      body: { sentence },
      headers: { 'X-Wickfleet-Request': '1' },
    }),
  draftGet: (id: string) => ofetch<DraftJob>(`/hub/api/specs/draft/${id}`),
  spec: (name: string) =>
    ofetch<{ spec: Spec; describe: string; python: string; used_by: string[]; editable: boolean }>(
      `/hub/api/specs/${name}`,
    ),
  checkSpec: (spec: Spec) =>
    ofetch<{ ok: boolean; describe: string; python: string }>('/hub/api/specs/check', {
      method: 'POST',
      body: spec,
      headers: { 'X-Wickfleet-Request': '1' },
    }),
  saveSpec: (spec: Spec) =>
    ofetch<{ result: string; note?: string }>(`/hub/api/specs/${spec.name}`, {
      method: 'PUT',
      body: spec,
      headers: { 'X-Wickfleet-Request': '1' },
    }),
  deleteSpec: (name: string) =>
    ofetch(`/hub/api/specs/${name}`, {
      method: 'DELETE',
      headers: { 'X-Wickfleet-Request': '1' },
    }),
  watchlist: () => ofetch<Watchlist>('/hub/api/watchlist'),
  saveWatchlist: (symbols: Watch[]) =>
    ofetch<{ result: string; note?: string }>('/hub/api/watchlist', {
      method: 'PUT',
      body: { symbols },
      headers: { 'X-Wickfleet-Request': '1' },
    }),
};

async function doSync() {
  let hub: HubBots;
  try {
    hub = await hubApi.bots();
  } catch {
    hubAvailable.value = false;
    return;
  }
  // A static host answers every path with index.html; only a real hub list counts.
  if (!hub || typeof hub !== 'object' || !Array.isArray(hub.bots)) {
    hubAvailable.value = false;
    return;
  }
  hubAvailable.value = true;
  hubRole.value = hub.role;
  hubUser.value = hub.user;
  const botStore = useBotStore();
  const plan = planSync(window.location.origin, hub.bots, Object.values(botStore.availableBots));
  plan.remove.forEach((botId) => botStore.removeBot(botId));
  let sortId = Object.keys(botStore.availableBots).length;
  for (const name of plan.add) {
    const url = botUrl(name);
    const botId = botStore.nextBotId;
    try {
      await useLoginInfo(botId).login({
        botName: name,
        url,
        username: 'wickfleet',
        password: 'wickfleet',
      });
    } catch (e) {
      console.warn(`wickfleet: login to ${name} failed`, e);
      continue;
    }
    sortId += 1;
    botStore.addBot({ botName: name, botId, botUrl: url, sortId });
  }
  if (!botStore.selectedBot) botStore.selectFirstBot();
}

/** Bring the bot list in line with the hub. Safe to call often. */
export function syncHubBots(): Promise<void> {
  if (!syncing) {
    syncing = doSync().finally(() => {
      syncing = null;
    });
  }
  return syncing;
}

export function useWickfleet() {
  return { hubAvailable, hubRole, hubUser, syncHubBots, hubApi };
}
