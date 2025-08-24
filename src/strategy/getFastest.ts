import { measureRpcs } from '../performance/measure';
import { pickFastest } from '../performance/pickFastest';
import { Rpc } from '../..';

export async function getFastest(rpcs: Rpc[], opts: { timeout: number }) {
  const { latencies, checkResults } = await measureRpcs(rpcs, { timeout: opts.timeout });
  const fastest = pickFastest(latencies);
  return { fastest, latencies, checkResults };
}