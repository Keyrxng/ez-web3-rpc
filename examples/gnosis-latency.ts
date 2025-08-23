import { RPCHandler } from '../src';

async function main() {
  const handler = new RPCHandler({
    networkId: '100', // Gnosis Chain ID
    proxySettings: { retryCount: 3, retryDelay: 100 },
    settings: {
      tracking: 'yes', // allow limited/no tracking providers to widen pool
      rpcTimeout: 4000,
      cacheRefreshCycles: 5,
      browserLocalStorage: false,
      logLevel: 'info',
    },
  });

  console.log('Initializing handler for Gnosis (chainId=100)...');
  await handler.init();

  const latencies = handler.getLatencies();
  const entries = Object.entries(latencies).sort((a,b)=>a[1]-b[1]);
  const fastest = entries[0];

  console.log('\nLatency results (ms):');
  for (const [url, ms] of entries) {
    console.log(`  ${url} -> ${ms.toFixed(2)}`);
  }

  if (fastest) {
    console.log(`\nFastest provider: ${fastest[0]} (${fastest[1].toFixed(2)} ms)`);
  } else {
    console.log('No providers measured.');
  }

  const now = performance.now();
  const provider = handler.getProvider();
  console.log('\nRequesting latest block number...');
  const latestBlock = await Promise.race([
    provider.getBlockNumber(),
    new Promise<number>((_, rej) => setTimeout(() => rej(new Error('getBlockNumber timeout after 15s')), 15000))
  ]).catch(err => { console.error('Failed to get block number', err); return -1; });
  if (latestBlock !== -1) console.log(`Connected via fastest provider. Latest block: ${latestBlock}`);

  console.log("req took: ", performance.now() - now, "ms");

  // ---------------- Consensus Examples ----------------
  try {
    console.log('\nRunning basic consensus for latest block header (eth_getBlockByNumber)...');
  const consensusBlock: any = await handler.calls.consensus({
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: ['latest', false],
      id: 1
  }, '0.5', { concurrency: 5, timeoutMs: 7000 });
    console.log('Consensus block hash:', consensusBlock?.hash);
  } catch (e) {
    console.error('Consensus failed:', e);
  }

  try {
    console.log('\nRunning BFT consensus (progressively lowering threshold) for chain id (eth_chainId)...');
  const chainIdHex: string = await handler.calls.bftConsensus({
      jsonrpc: '2.0',
      method: 'eth_chainId',
      params: [],
      id: 2
  }, '0.7', '0.33', { concurrency: 5, timeoutMs: 5000 });
    console.log('BFT consensus chainId:', chainIdHex, '->', parseInt(chainIdHex, 16));
  } catch (e) {
    console.error('BFT consensus failed:', e);
  }

  try {
    console.log('\nTesting active provider eth_call wrapper via tryRpcCall (simple net_version)...');
    const res = await handler.calls.tryRpcCall({
      jsonrpc: '2.0',
      method: 'net_version',
      params: [],
      id: 3
    });
    console.log('tryRpcCall result:', res);
  } catch (e) {
    console.error('tryRpcCall failed:', e);
  }
}

main().catch(err => {
  console.error('Script failed', err);
  process.exit(1);
});
