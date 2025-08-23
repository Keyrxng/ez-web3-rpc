import { RPCHandler } from '../types/rpc-handler';
import type { HandlerConstructorConfig } from '../types/handler';

interface RunConfig {
	networkId: string;
	mode: 'fastest' | 'first';
}

function resolveRunConfig(): RunConfig {
	const cliNet = process.argv[2];
	const cliMode = process.argv[3];
	const networkId = (process.env.NETWORK_ID || cliNet || '1').trim();
	const mode = ((process.env.MODE || cliMode || 'fastest') === 'first' ? 'first' : 'fastest');
	return { networkId, mode };
}

async function initLegacyHandler(networkId: string): Promise<RPCHandler> {
	const cfg: HandlerConstructorConfig = {
		networkId: networkId as any,
		proxySettings: { retryCount: 3, retryDelay: 150 },
			settings: {
				tracking: 'limited',
				rpcTimeout: 4000,
				cacheRefreshCycles: 5,
				browserLocalStorage: false
			}
	};
	return new RPCHandler(cfg);
}

async function main() {
	const { networkId, mode } = resolveRunConfig();
	console.log(`[og-example] Using legacy RPCHandler (types/) for network ${networkId} in ${mode} mode.`);
	console.log('[og-example] MODE explanation: fastest => benchmark & pick fastest; first => race for first healthy.');

	const handler = await initLegacyHandler("100");

	// Initialize provider via chosen mode
	let provider = await handler.getFastestRpcProvider();

	if (!provider) {
		console.error('[og-example] Failed to initialize provider.');
		process.exit(1);
	}

	console.log(`[og-example] Selected provider: ${provider.connection.url}`);

	// Perform a couple of sample RPC calls with simple timeouts to avoid hanging forever
	async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
		return Promise.race([
			p,
			new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout after ${ms}ms`)), ms))
		]) as Promise<T>;
	}

	try {
		const blockNumber = await withTimeout(provider.getBlockNumber(), 15000, 'getBlockNumber');
		console.log(`[og-example] Latest block: ${blockNumber}`);
	} catch (e) {
		console.warn('[og-example] getBlockNumber failed', e);
	}

	try {
		const gasPrice: any = await withTimeout(provider.getGasPrice(), 15000, 'getGasPrice');
		console.log(`[og-example] Gas price: ${gasPrice?.toString?.()}`);
	} catch (e) {
		console.warn('[og-example] getGasPrice failed', e);
	}

	// Show sorted latency data (legacy handler stores keys prefixed with networkId__url)
	const latenciesEntries = Object.entries(handler.latencies || {})
		.filter(([k]) => k.startsWith(`${networkId}__`))
		.map(([k, v]) => [k.split('__')[1], v as number])
		.sort((a, b) => (a[1] as number) - (b[1] as number));

	if (latenciesEntries.length) {
		console.log('\n[og-example] Latencies (ms):');
		for (const [url, ms] of latenciesEntries) {
			console.log(`  ${url} -> ${(ms as number).toFixed(2)}`);
		}
		console.log(`\n[og-example] Fastest: ${latenciesEntries[0][0]} (${(latenciesEntries[0][1] as number).toFixed(2)} ms)`);
	} else {
		console.log('[og-example] No latency data captured yet. (May occur in firstAvailable mode)');
	}

	console.log('\n[og-example] Done.');
}

main().catch(err => {
	console.error('[og-example] Fatal error', err);
	process.exit(1);
});
