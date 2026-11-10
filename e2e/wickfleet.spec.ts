import { test, expect, type Page, type Request } from '@playwright/test';
import { defaultMocks } from './helpers';

const hubBots = {
  role: 'operator',
  user: 'alice',
  images: ['freqtrade'],
  bots: [
    {
      name: 'trend',
      owner: 'alice',
      strategy: 'TrendDaily',
      strategy_file: 'TrendDaily.py',
      exchange: 'kraken',
      pairs: ['BTC/USDT'],
      stake_currency: 'USDT',
      wallet: 1000,
      max_open_trades: 3,
      fee: 0.008,
      url: '/bots/trend',
      editable: true,
    },
    {
      name: 'trend-ndax',
      owner: 'alice',
      strategy: 'TrendDaily',
      strategy_file: 'TrendDaily.py',
      exchange: 'ndax',
      pairs: ['BTC/CAD'],
      stake_currency: 'CAD',
      wallet: 1000,
      max_open_trades: 3,
      fee: 0.002,
      url: '/bots/trend-ndax',
      editable: true,
    },
  ],
};

const fleet = {
  at: '2026-10-18T18:00:00Z',
  bots: [
    {
      name: 'trend',
      owner: 'alice',
      dry: true,
      stake: 'USDT',
      investment: 1000,
      value: 1012.5,
      profit_net: 12.5,
      fees: 3.2,
      profit_gross: 15.7,
      return_pct: 1.25,
      trades: 4,
      closed: 3,
      fee_per_trade: 0.8,
    },
    {
      name: 'trend-ndax',
      owner: 'alice',
      dry: true,
      stake: 'CAD',
      investment: 1000,
      value: 990,
      profit_net: -10,
      fees: 0.8,
      profit_gross: -9.2,
      return_pct: -1,
      trades: 2,
      closed: 2,
      fee_per_trade: 0.4,
      error: '',
    },
  ],
  totals: [
    {
      dry: true,
      stake: 'CAD',
      bots: 1,
      investment: 1000,
      value: 990,
      profit_net: -10,
      fees: 0.8,
      profit_gross: -9.2,
      return_pct: -1,
      trades: 2,
    },
    {
      dry: true,
      stake: 'USDT',
      bots: 1,
      investment: 1000,
      value: 1012.5,
      profit_net: 12.5,
      fees: 3.2,
      profit_gross: 15.7,
      return_pct: 1.25,
      trades: 4,
    },
  ],
};

async function hubMocks(page: Page, writes: Request[] = [], watchEditable = false) {
  await defaultMocks(page);
  await page.route('**/bots/*/api/v1/token/login', (route) =>
    route.fulfill({ json: { access_token: 'jwt-access', refresh_token: 'jwt-refresh' } }),
  );
  await page.route('**/hub/api/bots', (route) => route.fulfill({ json: hubBots }));
  await page.route('**/hub/api/strategies', (route) =>
    route.fulfill({ json: { strategies: ['FreqaiTrend.py', 'TrendDaily.py'] } }),
  );
  await page.route('**/hub/api/fleet', (route) => route.fulfill({ json: fleet }));
  await page.route('**/hub/api/signals', (route) =>
    route.fulfill({
      json: {
        rule: 'monthly close above 10-month average',
        signals: [
          { symbol: 'XIC.TO', month: '2026-09', hold: true, close: 57.7, sma10m: 55.4, gap: 0.041 },
          {
            symbol: 'CYH.TO',
            month: '2026-09',
            hold: false,
            close: 27.0,
            sma10m: 27.3,
            gap: -0.011,
          },
        ],
      },
    }),
  );
  await page.route('**/hub/api/watchlist', (route) => {
    if (route.request().method() === 'PUT') {
      writes.push(route.request());
      return route.fulfill({ status: 202, json: { result: 'saved', note: 'after the next sync' } });
    }
    return route.fulfill({
      json: {
        symbols: [{ symbol: 'XIC.TO', note: 'Canada core' }, { symbol: 'CYH.TO' }],
        editable: watchEditable,
      },
    });
  });
  await page.route('**/hub/api/bots/*', (route) => {
    writes.push(route.request());
    return route.fulfill({
      status: 202,
      json: { result: 'creates', note: 'applied after the next sync' },
    });
  });
}

test.describe('Wickfleet', () => {
  test('logs in every hub bot without a dialog', async ({ page }) => {
    await hubMocks(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Fleet', exact: true })).toBeVisible();
    // Logins land one by one; a slow runner reads before the second is stored.
    const stored = () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('ftAuthLoginInfo') ?? '{}') as Record<
            string,
            { apiUrl: string; accessToken: string }
          >,
      );
    const origin = new URL(page.url()).origin;
    await expect
      .poll(async () =>
        Object.values(await stored())
          .map((b) => b.apiUrl)
          .sort(),
      )
      .toEqual([`${origin}/bots/trend`, `${origin}/bots/trend-ndax`]);
    expect(Object.values(await stored())[0]!.accessToken).toBe('jwt-access');
  });

  test('fleet page keeps currencies apart and shows signals', async ({ page }) => {
    await hubMocks(page);
    await page.goto('/fleet');
    await expect(page.getByText('Dry run, USDT')).toBeVisible();
    await expect(page.getByText('Dry run, CAD')).toBeVisible();
    await expect(page.getByText('1,012.50').first()).toBeVisible();
    await expect(page.getByText('HOLD', { exact: true })).toBeVisible();
    await expect(page.getByText('OUT', { exact: true })).toBeVisible();
  });

  test('watchlist shows notes; only an editable list offers Edit', async ({ page }) => {
    await hubMocks(page);
    await page.goto('/fleet');
    await expect(page.getByText('Watchlist', { exact: true })).toBeVisible();
    await expect(page.getByText('Canada core')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });

  test('admin edits the watchlist in one PUT', async ({ page }) => {
    const writes: Request[] = [];
    await hubMocks(page, writes, true);
    await page.goto('/fleet');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('button', { name: 'Remove CYH.TO' }).click();
    await page.getByRole('button', { name: 'Add symbol' }).click();
    await page.getByPlaceholder('XIC.TO').last().fill('btc-usd');
    await page.getByPlaceholder('note (optional)').last().fill('crypto, watch only');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => writes.length).toBe(1);
    const req = writes[0]!;
    expect(req.method()).toBe('PUT');
    expect(req.headers()['x-wickfleet-request']).toBe('1');
    expect(req.postDataJSON()).toEqual({
      symbols: [
        { symbol: 'XIC.TO', note: 'Canada core' },
        { symbol: 'BTC-USD', note: 'crypto, watch only' },
      ],
    });
  });

  test('a bad or duplicate symbol blocks Save', async ({ page }) => {
    await hubMocks(page, [], true);
    await page.goto('/fleet');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('button', { name: 'Add symbol' }).click();
    await page.getByPlaceholder('XIC.TO').last().fill('xic.to');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await page.getByPlaceholder('XIC.TO').last().fill('../x');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await page.getByPlaceholder('XIC.TO').last().fill('VFV.TO');
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  test('replay starts with one POST and shows the result', async ({ page }) => {
    const posts: Request[] = [];
    await hubMocks(page);
    const done = {
      id: 'r1',
      kind: 'replay',
      owner: 'alice',
      bot: 'trend',
      exchange: 'kraken',
      pairs: ['BTC/USDT'],
      from: '2025-10-18',
      to: '2026-10-18',
      state: 'done',
      created: '2026-10-18T20:00:00Z',
      summary: {
        strategy: 'TrendDaily',
        stake: 'USDT',
        start: '2025-10-18',
        end: '2026-10-18',
        trades: 3,
        wins: 3,
        losses: 0,
        start_balance: 1000,
        final_balance: 1151.75,
        profit_net: 151.75,
        profit_pct: 15.17,
        fees: 17.18,
        profit_gross: 168.92,
        max_drawdown: 0,
        max_drawdown_pct: 0,
        market_pct: -35.3,
      },
      bias: { lookahead: 'biased', signals: 12, indicators: 'enter_long', recursive: 'clean' },
      robust: {
        pass: true,
        windows: [
          { from: '2026-07-20', to: '2026-08-19', trades: 1, profit_pct: 4.1 },
          { from: '2026-08-19', to: '2026-09-18', trades: 0, profit_pct: 0 },
          { from: '2026-09-18', to: '2026-10-18', trades: 2, profit_pct: -1.2 },
        ],
        profitable: 1,
        worst_pct: -1.2,
        vs_hold_pct: 50.47,
        monte_carlo: {
          runs: 10000,
          median_return_pct: 14.9,
          p5_return_pct: 2.3,
          median_drawdown_pct: 3.4,
          p95_drawdown_pct: 9.8,
          ruin_pct: 0,
          judged: false,
        },
      },
    };
    const failed = {
      ...done,
      id: 'r2',
      state: 'failed',
      summary: undefined,
      error: 'backtest: No data found.',
    };
    await page.route('**/hub/api/replays', (route) => {
      if (route.request().method() === 'POST') {
        posts.push(route.request());
        return route.fulfill({ status: 202, json: { id: 'r1', state: 'queued' } });
      }
      return route.fulfill({
        json: {
          enabled: true,
          since: '2025-01-01',
          since_by_exchange: { ndax: '2020-01-01' },
          can_run: true,
          jobs: [done, failed],
        },
      });
    });
    await page.route('**/hub/api/replays/r1', (route) =>
      route.fulfill({
        json: {
          job: done,
          trades: [
            {
              pair: 'BTC/USDT',
              open: '2026-08-20 00:00:00+00:00',
              close: '2026-10-18 00:00:00+00:00',
              open_rate: 69334.78,
              close_rate: 81491.04,
              stake: 330,
              profit_net: 52.01,
              profit_pct: 15.7,
              fee: 5.6,
              exit_reason: 'force_exit',
            },
          ],
        },
      }),
    );
    await page.route('**/hub/api/replays/r2', (route) => route.fulfill({ json: { job: failed } }));
    await page.goto('/replay?bot=trend-ndax');
    await expect(page.getByTestId('replay-bot')).toContainText('trend-ndax');
    // NDAX history reaches back further than the default start.
    await expect(page.getByText("starts 2020-01-01 for this bot's exchange")).toBeVisible();
    await page.getByRole('button', { name: '1Y' }).click();
    await page.getByRole('button', { name: 'Replay', exact: true }).click();
    await expect.poll(() => posts.length).toBe(1);
    const body = posts[0]!.postDataJSON();
    expect(posts[0]!.headers()['x-wickfleet-request']).toBe('1');
    expect(body.bot).toBe('trend-ndax');
    expect(body.to > body.from).toBeTruthy();
    // The queued id is selected and its result shows.
    await expect(page.getByText('1,151.75')).toBeVisible();
    await expect(page.getByText('17.18').first()).toBeVisible();
    await expect(page.getByText('-35.30%')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'force_exit' })).toBeVisible();
    await expect(page.getByTestId('bias')).toContainText('uses the future in enter_long');
    const robust = page.getByTestId('robust');
    await expect(robust).toContainText('passes');
    await expect(robust).toContainText('profitable in 1 of 3 30-day windows');
    await expect(robust).toContainText('+50.47% against buy and hold');
    await expect(robust).toContainText('worst 5% 9.8%');
    await expect(robust).toContainText('Too few trades to judge.');
    await page.getByRole('button', { name: 'Show r2' }).click();
    await expect(page.getByText('backtest: No data found.')).toBeVisible();
  });

  test('a viewer sees replays but no Replay button', async ({ page }) => {
    await hubMocks(page);
    await page.route('**/hub/api/replays', (route) =>
      route.fulfill({ json: { enabled: true, since: '2025-01-01', can_run: false, jobs: [] } }),
    );
    await page.goto('/replay');
    await expect(page.getByText('Replays', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replay', exact: true })).toHaveCount(0);
  });

  test('a new bot saves only after a replay of the same settings', async ({ page }) => {
    const writes: Request[] = [];
    const replayPosts: Request[] = [];
    await hubMocks(page, writes);
    await page.route('**/hub/api/replays', (route) => {
      if (route.request().method() === 'POST') {
        replayPosts.push(route.request());
        return route.fulfill({ status: 202, json: { id: 'r9', state: 'queued' } });
      }
      return route.fulfill({
        json: { enabled: true, since: '2025-01-01', can_run: true, jobs: [] },
      });
    });
    await page.route('**/hub/api/replays/r9', (route) =>
      route.fulfill({
        json: {
          job: {
            id: 'r9',
            kind: 'replay',
            state: 'done',
            summary: {
              profit_pct: 15.17,
              fees: 17.18,
              stake: 'USDT',
              trades: 3,
              market_pct: -35.3,
            },
            robust: {
              pass: false,
              reasons: ['profitable in 3 of 12 windows; at least 6 needed'],
              windows: [],
              profitable: 3,
              worst_pct: -9.5,
              vs_hold_pct: 50.47,
            },
          },
        },
      }),
    );
    await page.goto('/bots');
    await page.getByRole('button', { name: 'New bot' }).click();
    await page.getByPlaceholder('trend-btc').fill('test-btc');
    const save = page.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    await page.getByTestId('bot-strategy-file').click();
    await page.getByRole('option', { name: 'TrendDaily.py' }).click();
    await page.getByTestId('bot-exchange').click();
    await page.getByRole('option', { name: 'binance' }).click();
    await page.getByLabel('Pairs (comma separated)').fill('BTC/USDT');
    await page.getByRole('button', { name: 'Replay last year' }).click();
    await expect(page.getByTestId('draft-replay')).toContainText('15.17% after 17.18 USDT fees');
    // Not robust warns; a dry run still saves.
    await expect(page.getByTestId('robust')).toContainText('not robust');
    await expect(page.getByTestId('robust')).toContainText(
      'profitable in 3 of 12 windows; at least 6 needed',
    );
    await expect(page.getByTestId('robust-warning')).toContainText('live trading needs a pass');
    await expect(save).toBeEnabled();
    const draft = replayPosts[0]!.postDataJSON();
    expect(replayPosts[0]!.headers()['x-wickfleet-request']).toBe('1');
    expect(draft.draft.strategy_file).toBe('TrendDaily.py');
    expect(draft.draft.strategy).toBe('TrendDaily');
    expect(draft.draft.exchange).toBe('binance');
    expect(draft.draft.pairs).toEqual(['BTC/USDT']);
    expect(draft.draft.owner).toBeUndefined();
    // Any change after the replay asks for a new one.
    await page.getByPlaceholder('768m').fill('1g');
    await expect(save).toBeDisabled();
    await expect(page.getByTestId('draft-replay')).toContainText('replay again');
    await page.getByPlaceholder('768m').fill('768m');
    await expect(save).toBeEnabled();
    await save.click();
    await expect.poll(() => writes.length).toBe(1);
  });

  test('a replay with lookahead bias keeps Save locked', async ({ page }) => {
    await hubMocks(page);
    await page.route('**/hub/api/replays', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 202, json: { id: 'r9', state: 'queued' } });
      }
      return route.fulfill({
        json: { enabled: true, since: '2025-01-01', can_run: true, jobs: [] },
      });
    });
    await page.route('**/hub/api/replays/r9', (route) =>
      route.fulfill({
        json: {
          job: {
            id: 'r9',
            kind: 'replay',
            state: 'done',
            summary: { profit_pct: 80, fees: 1, stake: 'USDT', trades: 12, market_pct: 1 },
            bias: {
              lookahead: 'biased',
              signals: 12,
              indicators: 'enter_long',
              recursive: 'clean',
            },
          },
        },
      }),
    );
    await page.goto('/bots');
    await page.getByRole('button', { name: 'New bot' }).click();
    await page.getByPlaceholder('trend-btc').fill('peek-btc');
    await page.getByRole('button', { name: 'Replay last year' }).click();
    await expect(page.getByTestId('draft-replay')).toContainText('lookahead bias in enter_long');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('new bot sends one PUT with the CSRF header', async ({ page }) => {
    const writes: Request[] = [];
    await hubMocks(page, writes);
    await page.goto('/bots');
    await page.getByRole('button', { name: 'New bot' }).click();
    await page.getByPlaceholder('trend-btc').fill('test-btc');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => writes.length).toBe(1);
    const req = writes[0]!;
    expect(req.method()).toBe('PUT');
    expect(req.url()).toMatch(/\/hub\/api\/bots\/test-btc$/);
    expect(req.headers()['x-wickfleet-request']).toBe('1');
    const body = req.postDataJSON();
    expect(body.strategy_file).toBe('FreqaiTrend.py');
    expect(body.strategy).toBe('FreqaiTrend');
    expect(body.fee).toBeCloseTo(0.008);
    expect(body.owner).toBeUndefined();
  });

  test('the bots page loads without an error banner', async ({ page }) => {
    await hubMocks(page);
    await page.goto('/bots');
    await expect(page.getByRole('row', { name: /trend-ndax/ })).toBeVisible();
    await expect(page.getByText('Hub not reachable')).toHaveCount(0);
  });

  test('New bot with a strategy from the Strategies page is prefilled', async ({ page }) => {
    await hubMocks(page);
    await page.goto('/bots?strategy=TrendDaily.py');
    await expect(page.getByTestId('bot-strategy-file')).toContainText('TrendDaily.py');
    await expect(page.getByText('Hub not reachable')).toHaveCount(0);
  });

  test('delete asks twice', async ({ page }) => {
    const writes: Request[] = [];
    await hubMocks(page, writes);
    await page.goto('/bots');
    const row = page.getByRole('row', { name: /trend-ndax/ });
    await row.getByRole('button').nth(1).click();
    await expect(row.getByRole('button', { name: 'Really delete?' })).toBeVisible();
    expect(writes.length).toBe(0);
    await row.getByRole('button', { name: 'Really delete?' }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]!.method()).toBe('DELETE');
    expect(writes[0]!.headers()['x-wickfleet-request']).toBe('1');
  });

  test('a static host answering index.html is not a hub', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await defaultMocks(page);
    await page.route('**/hub/api/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html></html>',
      }),
    );
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Fleet', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('without a hub the UI stays stock FreqUI', async ({ page }) => {
    await defaultMocks(page);
    await page.route('**/hub/api/**', (route) => route.fulfill({ status: 404, body: 'not found' }));
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Fleet', exact: true })).toHaveCount(0);
  });

  test('the browser title says Wickfleet', async ({ page }) => {
    await defaultMocks(page);
    await page.goto('/');
    await expect(page).toHaveTitle(/Wickfleet/);
  });

  test('the nav has no Arena entry, on desktop or phone', async ({ page }) => {
    await hubMocks(page);
    await page.goto('/trade');
    await expect(page.locator('header nav a')).toContainText(['Fleet', 'Bots', 'Trade']);
    await expect(page.getByRole('link', { name: 'Arena' })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('footer a')).toHaveText([
      'Fleet',
      'Bots',
      'Trades',
      'Strategies',
      'Dashboard',
    ]);
    await expect(page.getByRole('link', { name: 'Arena' })).toHaveCount(0);
  });
});
