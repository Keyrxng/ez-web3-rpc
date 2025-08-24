import { JsonRpcProvider } from '@ethersproject/providers';
import { wrapWithRetry } from '../src/provider/retryProxy';

describe('wrapWithRetry', () => {
  function makeBase(url: string) { return new JsonRpcProvider({ url, skipFetchSetup: true }, 31337); }

  it('returns first success from batch', async () => {
  const base = makeBase('http://localhost:8559');
  let calls: string[] = [];
  const ordered = ['http://localhost:8559','http://localhost:8560','http://localhost:8561'];
    const proxy = wrapWithRetry(base, {
      retryCount: 1,
      retryDelay: 1,
      getOrderedUrls: () => ordered,
      chainId: 31337,
      rpcCallTimeout: 100,
      onLog: ()=>{},
      refresh: async ()=>{}
    });
    // monkey patch send on new providers created inside proxy
    const orig = (JsonRpcProvider as any);
    jest.spyOn(orig.prototype, 'send').mockImplementation(function(this: any, method: any){
      const u = this.connection.url; calls.push(u+':'+String(method));
      if (u==='http://localhost:8560') return Promise.resolve('ok');
      return Promise.reject(new Error('fail'));
    });

    const res = await (proxy as any).send('eth_blockNumber', []);
    expect(res).toBe('ok');
  expect(calls.some(c=>c.startsWith('http://localhost:8560'))).toBe(true);
  });

  it('retries batches then throws after exhausting', async () => {
  const base = makeBase('http://localhost:8562');
  const ordered = ['http://localhost:8562','http://localhost:8563'];
    const proxy = wrapWithRetry(base, { retryCount: 2, retryDelay: 1, getOrderedUrls: () => ordered, chainId: 31337, rpcCallTimeout: 50, onLog: ()=>{}, refresh: async ()=>{} });
    jest.spyOn((JsonRpcProvider as any).prototype, 'send').mockImplementation(()=>Promise.reject(new Error('boom')));
    await expect((proxy as any).send('eth_blockNumber', [])).rejects.toThrow(/boom/);
  });
});
