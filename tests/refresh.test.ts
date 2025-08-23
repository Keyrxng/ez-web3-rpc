import { RPCHandler } from '../src';
import type { NetworkId } from '../types/handler';

let call = 0;
jest.mock('../src/strategy/getFastest', () => ({
  getFastest: jest.fn(async (rpcs: any[]) => {
    call++;
    const target = call === 1 ? rpcs[0].url : rpcs[1].url;
    return { fastest: target, latencies: { [target]: 10 }, checkResults: [] };
  })
}));

describe('RPCHandler refresh()', () => {
  const networkId = '31337' as NetworkId;
  it('updates provider on refresh with new fastest', async () => {
    const handler = new RPCHandler({
      networkId,
      strategy: 'fastest',
      settings: { tracking: 'none', networkRpcs: [
        { url: 'http://localhost:8561', tracking: 'none' },
        { url: 'http://localhost:8562', tracking: 'none' },
      ], browserLocalStorage: false, logLevel: 'error', rpcTimeout: 200, cacheRefreshCycles: 1 },
      proxySettings: { retryCount: 0, retryDelay: 0, rpcCallTimeout: 200 }
    });
    await handler.init();
    const first = handler.getProvider().connection.url;
    await handler.refresh();
    const second = handler.getProvider().connection.url;
    expect(first).not.toBe(second);
  });
});
