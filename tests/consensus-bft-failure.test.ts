import { RPCHandler } from '../src';
import type { JsonRpcRequest } from '../src/calls';

describe('BFT consensus failure path', () => {
  beforeAll(() => {
    global.fetch = jest.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      const body = JSON.parse(init!.body);
      // Always yield distinct results so no quorum at any threshold
      const unique = '0x' + Math.random().toString(16).slice(2,10);
      return new Response(JSON.stringify({ jsonrpc:'2.0', result: unique, id: body.id }), { status: 200 });
    }) as any;
  });
  it('throws when descent reaches minimum threshold without quorum', async () => {
    const handler = new RPCHandler({
      networkId: '31337',
      strategy: 'fastest',
      settings: { tracking: 'none', networkRpcs: [
        { url: 'http://localhost:8556', tracking: 'none' },
        { url: 'http://localhost:8557', tracking: 'none' },
        { url: 'http://localhost:8558', tracking: 'none' },
      ], browserLocalStorage: false, logLevel: 'error', rpcTimeout: 10  },
      proxySettings: { retryCount: 0, retryDelay: 0, rpcCallTimeout: 50 }
    });
    const req: JsonRpcRequest = { jsonrpc:'2.0', method:'eth_blockNumber', params:[], id:1 };
    await expect(handler.calls.bftConsensus(req, '0.90', '0.80')).rejects.toThrow(/minimum threshold/);
  });
});
