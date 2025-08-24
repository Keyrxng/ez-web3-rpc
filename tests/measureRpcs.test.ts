import { measureRpcs } from '../src/performance/measure';

describe('measureRpcs edge cases', () => {
  beforeEach(() => jest.clearAllMocks());
  it('filters out-of-sync block numbers and invalid bytecode', async () => {
    const { latencies } = await measureRpcs([
      { url: 'http://localhost:8545' } as any,
      { url: 'http://localhost:8546' } as any,
      { url: 'http://localhost:8547' } as any,
    ], { timeout: 1000 });

    expect(Object.keys(latencies)).toEqual(['http://localhost:8545']);
  });
});
