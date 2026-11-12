import { describe, it, expect } from 'vitest';
import {
  best,
  coinMoney,
  duration,
  maybe,
  moneyOrHidden,
  overlay,
  progress,
  worstTone,
} from '@/composables/wickfleetCompare';
import type { CompareRow } from '@/composables/useWickfleet';

const row = (
  bot: string,
  m: Partial<NonNullable<CompareRow['metrics']>> | null,
  equity?: number[],
) =>
  ({
    bot,
    owner: 'alice',
    exchange: 'binance',
    strategy: 'S',
    dry: true,
    state: m ? 'done' : 'failed',
    metrics: m ?? undefined,
    equity: equity?.map((r, i) => ({ date: `2026-01-0${i + 1}`, equity: 1000, return_pct: r })),
  }) as CompareRow;

describe('compare helpers', () => {
  it('formats a duration in the two largest units', () => {
    expect(duration(undefined)).toBe('n/a');
    expect(duration(45 * 60)).toBe('45m');
    expect(duration(5 * 3600 + 30 * 60)).toBe('5h 30m');
    expect(duration(2646960)).toBe('30d 15h');
  });
  it('shows a missing figure as n/a, never as zero', () => {
    expect(maybe(undefined)).toBe('n/a');
    expect(maybe(0)).toBe('0.00');
    expect(maybe(1.2803)).toBe('1.28');
  });
  it('picks the best bot per metric and skips bots without figures', () => {
    const rows = [
      row('a', { profit_pct: 5, max_drawdown_pct: 12 }),
      row('b', { profit_pct: 9, max_drawdown_pct: 20 }),
      row('c', null),
    ];
    expect(best(rows, (m) => m.profit_pct, true)).toBe('b');
    expect(best(rows, (m) => m.max_drawdown_pct, false)).toBe('a');
    expect(best(rows, (m) => m.sharpe, true)).toBe('');
    expect(best([rows[0]!], (m) => m.profit_pct, true)).toBe('');
  });
  it('overlays only bots with a curve, on the shared dates', () => {
    const o = overlay([row('a', {}, [0, 1, 2]), row('b', null), row('c', {}, [0, -1, 3])]);
    expect(o.dates).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(o.series.map((s) => s.name)).toEqual(['a', 'c']);
    expect(o.series[1]!.data).toEqual([0, -1, 3]);
  });
  it('counts finished bots', () => {
    expect(progress([row('a', {}), row('b', null), { ...row('c', null), state: 'testing' }])).toBe(
      '2 of 3 finished',
    );
  });
  it('colours the drawdown by its share of the worst so far', () => {
    expect(worstTone(undefined)).toBe('neutral');
    expect(worstTone(30)).toBe('success');
    expect(worstTone(60)).toBe('warning');
    expect(worstTone(95)).toBe('error');
  });
  it('shows money the hub left out as hidden, never as zero', () => {
    expect(moneyOrHidden(undefined, 'USDT')).toBe('hidden');
    expect(moneyOrHidden(0, 'USDT')).toBe('0.00 USDT');
    expect(moneyOrHidden(94.6, 'USDT')).toBe('94.60 USDT');
  });
  it('keeps each stake currency apart in a coin line', () => {
    expect(coinMoney({ USDT: 1830, CAD: 400 })).toBe('400.00 CAD + 1,830.00 USDT');
  });
});
