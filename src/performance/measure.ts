import { PERMIT2_ADDRESS } from '../../types/constants';
import { Rpc } from '../../types/handler';

export type LatencyMap = { [url: string]: number; }

type JsonRpcPayload = { jsonrpc: '2.0'; method: string; params: any[]; id: number };

const blockPayload: JsonRpcPayload = { jsonrpc: '2.0', method: 'eth_getBlockByNumber', params: ['latest', false], id: 1 };
const codePayload: JsonRpcPayload = { jsonrpc: '2.0', method: 'eth_getCode', params: [PERMIT2_ADDRESS, 'latest'], id: 1 };

type RpcCheckResult = { url: string; success: boolean; duration: number; blockNumber?: string; bytecodeOk?: boolean; }

function isPermit2BytecodeValid(bytecode: string | undefined): boolean {
  if (!bytecode) return false;
  const expected = '0x604060808152600';
  return bytecode.substring(0, expected.length) === expected;
}

async function post(url: string, payload: JsonRpcPayload, timeout: number): Promise<{ ok: boolean; data?: any; duration: number; error?: string; }>{
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });
    const data = await res.json();
    return { ok: !!data.result, data, duration: performance.now() - started };
  } catch (e) {
    return { ok: false, error: String(e), duration: performance.now() - started };
  }
}

// Measure RPCs: run block + code requests in parallel, validate common block number logic later externally.
export async function measureRpcs(rpcs: Rpc[], opts: { timeout: number }): Promise<{ latencies: LatencyMap; checkResults: RpcCheckResult[] }>{
  const tasks: Promise<RpcCheckResult>[] = [];
  for (const rpc of rpcs) {
    const url = (rpc as any).url || rpc; // current Rpc type object with url prop
    tasks.push((async () => {
      const [blockRes, codeRes] = await Promise.all([
        post(url, blockPayload, opts.timeout),
        post(url, codePayload, opts.timeout),
      ]);
      let blockNumber: string | undefined;
      if (blockRes.ok && blockRes.data?.result?.number) blockNumber = blockRes.data.result.number;
      const bytecode = codeRes.data?.result;
      const success = blockRes.ok && codeRes.ok && isPermit2BytecodeValid(bytecode);
      const duration = Math.max(blockRes.duration, codeRes.duration); // approximate overall
      return { url, success, duration, blockNumber, bytecodeOk: isPermit2BytecodeValid(bytecode) } as RpcCheckResult;
    })());
  }
  const results = await Promise.all(tasks);
  // Determine most common block number
  const counts: Record<string, number> = {};
  for (const r of results) if (r.blockNumber) counts[r.blockNumber] = (counts[r.blockNumber] || 0) + 1;
  const mostCommon = Object.keys(counts).reduce((a,b)=> counts[a] >= counts[b] ? a : b, Object.keys(counts)[0] || '');

  const latencies: LatencyMap = {};
  for (const r of results) {
    if (!r.success) continue;
    if (r.blockNumber && mostCommon && r.blockNumber !== mostCommon) continue; // out of sync remove
    latencies[r.url] = r.duration;
  }
  return { latencies, checkResults: results };
}

