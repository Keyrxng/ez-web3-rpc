import { RPCHandler } from '../src';
import type { RpcHandlerOptions } from '../src/rpc-handler';

// NOTE: These tests focus on constructor + config normalization + tracking filter logic.
// Network calls for latency measurement are NOT executed here to keep tests deterministic.
// Integration/latency tests can be added with mocked axios/fetch if needed.

describe('RPCHandler (src)', () => {
  function makeConfig(partial: Partial<RpcHandlerOptions> = {}): RpcHandlerOptions {
    return {
      networkId: '31337',
      providerLib: 'ethers',
      strategy: 'fastest',
      settings: {
        tracking: partial.settings?.tracking ?? 'none',
        networkRpcs: partial.settings?.networkRpcs,
        browserLocalStorage: false,
        rpcTimeout: 10,
        cacheRefreshCycles: 2,
        logLevel: 'none',
      },
      proxySettings: { retryCount: 1, retryDelay: 1, rpcCallTimeout: 50 },
      injectedRpcs: undefined as any, // placeholder (not part of public interface, ignore TS),
      ...partial,
    } as any;
  }

  it('constructs and exposes injected RPC list filtered by tracking', () => {
    const injected = [
      { url: 'http://localhost:1111', tracking: 'none' as const },
      { url: 'http://localhost:2222', tracking: 'limited' as const },
      { url: 'http://localhost:3333', tracking: 'yes' as const },
    ];
    const baseNone = new RPCHandler(makeConfig({ settings: { tracking: 'none', networkRpcs: injected } }));
    const urlsNone = baseNone.rpcs.map(r => r.url);
    // Should only include tracking==='none' injected + exclude limited/yes
    expect(urlsNone).toContain('http://localhost:1111');
    expect(urlsNone).not.toContain('http://localhost:2222');
    expect(urlsNone).not.toContain('http://localhost:3333');

    const baseLimited = new RPCHandler(makeConfig({ settings: { tracking: 'limited', networkRpcs: injected } }));
    const urlsLimited = baseLimited.rpcs.map(r => r.url);
    expect(urlsLimited).toEqual(expect.arrayContaining(['http://localhost:1111','http://localhost:2222']));
    expect(urlsLimited).not.toContain('http://localhost:3333');

    const baseYes = new RPCHandler(makeConfig({ settings: { tracking: 'yes', networkRpcs: injected } }));
    const urlsYes = baseYes.rpcs.map(r => r.url);
    expect(urlsYes).toEqual(expect.arrayContaining(['http://localhost:1111','http://localhost:2222','http://localhost:3333']));
  });

  it('initially has no provider and empty latencies', () => {
    const handler = new RPCHandler(makeConfig());
    expect(() => handler.getProvider()).toThrow(/Provider not initialized/);
    expect(handler.getLatencies()).toEqual({});
  });
});
