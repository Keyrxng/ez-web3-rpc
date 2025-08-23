import { RPCHandler } from '../src';
import { LOCAL_HOST } from '../types/constants';
import * as fastest from '../src/strategy/getFastest';
import * as firstHealthy from '../src/strategy/getFirstHealthy';

describe('RPCHandler error & log branches', () => {
  function make(opts: any = {}) {
    return new RPCHandler({
      networkId: '31337' as any,
      strategy: opts.strategy || 'fastest',
  settings: { tracking: 'none', networkRpcs: [ { url: LOCAL_HOST, tracking: 'none' } ], browserLocalStorage: false, logLevel: 'debug', rpcTimeout: 5, cacheRefreshCycles: 1 },
      proxySettings: { retryCount: 0, retryDelay: 0, rpcCallTimeout: 50 },
    } as any);
  }

  it('throws when getProvider called before init', () => {
    const h = make();
    expect(()=>h.getProvider()).toThrow('Provider not initialized');
  });

  it('refresh fastest logs warn when no fastest', async () => {
    const h = make();
    const logs: any[] = [];
    (h as any).logger = { log: (lvl: any, msg: string, meta?: any)=> logs.push({lvl,msg,meta}) };
    jest.spyOn(fastest, 'getFastest').mockResolvedValue({ fastest: null, latencies: {}, checkResults: [] } as any);
    await h.refresh();
    expect(logs.some(l=>l.msg==='No fastest provider found')).toBe(true);
  });

  it('refresh firstHealthy logs warn when none healthy', async () => {
    const h = make({ strategy: 'firstHealthy' });
    const logs: any[] = [];
    (h as any).logger = { log: (lvl: any, msg: string, meta?: any)=> logs.push({lvl,msg,meta}) };
    jest.spyOn(firstHealthy, 'getFirstHealthy').mockResolvedValue(null as any);
    await h.refresh();
    expect(logs.some(l=>l.msg==='No healthy provider found')).toBe(true);
  });

  it('suppresses verbose & ok logs based on level', () => {
    const h = make();
    const calls: any[] = [];
    (h as any).logger = { log: (...a: any[]) => calls.push(a) };
    (h as any).config.settings.logLevel = 'error';
    (h as any)._logProxy('verbose','should-not');
    (h as any)._logProxy('ok','init ok');
    (h as any)._logProxy('error','boom');
  // ok log is downgraded to info but filtered by level=error so only error appears
  const errorCalls = calls.filter(c=>c[0]==='error');
  expect(errorCalls.length).toBe(1);
  expect(errorCalls[0][1]).toBe('boom');
  });
});
