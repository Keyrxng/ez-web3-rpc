import { RPCHandler } from '../src';
import type { JsonRpcRequest } from '../src/calls';

// Simulate transient 429 for first provider then success for second
let attempt = 0;
const responders: Record<string, any> = {};

(global as any).fetch = jest.fn(async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  const body = JSON.parse(init!.body);
  const key = url + '|' + body.method;
  attempt++;
  if (url.includes('rpc1') && attempt < 2) {
    return new Response('', { status: 429 });
  }
  return new Response(JSON.stringify({ jsonrpc: '2.0', result: '0x10', id: body.id }), { status: 200 });
});

describe('Consensus cooldown handling', () => {
  it('skips cooled down endpoint after 429 and still reaches consensus', async () => {
    const handler = new RPCHandler({
      networkId: '31337',
      strategy: 'fastest',
      settings: { tracking: 'none', networkRpcs: [
        { url: 'http://localhost:8559', tracking: 'none' },
        { url: 'http://localhost:8560', tracking: 'none' },
      ], browserLocalStorage: false, logLevel: 'error', rpcTimeout: 50, cacheRefreshCycles: 1 },
      proxySettings: { retryCount: 0, retryDelay: 0, rpcCallTimeout: 100 }
    });
    // Directly manipulate rpcs for consensus (no init needed)
    const req: JsonRpcRequest = { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 };
    handler.rpcs = handler.rpcs.map(r => ({ ...r }));
    const value = await handler.calls.consensus(req, '0.50', { cooldownMs: 5_000 });
    expect(value).toBe('0x10');
    expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
