import { describe, it, expect } from 'vitest';
import { planSync } from '@/composables/useWickfleet';

const o = 'https://trade.example.org';

describe('planSync', () => {
  it('adds hub bots that are not logged in yet', () => {
    const plan = planSync(
      o,
      [{ name: 'trend' }, { name: 'freqai' }],
      [{ botId: 'ftbot.1', botUrl: `${o}/bots/trend` }],
    );
    expect(plan).toEqual({ add: ['freqai'], remove: [] });
  });
  it('removes hub bots the hub no longer lists', () => {
    const plan = planSync(
      o,
      [{ name: 'trend' }],
      [
        { botId: 'ftbot.1', botUrl: `${o}/bots/trend` },
        { botId: 'ftbot.2', botUrl: `${o}/bots/gone` },
      ],
    );
    expect(plan).toEqual({ add: [], remove: ['ftbot.2'] });
  });
  it('never touches bots added by hand elsewhere', () => {
    const plan = planSync(
      o,
      [],
      [
        { botId: 'ftbot.1', botUrl: 'http://127.0.0.1:8080' },
        { botId: 'ftbot.2', botUrl: 'https://other.example.org/bots/x' },
      ],
    );
    expect(plan).toEqual({ add: [], remove: [] });
  });
  it('does not treat a longer name as the same bot', () => {
    const plan = planSync(
      o,
      [{ name: 'trend' }],
      [{ botId: 'ftbot.1', botUrl: `${o}/bots/trend-ndax` }],
    );
    expect(plan).toEqual({ add: ['trend'], remove: ['ftbot.1'] });
  });
});
