import { RPCHandler } from '../src';
import type { NetworkId } from '../';

// Mock getFastest to control latencies and fastest
jest.mock('../src/strategy/getFastest', () => ({
  getFastest: jest.fn(async (rpcs: any[]) => ({ fastest: rpcs[0].url, latencies: { [rpcs[0].url]: 5 }, checkResults: [] }))
}));

describe('Persistence (localStorage)', () => {
  const store: Record<string,string> = {};
  (global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; }
  };
  const networkId = '31337' as NetworkId;
  it('writes latencies to localStorage on init when enabled', async () => {
    const handler = new RPCHandler({
      networkId,
      strategy: 'fastest',
  settings: { tracking: 'none', networkRpcs: [ { url: 'http://localhost:8554', tracking: 'none' } ], browserLocalStorage: true, logLevel: 'error', rpcTimeout: 10  },
      proxySettings: { retryCount: 0, retryDelay: 0, rpcCallTimeout: 20 }
    });
    await handler.init();
    const key = `rpcLatencies-${networkId}`;
    expect(store[key]).toBeDefined();
  const parsed = JSON.parse(store[key]);
  // We mocked getFastest to assign latency 5 to the first RPC in the resolved base set.
  // Depending on network defaults, our injected RPC may not be first. Just assert persistence structure & value.
  expect(Object.values(parsed.latencies)).toContain(5);
  });
});
