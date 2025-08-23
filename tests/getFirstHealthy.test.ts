import { getFirstHealthy } from '../src/strategy/getFirstHealthy';
import * as measure from '../src/performance/measure';

describe('getFirstHealthy', () => {
  it('returns null when no https RPCs', async () => {
    const res = await getFirstHealthy([{ url: 'http://localhost:8551' } as any], { timeout: 1000 });
    expect(res).toBeNull();
  });

  it('iterates until it finds healthy', async () => {
    const good = 'https://localhost:8565';
    const bad = 'https://localhost:8566';
    const spy = jest.spyOn(measure, 'measureRpcs').mockImplementation(async (rpcs: any[]) => {
      const url = rpcs[0].url;
      if (url === good) return { latencies: { [url]: 12 }, checkResults: [] } as any;
      return { latencies: {}, checkResults: [] } as any;
    });
    const res = await getFirstHealthy([
      { url: bad } as any,
      { url: good } as any
    ], { timeout: 1000, http: true });
    expect(res).toBe(good);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1); // shuffle may test good first
    expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
