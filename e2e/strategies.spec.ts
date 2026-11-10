import { test, expect, type Page, type Request } from '@playwright/test';
import { defaultMocks } from './helpers';
import allKinds from '../tests/unit/fixtures/AllKinds.json' with { type: 'json' };
import freqaiTrend from '../tests/unit/fixtures/FreqaiTrend.json' with { type: 'json' };

const hubBots = { role: 'operator', user: 'alice', images: ['freqtrade'], bots: [] };

async function mocks(
  page: Page,
  opts: { puts?: Request[]; checks?: Request[]; badCheck?: boolean } = {},
) {
  await defaultMocks(page);
  await page.route('**/hub/api/bots', (r) => r.fulfill({ json: hubBots }));
  await page.route('**/hub/api/specs', (r) =>
    r.fulfill({
      json: {
        can_create: true,
        can_draft: true,
        specs: [
          {
            name: 'AllKinds',
            timeframe: '1d',
            model: false,
            used_by: [],
            editable: true,
            author: 'alice',
          },
          {
            name: 'FreqaiTrend',
            timeframe: '1h',
            model: true,
            used_by: ['freqai'],
            editable: false,
          },
        ],
      },
    }),
  );
  await page.route('**/hub/api/specs/AllKinds', (r) => {
    if (r.request().method() === 'PUT') {
      opts.puts?.push(r.request());
      return r.fulfill({ status: 202, json: { result: 'changes' } });
    }
    return r.fulfill({
      json: {
        spec: { ...allKinds, author: 'alice' },
        describe: '',
        python: '',
        used_by: [],
        editable: true,
      },
    });
  });
  await page.route('**/hub/api/specs/FreqaiTrend', (r) =>
    r.fulfill({
      json: { spec: freqaiTrend, describe: '', python: '', used_by: ['freqai'], editable: false },
    }),
  );
  await page.route('**/hub/api/specs/Breakout', (r) => {
    opts.puts?.push(r.request());
    return r.fulfill({ status: 202, json: { result: 'adds' } });
  });
  await page.route('**/hub/api/specs/check', (r) => {
    opts.checks?.push(r.request());
    if (opts.badCheck)
      return r.fulfill({
        status: 400,
        json: { error: 'stoploss must be between -0.99 and 0 (e.g. -0.10)' },
      });
    const s = r.request().postDataJSON();
    return r.fulfill({
      json: {
        ok: true,
        describe: `${s.name} trades ${s.timeframe} candles, long only.`,
        python: `class ${s.name}(IStrategy):`,
      },
    });
  });
}

test.describe('Strategies', () => {
  test('a drafted spec opens unsaved in the editor', async ({ page }) => {
    const drafts: Request[] = [];
    const puts: Request[] = [];
    await mocks(page, { puts });
    const drafted = {
      ...freqaiTrend,
      name: 'RsiDip',
      model: undefined,
      startup_candles: undefined,
      entry_guard: undefined,
    };
    let polls = 0;
    await page.route('**/hub/api/specs/draft', (r) => {
      drafts.push(r.request());
      return r.fulfill({ status: 202, json: { id: 'd1', state: 'running' } });
    });
    // Running once, then done: the page must keep polling.
    await page.route('**/hub/api/specs/draft/d1', (r) =>
      r.fulfill({
        json:
          ++polls < 2
            ? { id: 'd1', state: 'running' }
            : {
                id: 'd1',
                state: 'done',
                result: {
                  spec: drafted,
                  describe: '',
                  provider: 'ollama/qwen3:4b',
                  attempts: 1,
                  seconds: 31,
                },
              },
      }),
    );
    await page.goto('/strategies');
    await page.getByTestId('draft-sentence').fill('Hourly: buy when RSI 14 crosses up through 30.');
    await page.getByRole('button', { name: 'Draft' }).click();
    await expect(page.getByText('Drafted by ollama/qwen3:4b in 31 s')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('readback')).toContainText('RsiDip trades 1h');
    expect(drafts[0]!.postDataJSON()).toEqual({
      sentence: 'Hourly: buy when RSI 14 crosses up through 30.',
    });
    expect(drafts[0]!.headers()['x-wickfleet-request']).toBe('1');
    expect(puts).toHaveLength(0);
    expect(polls).toBeGreaterThanOrEqual(2);
  });

  test('an edited-nothing save gives back the exact spec through Blockly', async ({ page }) => {
    const puts: Request[] = [];
    await mocks(page, { puts });
    await page.goto('/strategies');
    await page.getByRole('button', { name: 'Edit AllKinds' }).click();
    await expect(page.locator('[data-testid="blockly"] .blocklySvg')).toBeVisible();
    await expect(page.locator('[data-testid="blockly"]').getByText('Buy when')).toBeVisible();
    await expect(page.getByTestId('readback')).toContainText('AllKinds trades 1d candles');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0]!.headers()['x-wickfleet-request']).toBe('1');
    expect(puts[0]!.postDataJSON()).toEqual(allKinds);
  });

  test('a model spec keeps its model, startup and guard; read-only shows no Save', async ({
    page,
  }) => {
    const checks: Request[] = [];
    await mocks(page, { checks });
    await page.goto('/strategies');
    await page.getByRole('button', { name: 'Show FreqaiTrend' }).click();
    await expect(page.getByTestId('readback')).toContainText('FreqaiTrend trades 1h');
    expect(checks.at(-1)!.postDataJSON()).toEqual(freqaiTrend);
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
  });

  test('a new strategy saves under its name with the starter rules', async ({ page }) => {
    const puts: Request[] = [];
    await mocks(page, { puts });
    await page.goto('/strategies');
    await page.getByRole('button', { name: 'New strategy' }).click();
    await page.getByPlaceholder('MyStrategy').fill('Breakout');
    await expect(page.getByTestId('readback')).toContainText('Breakout trades 1d');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => puts.length).toBe(1);
    const body = puts[0]!.postDataJSON();
    expect(body.name).toBe('Breakout');
    expect(body.author).toBeUndefined();
    expect(body.indicators.map((i: { id: string }) => i.id)).toEqual(['sma50', 'sma200', 'hi20']);
    expect(body.entry.all).toHaveLength(2);
  });

  test('a hub error shows and blocks Save', async ({ page }) => {
    await mocks(page, { badCheck: true });
    await page.goto('/strategies');
    await page.getByRole('button', { name: 'New strategy' }).click();
    await expect(page.getByTestId('spec-error')).toContainText('stoploss must be');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
