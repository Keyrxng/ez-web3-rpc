import { RPCHandler } from '../src';
import { LOCAL_HOST, LOCAL_HOST_2 } from '../types/constants';

describe('consensus object stable stringify', () => {
  const handler = new RPCHandler({
    networkId: '999999' as any,
    strategy: 'fastest',
    settings: { tracking: 'none', networkRpcs: [], browserLocalStorage: false, logLevel: 'error', rpcTimeout: 5, cacheRefreshCycles: 1 },
    proxySettings: { retryCount: 0, retryDelay: 0, rpcCallTimeout: 50 }
  });
  (handler as any).rpcs = [ { url: LOCAL_HOST, tracking: 'none' }, { url: LOCAL_HOST_2, tracking: 'none' }, { url: 'http://127.0.0.1:8547', tracking: 'none' } ];

  it('treats structurally equal objects with different key order as same result', async () => {
    const results = [
      { result: { b:2, a:1 } },
      { result: { a:1, b:2 } },
      { result: { b:2, a:1 } },
    ];
    let call = 0;
    // @ts-ignore
    global.fetch = jest.fn(async ()=> ({ ok: true, json: async () => results[call++] })) as any;

    const val = await handler.calls.consensus({ jsonrpc:'2.0', method:'eth_blockNumber', params:[], id: 7 }, '0.6');
    expect(val).toEqual({ a:1, b:2 });
  });
});
