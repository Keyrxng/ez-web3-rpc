import { JsonRpcProvider } from '@ethersproject/providers';
import { wrapWithRetry } from '../src/provider/retryProxy';

describe('retryProxy fatal path', () => {
  it('throws after exhausting all retries and batches', async () => {
    const base = new JsonRpcProvider({ url: 'http://localhost:8555', skipFetchSetup: true }, 31337);
    jest.spyOn((JsonRpcProvider as any).prototype, 'send').mockImplementation(() => Promise.reject(new Error('fail')));
    const proxy = wrapWithRetry(base, { retryCount: 1, retryDelay: 1, getOrderedUrls: () => ['http://localhost:8555', 'http://localhost:8556', 'http://localhost:8557', 'http://localhost:8558'], chainId: 31337, rpcCallTimeout: 50, onLog: () => { }, refresh: async () => { } });
    await expect((proxy as any).send('eth_blockNumber', [])).rejects.toThrow('fail');
  });
});
