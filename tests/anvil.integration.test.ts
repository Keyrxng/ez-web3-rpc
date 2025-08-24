import { RPCHandler } from '../src';
// Integration test expects an Anvil instance at 127.0.0.1:8545.
// No fallback or skip logic; will fail fast if Anvil isn't running.

import type { NetworkId, RpcHandlerOptions } from '../';

const baseConfig: Omit<RpcHandlerOptions, 'strategy'> = {
  networkId: '31337' as NetworkId,
  settings: { tracking: 'none' as const, networkRpcs: [{ url: 'http://127.0.0.1:8545', tracking: 'none' as const }], browserLocalStorage: false, logLevel: 'error' as const, rpcTimeout: 800 },
  proxySettings: { retryCount: 1, retryDelay: 10, rpcCallTimeout: 1_000 },
};

describe('Anvil integration', () => {
  it('init fastest strategy and get block number', async () => {
    const handler = new RPCHandler({ ...baseConfig, strategy: 'fastest' });
    await handler.init();
    const provider = handler.getProvider();
    const bn = await provider.send('eth_blockNumber', []);
    expect(parseInt(bn)).toBeGreaterThan(0);
  }, 15000);

  it('perform eth_call via retry proxy', async () => {
    const handler = new RPCHandler({ ...baseConfig, strategy: 'fastest' });
    await handler.init();
    const provider = handler.getProvider();
    const res = await provider.send('eth_call', [{ to: '0x0000000000000000000000000000000000000000', data: '0x' }, 'latest']);
    expect(typeof res).toBe('string');
    expect(res.startsWith('0x')).toBe(true);
  }, 15000);

  it('consensus across single local node should error (needs >1)', async () => {
    const handler = new RPCHandler({ ...baseConfig, strategy: 'fastest' });
    handler.rpcs = [{ url: 'http://127.0.0.1:8545', tracking: 'none' } as any];
    await expect(handler.calls.consensus({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }, '0.50')).rejects.toThrow(/Only one RPC/);
  });
});
