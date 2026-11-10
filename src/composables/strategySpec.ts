// Wickfleet strategy spec (hub internal/strategy, v1) and its Blockly form.
// spec <-> workspace state are pure functions on Blockly's JSON serialization,
// so they are tested without a canvas; the page loads the state into Blockly.

export type Operand = string | number;

export interface Condition {
  left: string;
  op: string;
  right?: Operand;
  bars?: number;
}

export interface Group {
  all?: Condition[];
  any?: Condition[];
}

export interface Indicator {
  id: string;
  kind: string;
  source?: string;
  period?: number;
  shift?: number;
  stddev?: number;
  fast?: number;
  slow?: number;
  signal?: number;
  smooth_k?: number;
  smooth_d?: number;
}

export interface Spec {
  version: 1;
  name: string;
  author?: string;
  description?: string;
  timeframe: string;
  stoploss: number;
  roi?: Record<string, number>;
  trailing?: { positive: number; offset?: number; only_offset_reached?: boolean };
  indicators: Indicator[];
  entry: Group;
  exit: Group;
  model?: { features: 'freqai_example'; target: 'mean_return' };
  startup_candles?: number;
  entry_guard?: { max_above_close: number };
}

/** Everything but the rules: edited in the form next to the canvas. */
export type SpecMeta = Omit<Spec, 'indicators' | 'entry' | 'exit'>;

/** Parameters each indicator kind takes, in display order. */
export const KIND_PARAMS: Record<string, (keyof Indicator)[]> = {
  sma: ['source', 'period', 'shift'],
  ema: ['source', 'period', 'shift'],
  tema: ['source', 'period', 'shift'],
  highest: ['source', 'period', 'shift'],
  lowest: ['source', 'period', 'shift'],
  rsi: ['source', 'period'],
  atr: ['period'],
  adx: ['period'],
  bollinger: ['source', 'period', 'stddev'],
  macd: ['source', 'fast', 'slow', 'signal'],
  stoch: ['period', 'smooth_k', 'smooth_d'],
};

/** Outputs of multi-value indicators, referenced as id.field. */
export const KIND_FIELDS: Record<string, string[]> = {
  bollinger: ['upper', 'middle', 'lower'],
  macd: ['macd', 'signal', 'hist'],
  stoch: ['k', 'd'],
};

export const PRICES = ['close', 'open', 'high', 'low', 'volume'];
export const MODEL_REFS = ['prediction', 'do_predict'];
export const COMPARE_OPS = ['>', '<', '>=', '<=', 'crosses_above', 'crosses_below'];
export const NUMBER_OPS = [...COMPARE_OPS, '=='];

/** Every name a condition may use for these indicators. */
export function refsFor(indicators: Indicator[], model: boolean): string[] {
  const out = [...PRICES];
  for (const ind of indicators) {
    const fields = KIND_FIELDS[ind.kind];
    if (fields) out.push(...fields.map((f) => `${ind.id}.${f}`));
    else out.push(ind.id);
  }
  if (model) out.push(...MODEL_REFS);
  return out;
}

// --- Blockly JSON state -----------------------------------------------------

interface BlockState {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  fields?: Record<string, string | number>;
  inputs?: Record<string, { block?: BlockState }>;
  next?: { block?: BlockState };
}

export interface WorkspaceState {
  blocks: { languageVersion: 0; blocks: BlockState[] };
}

const upper = (k: string) => k.toUpperCase();

/** Chain blocks through next, first block first. */
function chain(blocks: BlockState[]): BlockState | undefined {
  for (let i = blocks.length - 2; i >= 0; i--) blocks[i]!.next = { block: blocks[i + 1] };
  return blocks[0];
}

function unchain(first?: BlockState): BlockState[] {
  const out: BlockState[] = [];
  for (let b = first; b; b = b.next?.block) out.push(b);
  return out;
}

function indicatorBlock(ind: Indicator): BlockState {
  const fields: Record<string, string | number> = { ID: ind.id };
  for (const p of KIND_PARAMS[ind.kind] ?? []) {
    const v = ind[p];
    fields[upper(p)] = v === undefined ? (p === 'shift' ? 0 : '') : (v as string | number);
  }
  return { type: `wf_ind_${ind.kind}`, fields };
}

function conditionBlock(c: Condition): BlockState {
  if (c.op === 'rising' || c.op === 'falling') {
    return { type: 'wf_trend', fields: { LEFT: c.left, DIR: c.op, BARS: c.bars ?? 1 } };
  }
  if (typeof c.right === 'number') {
    return { type: 'wf_cmp_num', fields: { LEFT: c.left, OP: c.op, RIGHT: c.right } };
  }
  return { type: 'wf_cmp', fields: { LEFT: c.left, OP: c.op, RIGHT: c.right ?? '' } };
}

function groupBlock(type: 'wf_entry' | 'wf_exit', g: Group, y: number): BlockState {
  const mode = g.any?.length ? 'any' : 'all';
  const conds = (mode === 'any' ? g.any : g.all) ?? [];
  const first = chain(conds.map(conditionBlock));
  return {
    type,
    x: 20,
    y,
    fields: { MODE: mode },
    inputs: first ? { CONDS: { block: first } } : {},
  };
}

/** The rules of a spec as a Blockly workspace. */
export function specToState(s: Pick<Spec, 'indicators' | 'entry' | 'exit'>): WorkspaceState {
  const first = chain(s.indicators.map(indicatorBlock));
  return {
    blocks: {
      languageVersion: 0,
      blocks: [
        { type: 'wf_indicators', x: 20, y: 20, inputs: first ? { ITEMS: { block: first } } : {} },
        groupBlock('wf_entry', s.entry, 20 + 60 * (s.indicators.length + 2)),
        groupBlock('wf_exit', s.exit, 20 + 60 * (s.indicators.length + 2) + 220),
      ],
    },
  };
}

function toIndicator(b: BlockState): Indicator {
  const kind = b.type.replace(/^wf_ind_/, '');
  const f = b.fields ?? {};
  const ind: Indicator = { id: String(f.ID ?? ''), kind };
  for (const p of KIND_PARAMS[kind] ?? []) {
    const v = f[upper(p)];
    if (p === 'source') ind.source = String(v ?? '');
    else if (v !== undefined && v !== '' && !(p === 'shift' && Number(v) === 0)) {
      (ind as unknown as Record<string, number>)[p] = Number(v);
    }
  }
  return ind;
}

function toCondition(b: BlockState): Condition {
  const f = b.fields ?? {};
  if (b.type === 'wf_trend') {
    return { left: String(f.LEFT), op: String(f.DIR), bars: Number(f.BARS) };
  }
  if (b.type === 'wf_cmp_num') {
    return { left: String(f.LEFT), op: String(f.OP), right: Number(f.RIGHT) };
  }
  return { left: String(f.LEFT), op: String(f.OP), right: String(f.RIGHT) };
}

function toGroup(b?: BlockState): Group {
  if (!b) return { all: [] };
  const conds = unchain(b.inputs?.CONDS?.block).map(toCondition);
  return b.fields?.MODE === 'any' ? { any: conds } : { all: conds };
}

/**
 * Read the rules back out of a workspace. Stray top-level blocks (dragged
 * out of a container) are ignored, as Blockly shows them disabled.
 */
export function stateToSpec(meta: SpecMeta, state: WorkspaceState): Spec {
  const tops = state.blocks?.blocks ?? [];
  const find = (t: string) => tops.find((b) => b.type === t);
  const indicators = unchain(find('wf_indicators')?.inputs?.ITEMS?.block).map(toIndicator);
  return {
    ...meta,
    indicators,
    entry: toGroup(find('wf_entry')),
    exit: toGroup(find('wf_exit')),
  };
}

/** A sensible start: TrendDaily's rules. */
export function newSpec(name = 'MyStrategy'): Spec {
  return {
    version: 1,
    name,
    description: '',
    timeframe: '1d',
    stoploss: -0.2,
    indicators: [
      { id: 'sma50', kind: 'sma', source: 'close', period: 50 },
      { id: 'sma200', kind: 'sma', source: 'close', period: 200 },
      { id: 'hi20', kind: 'highest', source: 'high', period: 20, shift: 1 },
    ],
    entry: {
      all: [
        { left: 'close', op: '>', right: 'sma200' },
        { left: 'close', op: '>', right: 'hi20' },
      ],
    },
    exit: { any: [{ left: 'close', op: '<', right: 'sma50' }] },
  };
}

/** The form part of a spec. */
export function metaOf(s: Spec): SpecMeta {
  const meta: Partial<Spec> = { ...s };
  delete meta.indicators;
  delete meta.entry;
  delete meta.exit;
  return meta as SpecMeta;
}
