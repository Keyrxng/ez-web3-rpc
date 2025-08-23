import { RPCHandler } from '../src';
import type { NetworkId } from '../types/handler';
import type { RpcHandlerOptions } from '../src/rpc-handler';

// Requires Anvil running at 127.0.0.1:8545 (forked so permit2 code is present)

const networkId = '31337' as NetworkId;

function makeHandler(extra: Partial<RpcHandlerOptions> = {}) {
  const base: RpcHandlerOptions = {
    networkId,
    strategy: 'fastest',
    settings: {
      tracking: 'none',
      networkRpcs: [
        { url: 'http://127.0.0.1:9999', tracking: 'none' }, // bad
        { url: 'http://127.0.0.1:1234', tracking: 'none' }, // bad
        { url: 'http://127.0.0.1:8545', tracking: 'none' }, // good anvil
      ],
      browserLocalStorage: false,
      logLevel: 'error',
      rpcTimeout: 1200,
    },
    proxySettings: { retryCount: 2, retryDelay: 25, rpcCallTimeout: 1500 },
  } as any;
  return new RPCHandler({ ...base, ...extra });
}

describe('Call Handler integration', () => {
  it('initializes fastest provider and performs basic read calls', async () => {
    const handler = makeHandler();
    await handler.init();
    const provider = handler.getProvider();
    const block = await provider.send('eth_blockNumber', []);
    expect(parseInt(block)).toBeGreaterThan(0);
    // Simple eth_call to zero address (expected 0x)
    const res = await provider.send('eth_call', [ { to: '0x0000000000000000000000000000000000000000', data: '0x' }, 'latest' ]);
    expect(typeof res).toBe('string');
    expect(res.startsWith('0x')).toBe(true);
  }, 20000);

  it('filters failing RPCs keeping only healthy one', async () => {
    const handler = makeHandler();
    await handler.init();
    const latencies = handler.getLatencies();
    const urls = Object.keys(latencies);
    expect(urls.length).toBe(1);
    expect(urls[0]).toContain('127.0.0.1:8545');
  }, 20000);

  it('propagates RPC errors from invalid params after retries', async () => {
    const handler = makeHandler();
    await handler.init();
    const provider = handler.getProvider();
    await expect(provider.send('eth_call', [null, null, null, 'latest'] as any)).rejects.toBeInstanceOf(Error);
  }, 20000);
});
