import { measureRpcs } from '../src/performance/measure';
import axios from 'axios';

jest.mock('axios');

const mocked = axios as unknown as { post: jest.Mock };

describe('measureRpcs edge cases', () => {
  beforeEach(() => mocked.post.mockReset());
  it('filters out-of-sync block numbers and invalid bytecode', async () => {
    // Three RPCs: first two share block, third different; second has invalid code
    mocked.post
      // rpc1 block
      .mockResolvedValueOnce({ data: { result: { number: '0x10' } } })
      // rpc1 code (valid start)
      .mockResolvedValueOnce({ data: { result: '0x604060808152600ABC' } })
      // rpc2 block
      .mockResolvedValueOnce({ data: { result: { number: '0x10' } } })
      // rpc2 code (invalid)
      .mockResolvedValueOnce({ data: { result: '0x1234' } })
      // rpc3 block
      .mockResolvedValueOnce({ data: { result: { number: '0x11' } } })
      // rpc3 code (valid but different block number)
      .mockResolvedValueOnce({ data: { result: '0x604060808152600DEF' } });

    const { latencies } = await measureRpcs([
      { url: 'http://localhost:8545' } as any,
      { url: 'http://localhost:8546' } as any,
      { url: 'http://localhost:8547' } as any,
    ], { timeout: 50 });

    expect(Object.keys(latencies)).toEqual(['http://localhost:8545']);
  });
});
