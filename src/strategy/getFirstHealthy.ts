import { measureRpcs } from '../performance/measure';
import { Rpc } from '../../types/handler';

// Shuffle utility
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Find first healthy RPC by running health checks sequentially after parallel pre-flight.
 *
 * If no healthy RPC is found, returns null.
 *
 * Note: HTTP RPCs are only checked if the `http` option is enabled. (i.e localhost)
 */
export async function getFirstHealthy(rpcs: Rpc[], opts: { timeout: number, http?: boolean }): Promise<string | null> {
  const httpsRpcs = rpcs.filter((r: any) => (r.url || r).startsWith('https://') || (opts.http && (r.url || r).startsWith('http://')));
  if (!httpsRpcs.length) return null;
  const shuffled = shuffle(httpsRpcs);
  for (const rpc of shuffled) {
    const url = (rpc as any).url || rpc;
    const { latencies } = await measureRpcs([{ url } as any], { timeout: opts.timeout });
    if (Object.keys(latencies).length) return url;
  }
  return null;
}

