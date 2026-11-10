// Against a real Wickfleet: Kanidm login, create a bot, wait for its
// container, delete it. Needs WICKFLEET_URL and the WICKFLEET_E2E_* login.
import { test, expect, type Page } from '@playwright/test';
import { msToNextStep, totp } from './totp';

const user = process.env.WICKFLEET_E2E_USER ?? '';
const password = process.env.WICKFLEET_E2E_PASSWORD ?? '';
const otp = process.env.WICKFLEET_E2E_TOTP ?? '';
const bot = `e2e-${Date.now().toString(36)}`;

test.skip(!user || !password || !otp, 'WICKFLEET_E2E_USER/PASSWORD/TOTP not set');
test.describe.configure({ mode: 'serial' });

async function login(page: Page) {
  const home = new URL(process.env.WICKFLEET_URL ?? '').host;
  await page.goto('/');
  await page.locator('#username').fill(user);
  await page.locator('button[type=submit]').click();
  for (let i = 0; i < 6 && new URL(page.url()).host !== home; i++) {
    await page.waitForLoadState();
    if (await page.locator('#totp').isVisible()) {
      // A code Kanidm has already seen is refused; leave room for the round trip.
      if (msToNextStep(otp) < 3000) await page.waitForTimeout(msToNextStep(otp) + 500);
      await page.locator('#totp').fill(await totp(otp));
    } else if (await page.locator('#password').isVisible()) {
      await page.locator('#password').fill(password);
    }
    // Password, TOTP and the OAuth2 consent page all submit with the primary button.
    const before = page.url();
    await page.locator('button[type=submit], button.btn-primary').first().click();
    await page.waitForURL((u) => u.href !== before, { timeout: 15_000 });
  }
  await expect(page).toHaveURL((u) => u.host === home);
}

async function hubBots(page: Page): Promise<string[]> {
  const res = await page.request.get('/hub/api/bots');
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { bots: { name: string }[] }).bots.map((b) => b.name);
}

// One login for the whole file: Kanidm refuses a TOTP code it has already seen.
let page: Page;
let saved = false; // a commit exists, so cleanup must wait for it and delete
test.beforeAll(async ({ browser }) => {
  test.setTimeout(60_000);
  page = await browser.newPage({ baseURL: process.env.WICKFLEET_URL });
  await login(page);
});

// The user is the Kanidm username, not the OIDC sub (a UUID), and a client
// cannot pick it: Traefik replaces the identity headers with oauth2-proxy's.
test('identity is the username and cannot be forged', async () => {
  const me = await (await page.request.get('/hub/api/me')).json();
  expect(me.user).toBe(user);
  const forged = await (
    await page.request.get('/hub/api/me', {
      headers: { 'X-Auth-Request-Preferred-Username': 'dhumpf', 'X-Auth-Request-User': 'dhumpf' },
    })
  ).json();
  expect(forged.user).toBe(user);
  expect(forged.role).toBe('operator');
});

// A draft is how a new bot gets replayed before it is saved.
test('replay a draft over the last three months', async () => {
  test.setTimeout(10 * 60_000);
  const to = new Date().toISOString().slice(0, 10);
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  const from = d.toISOString().slice(0, 10);
  await page.goto('/replay');
  const res = await page.evaluate(
    (body) =>
      fetch('/hub/api/replays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Wickfleet-Request': '1' },
        body: JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, body: await r.json() })),
    {
      draft: {
        strategy: 'TrendDaily',
        strategy_file: 'TrendDaily.py',
        exchange: 'binance',
        pairs: ['BTC/USDT'],
        stake_currency: 'USDT',
      },
      from,
      to,
    },
  );
  expect(res.status, JSON.stringify(res.body)).toBe(202);
  const id = res.body.id as string;
  let job: { state: string; error?: string; summary?: { fees: number; trades: number } } = {
    state: 'queued',
  };
  await expect
    .poll(
      async () => {
        job = (await (await page.request.get(`/hub/api/replays/${id}`)).json()).job;
        return job.state;
      },
      { timeout: 8 * 60_000, intervals: [5_000] },
    )
    .toMatch(/done|failed/);
  expect(job.error ?? '').toBe('');
  expect(job.summary).toBeDefined();
  await page.goto('/replay');
  await page.getByRole('button', { name: `Show ${id}` }).click();
  await expect(page.getByText('Buy and hold', { exact: true })).toBeVisible();
  // A three-month replay is too short for the walk-forward verdict.
  await expect(page.getByTestId('robust')).toContainText('not robust');
  await expect(page.getByTestId('robust')).toContainText('at least 6 needed');
});

// The editor loads, and a sentence comes back as a checked, unsaved spec
// from the drafting model behind the hub.
test('draft a strategy from a sentence', async () => {
  test.setTimeout(6 * 60_000);
  await page.goto('/strategies');
  await expect(page.getByText('Describe it in a sentence')).toBeVisible();
  await page
    .getByTestId('draft-sentence')
    .fill(
      'On 4 hour candles buy when RSI 14 crosses above 35, sell when it crosses below 65. 6% stop.',
    );
  await page.getByRole('button', { name: 'Draft' }).click();
  await expect(page.getByText(/Drafted by \S+ in \d+ s/)).toBeVisible({ timeout: 5 * 60_000 });
  await expect(page.locator('[data-testid="blockly"] .blocklySvg')).toBeVisible();
  await expect(page.getByTestId('readback')).toContainText('trades 4h candles');
});

test('create a bot, see it run, delete it', async () => {
  test.setTimeout(10 * 60_000);
  await expect(page.getByRole('link', { name: 'Fleet', exact: true })).toBeVisible();

  // The watchlist is shared; an operator sees it but cannot edit it.
  await page.goto('/fleet');
  await expect(page.getByText('Watchlist', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'XIC.TO' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);

  await page.goto('/bots');
  await page.getByRole('button', { name: 'New bot' }).click();
  await page.getByPlaceholder('trend-btc').fill(bot);
  // A new bot needs a replay first; Binance daily keeps it fast.
  await page.getByTestId('bot-strategy-file').click();
  await page.getByRole('option', { name: 'TrendDaily.py' }).click();
  await page.getByTestId('bot-exchange').click();
  await page.getByRole('option', { name: 'binance' }).click();
  await page.getByLabel('Pairs (comma separated)').fill('BTC/USDT');
  await page.getByRole('button', { name: 'Replay last year' }).click();
  await expect(page.getByTestId('draft-replay')).toContainText('after', { timeout: 5 * 60_000 });
  await page.getByRole('button', { name: 'Save' }).click();
  saved = true;
  await expect(page.getByText(`${bot}: creates`).filter({ visible: true }).first()).toBeVisible();

  await expect
    .poll(() => hubBots(page), { timeout: 3 * 60_000, intervals: [5_000] })
    .toContain(bot);
  await expect
    .poll(async () => (await page.request.get(`/bots/${bot}/api/v1/ping`)).status(), {
      timeout: 4 * 60_000,
      intervals: [10_000],
    })
    .toBe(200);

  await page.goto('/bots');
  const row = page.getByRole('row', { name: new RegExp(bot) });
  await row.getByRole('button').nth(1).click();
  await row.getByRole('button', { name: 'Really delete?' }).click();
  await expect(page.getByText(`${bot}: removed`).filter({ visible: true }).first()).toBeVisible();
  await expect
    .poll(() => hubBots(page), { timeout: 3 * 60_000, intervals: [5_000] })
    .not.toContain(bot);
  saved = false;
});

test.afterAll(async () => {
  // A failed run must not leave its bot behind. The hub only deletes what it
  // has synced, so wait for the bot to show up first.
  test.setTimeout(4 * 60_000);
  const del = () =>
    page.evaluate(
      (name) =>
        fetch(`/hub/api/bots/${name}`, {
          method: 'DELETE',
          headers: { 'X-Wickfleet-Request': '1' },
        }).then((r) => r.status),
      bot,
    );
  if (page && saved) {
    await expect
      .poll(() => hubBots(page).catch((): string[] => []), {
        timeout: 3 * 60_000,
        intervals: [5_000],
      })
      .toContain(bot);
    expect([202, 404]).toContain(await del());
  }
  await page?.close();
});
