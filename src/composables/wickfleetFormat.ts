// Number formatting shared by the Wickfleet pages.
export const money = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
export const tone = (v: number) => (v > 0 ? 'text-green-600' : v < 0 ? 'text-red-600' : '');
// A rule side: prices with two decimals, predictions and flags with four.
export const ruleValue = (v: number) =>
  Math.abs(v) >= 1 ? money(v) : v.toFixed(4).replace(/\.?0+$/, '') || '0';
// The move still needed, for price rules only; a prediction's gap says nothing.
export const ruleGap = (r: { met: boolean; left: number; gap: number }) =>
  r.met || Math.abs(r.left) <= 1 ? '' : pct(r.gap * 100);
