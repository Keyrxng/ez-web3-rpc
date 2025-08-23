import { RPCHandler } from '../src';
import type { JsonRpcRequest } from '../src/calls';

// Simple fetch mock helper
function mockFetch(responders: Record<string, any>) {
  const original = global.fetch;
  global.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const body = init?.body && JSON.parse(init.body);
    const key = url + '|' + body.method;
    const response = responders[key];
    if (!response) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', result: null, id: body?.id }), { status: 200 });
    }
    return new Response(JSON.stringify(response), { status: 200 });
  }) as any;
  return () => { global.fetch = original; };
}

describe('Consensus (src)', () => {
  const rpcUrls = ['http://localhost:7001','http://localhost:7002','http://localhost:7003'];
  function makeHandler() {
    return new RPCHandler({
      networkId: '31337',
      settings: { tracking: 'none', networkRpcs: rpcUrls.map(url => ({ url })), browserLocalStorage: false, logLevel: 'none', rpcTimeout: 5  },
      proxySettings: { retryCount: 0, retryDelay: 0, rpcCallTimeout: 20 },
      strategy: 'fastest'
    });
  }

  const req: JsonRpcRequest = { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 };

  it('reaches basic consensus (all identical)', async () => {
    const restore = mockFetch({
      'http://localhost:7001|eth_blockNumber': { jsonrpc: '2.0', result: '0x10', id: 1 },
      'http://localhost:7002|eth_blockNumber': { jsonrpc: '2.0', result: '0x10', id: 1 },
      'http://localhost:7003|eth_blockNumber': { jsonrpc: '2.0', result: '0x10', id: 1 },
    });
  const handler = makeHandler();
  // Limit to only mocked URLs to avoid unintended network calls
  handler.rpcs = rpcUrls.map(url => ({ url, tracking: 'none' } as any));
    const value = await handler.calls.consensus(req, '0.50');
    expect(value).toBe('0x10');
    restore();
  });

  it('BFT descent returns majority when lower threshold reached', async () => {
    const restore = mockFetch({
      'http://localhost:7001|eth_blockNumber': { jsonrpc: '2.0', result: '0x10', id: 1 },
      'http://localhost:7002|eth_blockNumber': { jsonrpc: '2.0', result: '0x10', id: 1 },
      'http://localhost:7003|eth_blockNumber': { jsonrpc: '2.0', result: '0x11', id: 1 },
    });
  const handler = makeHandler();
  handler.rpcs = rpcUrls.map(url => ({ url, tracking: 'none' } as any));
  // Directly test bftConsensus (internal attempt disallows early abort)
  const value = await handler.calls.bftConsensus(req, '0.90', '0.50');
  expect(value).toBe('0x10');
    restore();
  });
});
