import { test, expect, type Page, type Request } from '@playwright/test';
import { defaultMocks } from './helpers';

// SCREENSHOTS=<dir> also writes <page>-<width>.png there. The e2e tsconfig has no node types.
declare const process: { env: Record<string, string | undefined> };

async function shot(page: Page, name: string) {
  const dir = process.env.SCREENSHOTS;
  if (!dir) return;
  await page.screenshot({
    path: `${dir}/${name}-${page.viewportSize()?.width}.png`,
    fullPage: true,
  });
}

const bot = (name: string, owner: string, editable: boolean) => ({
  name,
  owner,
  strategy: 'EmaCross',
  strategy_file: 'EmaCross.py',
  exchange: 'binance',
  pairs: ['BTC/USDT'],
  stake_currency: 'USDT',
  wallet: 1000,
  max_open_trades: 3,
  url: `/bots/${name}`,
  editable,
});

type Role = 'admin' | 'operator' | 'viewer';

async function hub(page: Page, role: Role, user = 'alice') {
  await defaultMocks(page);
  await page.route('**/bots/*/api/v1/token/login', (route) =>
    route.fulfill({ json: { access_token: 'jwt-access', refresh_token: 'jwt-refresh' } }),
  );
  const mine = role !== 'viewer';
  await page.route('**/hub/api/bots', (route) =>
    route.fulfill({
      json: {
        role,
        user,
        images: ['freqtrade'],
        bots: [
          bot('ema-majors', user, mine),
          bot('rsi-majors', user, mine),
          bot('ema-btc', user, mine),
        ],
      },
    }),
  );
}

const days = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'];
const curve = (r: number[]) =>
  days.map((date, i) => ({ date, equity: 1000 * (1 + r[i]! / 100), return_pct: r[i]! }));
const metrics = (over: Record<string, unknown>) => ({
  stake: 'USDT',
  start_balance: 1000,
  final_balance: 1000,
  profit_pct: 0,
  profit_abs: 0,
  market_pct: 12.5,
  max_drawdown_pct: 0,
  trades: 0,
  windows: 12,
  windows_passed: 0,
  mc_judged: false,
  verdict: 'fail',
  ...over,
});

const done = {
  id: 'c20260111-1',
  owner: 'alice',
  from: '2026-01-01',
  to: '2026-01-04',
  state: 'done',
  created: '2026-01-11T10:00:00Z',
  bots: [
    {
      bot: 'ema-majors',
      owner: 'alice',
      exchange: 'binance',
      strategy: 'EmaCross',
      dry: true,
      replay: 'r1',
      state: 'done',
      metrics: metrics({
        final_balance: 1094.6,
        profit_pct: 9.46,
        profit_abs: 94.6,
        max_drawdown_pct: 12.26,
        sharpe: 1.21,
        sortino: 2.4,
        profit_factor: 1.8,
        win_rate_pct: 60,
        trades: 5,
        avg_duration_s: 2646960,
        windows_passed: 7,
        mc_p95_drawdown_pct: 18.5,
        mc_ruin_pct: 0.4,
        mc_judged: true,
        verdict: 'pass',
      }),
      equity: curve([0, 2, 5, 9.46]),
    },
    {
      bot: 'rsi-majors',
      owner: 'alice',
      exchange: 'binance',
      strategy: 'RsiReversion',
      dry: true,
      replay: 'r2',
      state: 'done',
      // One trade: freqtrade has no Sharpe or Sortino for it.
      metrics: metrics({
        final_balance: 949.9,
        profit_pct: -5.01,
        profit_abs: -50.1,
        max_drawdown_pct: 5.01,
        profit_factor: 0,
        win_rate_pct: 0,
        trades: 1,
        avg_duration_s: 3600 * 30,
        mc_p95_drawdown_pct: 5.01,
        mc_ruin_pct: 0,
        reasons: ['loses money over the replay (-5.01%)'],
      }),
      equity: curve([0, 0, -5.01, -5.01]),
    },
    {
      bot: 'ema-btc',
      owner: 'alice',
      exchange: 'binance',
      strategy: 'EmaCross',
      dry: true,
      replay: 'r3',
      state: 'failed',
      error: 'backtest: exit 2: No data found',
    },
  ],
};
const running = {
  ...done,
  state: 'running',
  bots: done.bots.map((b, i) =>
    i === 0
      ? b
      : {
          ...b,
          state: i === 1 ? 'testing' : 'waiting',
          metrics: undefined,
          equity: undefined,
          error: undefined,
        },
  ),
};

// What a viewer gets: the hub leaves out balances, absolute profit and equity values.
const hidden = {
  ...done,
  redacted: true,
  bots: done.bots.map((b) => ({
    ...b,
    metrics: b.metrics && {
      ...b.metrics,
      start_balance: undefined,
      final_balance: undefined,
      profit_abs: undefined,
    },
    equity: b.equity?.map(({ date, return_pct }) => ({ date, return_pct })),
  })),
};

async function compareMocks(
  page: Page,
  opts: { canRun: boolean; demo?: boolean; comparisons: unknown[] },
  posts: Request[] = [],
) {
  let started = false;
  let polls = 0;
  await page.route('**/hub/api/compare', (route) => {
    if (route.request().method() === 'POST') {
      posts.push(route.request());
      started = true;
      return route.fulfill({ status: 202, json: { id: done.id, state: 'running' } });
    }
    const list = started ? [polls > 0 ? done : running] : opts.comparisons;
    return route.fulfill({
      json: {
        enabled: !opts.demo,
        demo: !!opts.demo,
        can_run: opts.canRun,
        max_bots: 12,
        comparisons: list,
      },
    });
  });
  await page.route('**/hub/api/compare/*', (route) => {
    const out = started ? (polls++ === 0 ? running : done) : (opts.comparisons[0] ?? done);
    return route.fulfill({ json: out });
  });
}

test.describe('Wickfleet compare', () => {
  test('an owner compares bots with one POST and sees them lined up', async ({ page }) => {
    const posts: Request[] = [];
    await hub(page, 'operator');
    await compareMocks(page, { canRun: true, comparisons: [] }, posts);
    await page.goto('/compare');
    await expect(page.getByRole('link', { name: 'Compare', exact: true })).toBeVisible();
    const start = page.getByTestId('compare-start');
    await expect(start).toBeDisabled();
    await page.getByTestId('compare-bot-ema-majors').click();
    await page.getByTestId('compare-bot-rsi-majors').click();
    await page.getByTestId('compare-bot-ema-btc').click();
    await expect(start).toHaveText('Compare 3 bots');
    await start.click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]!.headers()['x-wickfleet-request']).toBe('1');
    expect(posts[0]!.postDataJSON()).toMatchObject({
      bots: ['ema-majors', 'rsi-majors', 'ema-btc'],
    });
    const result = page.getByTestId('compare-result');
    await expect(result).toContainText('1 of 3 finished');
    // The page polls a running comparison until it is done.
    await expect(result).toContainText('3 of 3 finished', { timeout: 15_000 });
    const table = page.getByTestId('compare-table');
    await expect(table).toContainText('+9.46%');
    await expect(table).toContainText('94.60 USDT');
    await expect(table).toContainText('30d 15h');
    await expect(table).toContainText('7 / 12');
    await expect(table).toContainText('n/a');
    await expect(table).toContainText('backtest: exit 2: No data found');
    await expect(page.getByTestId('equity-overlay')).toBeVisible();
    await expect(page.getByText('Comparison queued')).toHaveCount(0, { timeout: 10_000 });
    await shot(page, 'compare');
    // A phone gets one card per bot instead of the wide table.
    await page.setViewportSize({ width: 390, height: 844 });
    const cards = page.getByTestId('compare-cards');
    await expect(cards).toContainText('+9.46% (94.60 USDT)');
    await expect(cards).toContainText('n/a / n/a');
    await expect(table).toBeHidden();
    await shot(page, 'compare');
  });

  test('all my bots sends all instead of names', async ({ page }) => {
    const posts: Request[] = [];
    await hub(page, 'admin', 'root');
    await compareMocks(page, { canRun: true, comparisons: [] }, posts);
    await page.goto('/compare');
    await page.getByTestId('compare-all').click();
    await page.getByTestId('compare-start').click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]!.postDataJSON()).toMatchObject({ all: true });
    expect(posts[0]!.postDataJSON().bots).toBeUndefined();
  });

  for (const who of [
    { name: 'a viewer', user: 'alice', demo: false },
    { name: 'the demo', user: 'demo', demo: true },
  ]) {
    test(`${who.name} sees percentages but no money, and cannot start one`, async ({ page }) => {
      await hub(page, 'viewer', who.user);
      await compareMocks(page, { canRun: false, demo: who.demo, comparisons: [hidden] });
      await page.goto('/compare');
      const table = page.getByTestId('compare-table');
      await expect(table).toContainText('+9.46%');
      await expect(table).toContainText('hidden');
      await expect(table).not.toContainText('94.60');
      await expect(page.getByTestId('compare-redacted')).toBeVisible();
      await expect(page.getByTestId('equity-overlay')).toBeVisible();
      await expect(page.getByTestId('compare-form')).toHaveCount(0);
    });
  }

  test('the demo explains why there is nothing to compare', async ({ page }) => {
    await hub(page, 'viewer', 'demo');
    await compareMocks(page, { canRun: false, demo: true, comparisons: [] });
    await page.goto('/compare');
    await expect(page.getByTestId('compare-demo')).toContainText('not available in the demo');
    await expect(page.getByTestId('compare-form')).toHaveCount(0);
  });

  test('the demo shows its last comparison read-only', async ({ page }) => {
    await hub(page, 'viewer', 'demo');
    await compareMocks(page, { canRun: false, demo: true, comparisons: [hidden] });
    await page.goto('/compare');
    await expect(page.getByTestId('compare-demo')).toContainText('last comparison');
    await expect(page.getByTestId('compare-table')).toContainText('+9.46%');
    await expect(page.getByTestId('compare-form')).toHaveCount(0);
  });
});

const risk = {
  at: '2026-11-11T16:00:00Z',
  redacted: false,
  bots: [
    {
      name: 'ema-majors',
      owner: 'alice',
      dry: true,
      stake: 'USDT',
      open_trades: 2,
      max_open_trades: 3,
      at_stake: 900,
      value: 1010,
      drawdown_pct: 5,
      max_drawdown_pct: 20,
      of_worst_pct: 25,
    },
    {
      name: 'ema-btc',
      owner: 'alice',
      dry: true,
      stake: 'CAD',
      open_trades: 1,
      max_open_trades: 1,
      at_stake: 400,
      value: 1000,
      drawdown_pct: 9,
      max_drawdown_pct: 10,
      of_worst_pct: 90,
    },
    {
      name: 'rsi-majors',
      owner: 'alice',
      dry: true,
      stake: 'USDT',
      open_trades: 0,
      max_open_trades: 3,
      drawdown_pct: 0,
      max_drawdown_pct: 0,
      error: 'profit: HTTP 502',
    },
  ],
  positions: [
    {
      bot: 'ema-majors',
      owner: 'alice',
      dry: true,
      stake: 'USDT',
      pair: 'BTC/USDT',
      coin: 'BTC',
      amount: 0.01,
      at_stake: 600,
      value: 610,
      profit_pct: 1.6,
      stop_dist_pct: -10,
    },
    {
      bot: 'ema-majors',
      owner: 'alice',
      dry: true,
      stake: 'USDT',
      pair: 'ETH/USDT',
      coin: 'ETH',
      amount: 0.1,
      at_stake: 300,
      value: 310,
      profit_pct: 3.3,
      stop_dist_pct: -5,
    },
    {
      bot: 'ema-btc',
      owner: 'alice',
      dry: true,
      stake: 'CAD',
      pair: 'BTC/CAD',
      coin: 'BTC',
      amount: 0.005,
      at_stake: 400,
      value: 420,
      profit_pct: 5,
    },
  ],
  totals: [
    { dry: true, stake: 'CAD', bots: 1, open_trades: 1, at_stake: 400, value: 1000 },
    { dry: true, stake: 'USDT', bots: 1, open_trades: 2, at_stake: 900, value: 1010 },
  ],
  pairs: [
    {
      pair: 'BTC/USDT',
      dry: true,
      stake: 'USDT',
      bots: ['ema-majors'],
      trades: 1,
      at_stake: 600,
      value: 610,
      share_pct: 66.7,
    },
    {
      pair: 'BTC/CAD',
      dry: true,
      stake: 'CAD',
      bots: ['ema-btc'],
      trades: 1,
      at_stake: 400,
      value: 420,
      share_pct: 100,
    },
    {
      pair: 'ETH/USDT',
      dry: true,
      stake: 'USDT',
      bots: ['ema-majors'],
      trades: 1,
      at_stake: 300,
      value: 310,
      share_pct: 33.3,
    },
  ],
  coins: [
    {
      coin: 'BTC',
      dry: true,
      bots: ['ema-btc', 'ema-majors'],
      trades: 2,
      amount: 0.015,
      at_stake: { USDT: 600, CAD: 400 },
      value: { USDT: 610, CAD: 420 },
    },
    {
      coin: 'ETH',
      dry: true,
      bots: ['ema-majors'],
      trades: 1,
      amount: 0.1,
      at_stake: { USDT: 300 },
      value: { USDT: 310 },
    },
  ],
  overlap: [{ pair: 'BTC/USDT', bots: ['ema-majors', 'rsi-majors'], open: ['ema-majors'] }],
};

// What a viewer gets: the hub leaves out every money figure and the exposure lists.
const redacted = {
  ...risk,
  redacted: true,
  bots: risk.bots.map(({ at_stake: _a, value: _v, ...b }) => b),
  positions: risk.positions.map(({ amount: _m, at_stake: _a, value: _v, ...p }) => p),
  totals: undefined,
  pairs: undefined,
  coins: undefined,
};

test.describe('Wickfleet risk', () => {
  test('an owner sees stake, exposure per coin, stops and overlap', async ({ page }) => {
    await hub(page, 'operator');
    await page.route('**/hub/api/risk', (route) => route.fulfill({ json: risk }));
    await page.goto('/risk');
    await expect(page.getByRole('link', { name: 'Risk', exact: true })).toBeVisible();
    await expect(page.getByTestId('risk-totals')).toContainText('900.00 USDT');
    await expect(page.getByTestId('risk-totals')).toContainText('400.00 CAD');
    // BTC across two bots and two currencies is one line, the money per currency.
    const coins = page.getByTestId('risk-coins');
    await expect(coins.getByText('BTC', { exact: true })).toHaveCount(1);
    await expect(coins).toContainText('400.00 CAD + 600.00 USDT');
    await expect(page.getByTestId('risk-pairs')).toContainText('67%');
    await expect(page.getByTestId('risk-positions')).toContainText('-10.00%');
    await expect(page.getByTestId('risk-positions')).toContainText('n/a');
    await expect(page.getByTestId('risk-bots')).toContainText('90%');
    await expect(page.getByTestId('risk-bots')).toContainText('profit: HTTP 502');
    await expect(page.getByTestId('risk-overlap')).toContainText('BTC/USDT');
    await expect(page.getByTestId('risk-redacted')).toHaveCount(0);
    await shot(page, 'risk');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('risk-bots')).toBeVisible();
    await shot(page, 'risk');
  });

  for (const who of [
    { name: 'a viewer', user: 'bob' },
    { name: 'the demo', user: 'demo' },
  ]) {
    test(`${who.name} sees drawdown and stops but no stake or exposure`, async ({ page }) => {
      await hub(page, 'viewer', who.user);
      await page.route('**/hub/api/risk', (route) => route.fulfill({ json: redacted }));
      await page.goto('/risk');
      await expect(page.getByTestId('risk-redacted')).toBeVisible();
      await expect(page.getByTestId('risk-bots')).toContainText('ema-majors');
      await expect(page.getByTestId('risk-bots')).not.toContainText('At stake');
      await expect(page.getByTestId('risk-positions')).toContainText('-10.00%');
      await expect(page.getByTestId('risk-totals')).toHaveCount(0);
      await expect(page.getByTestId('risk-coins')).toHaveCount(0);
      await expect(page.getByTestId('risk-pairs')).toHaveCount(0);
    });
  }
});
