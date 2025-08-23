import { RPCHandler } from '../src';
import { LOCAL_HOST, LOCAL_HOST_2 } from '../types/constants';

describe('consensus error early exits', () => {
  const baseOpts = {
    settings: { tracking: 'none', networkRpcs: [], browserLocalStorage: false, logLevel: 'error', rpcTimeout: 5, cacheRefreshCycles: 1 },
    proxySettings: { retryCount: 0, retryDelay: 0, rpcCallTimeout: 50 },
  } as any;

  it('errors when no RPCs available', async () => {
    const h = new RPCHandler({ networkId: '999999' as any, strategy: 'fastest', ...baseOpts });
    // force empty
    (h as any).rpcs = [];
    await expect(h.calls.consensus({ jsonrpc:'2.0', method:'eth_blockNumber', params:[], id:1 }, '0.6')).rejects.toThrow('No RPCs available for consensus');
  });

  it('errors when only one RPC available', async () => {
  const h = new RPCHandler({ networkId: '999999' as any, strategy: 'fastest', ...baseOpts });
  (h as any).rpcs = [ { url: LOCAL_HOST, tracking:'none' } ];
    await expect(h.calls.consensus({ jsonrpc:'2.0', method:'eth_blockNumber', params:[], id:2 }, '0.6')).rejects.toThrow('Only one RPC available, could not reach consensus');
  });
});
