import { RPCHandler } from '../src';
import type { NetworkId } from '../';
import * as firstHealthyMod from '../src/strategy/getFirstHealthy';

describe('RPCHandler strategy=firstHealthy', () => {
  const networkId = '31337' as NetworkId;
  it('initializes using mocked first healthy URL', async () => {
  jest.spyOn(firstHealthyMod, 'getFirstHealthy').mockResolvedValue('http://localhost:8563' as any);
  const handler = new RPCHandler({
      networkId,
      strategy: 'firstHealthy',
      settings: { tracking: 'none', networkRpcs: [
    { url: 'http://localhost:8563', tracking: 'none' },
    { url: 'http://localhost:8564', tracking: 'none' },
    { url: 'http://localhost:8545', tracking: 'none' },
      ], browserLocalStorage: false, logLevel: 'error', rpcTimeout: 500  },
      proxySettings: { retryCount: 0, retryDelay: 0, rpcCallTimeout: 500 }
    });
    await handler.init();
    const provider = handler.getProvider();
  expect(provider.connection.url).toBe('http://localhost:8563');
  });
});
