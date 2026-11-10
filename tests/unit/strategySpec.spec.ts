import { describe, expect, it } from 'vitest';
import trendDaily from './fixtures/TrendDaily.json';
import freqaiTrend from './fixtures/FreqaiTrend.json';
import allKinds from './fixtures/AllKinds.json';
import {
  type Spec,
  metaOf,
  newSpec,
  refsFor,
  specToState,
  stateToSpec,
} from '@/composables/strategySpec';

// The hub's testdata specs; the generator proves these against freqtrade.
const fixtures: Record<string, Spec> = {
  TrendDaily: trendDaily as Spec,
  FreqaiTrend: freqaiTrend as Spec,
  AllKinds: allKinds as Spec,
};

describe('spec <-> Blockly state', () => {
  for (const [name, spec] of Object.entries(fixtures)) {
    it(`round-trips ${name} unchanged`, () => {
      const back = stateToSpec(metaOf(spec), specToState(spec));
      expect(JSON.parse(JSON.stringify(back))).toEqual(spec);
    });
  }

  it('reads a number comparison, a trend and a group mode', () => {
    const s = fixtures.AllKinds!;
    const state = specToState(s);
    const types = JSON.stringify(state);
    expect(types).toContain('"wf_cmp_num"');
    expect(types).toContain('"wf_trend"');
    expect(stateToSpec(metaOf(s), state).entry.any).toHaveLength(5);
  });

  it('ignores stray blocks outside the containers', () => {
    const state = specToState(newSpec());
    state.blocks.blocks.push({ type: 'wf_ind_rsi', x: 400, y: 400, fields: { ID: 'loose' } });
    expect(stateToSpec(metaOf(newSpec()), state).indicators.map((i) => i.id)).toEqual([
      'sma50',
      'sma200',
      'hi20',
    ]);
  });
});

describe('refsFor', () => {
  it('offers prices, ids, multi-value fields and model outputs only with a model', () => {
    const refs = refsFor(fixtures.AllKinds!.indicators, false);
    expect(refs).toContain('close');
    expect(refs).toContain('sma20');
    expect(refs).toContain('bb.upper');
    expect(refs).toContain('m.signal');
    expect(refs).not.toContain('bb');
    expect(refs).not.toContain('prediction');
    expect(refsFor([], true)).toContain('prediction');
  });
});
