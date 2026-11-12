// Helpers for the Compare and Risk pages. A missing figure reads n/a, never 0.
import type { CompareMetrics, CompareRow } from './useWickfleet';
import { money } from './wickfleetFormat';

export const maybe = (v: number | undefined, digits = 2) =>
  v === undefined || v === null ? 'n/a' : v.toFixed(digits);

/** Seconds in the two largest units: 30d 15h, 5h 30m, 45m. */
export function duration(s: number | undefined): string {
  if (s === undefined || s === null) return 'n/a';
  const units: [string, number][] = [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
  ];
  const parts: string[] = [];
  let rest = Math.round(s);
  for (const [u, n] of units) {
    const q = Math.floor(rest / n);
    if (q > 0 || parts.length) {
      if (q > 0) parts.push(`${q}${u}`);
      rest -= q * n;
    }
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(' ') : '0m';
}

/** The bot with the best value, '' when fewer than two bots have one. */
export function best(
  rows: CompareRow[],
  pick: (m: CompareMetrics) => number | undefined,
  higher: boolean,
): string {
  const have = rows
    .filter((r) => r.metrics && pick(r.metrics) !== undefined)
    .map((r) => ({ bot: r.bot, v: pick(r.metrics!) as number }));
  if (have.length < 2) return '';
  have.sort((a, b) => (higher ? b.v - a.v : a.v - b.v));
  return have[0]!.bot;
}

/** Return-% curves of the bots that have one, on the comparison's shared dates. */
export function overlay(rows: CompareRow[]): {
  dates: string[];
  series: { name: string; data: number[] }[];
} {
  const withCurve = rows.filter((r) => r.equity?.length);
  return {
    dates: withCurve[0]?.equity?.map((p) => p.date) ?? [],
    series: withCurve.map((r) => ({ name: r.bot, data: r.equity!.map((p) => p.return_pct) })),
  };
}

export const progress = (rows: CompareRow[]) =>
  `${rows.filter((r) => r.state === 'done' || r.state === 'failed').length} of ${rows.length} finished`;

/** Current drawdown against the worst so far: green under half, red from 80%. */
export function worstTone(
  ofWorst: number | undefined,
): 'neutral' | 'success' | 'warning' | 'error' {
  if (ofWorst === undefined || ofWorst === null) return 'neutral';
  if (ofWorst >= 80) return 'error';
  if (ofWorst >= 50) return 'warning';
  return 'success';
}

/** Money per stake currency, never summed across currencies. */
export const coinMoney = (m: Record<string, number>) =>
  Object.keys(m)
    .sort()
    .map((k) => `${money(m[k]!)} ${k}`)
    .join(' + ');

/** Money the hub left out for a viewer reads hidden, never 0. */
export const moneyOrHidden = (v: number | undefined, stake: string) =>
  v === undefined || v === null ? 'hidden' : `${money(v)} ${stake}`;
