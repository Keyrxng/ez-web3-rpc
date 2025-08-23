import type { RPCHandler } from '../rpc-handler';

export interface ConsensusOptions {
	timeoutMs?: number;        // per-request timeout
	concurrency?: number;      // max in-flight requests
	cooldownMs?: number;       // how long to skip endpoints after 429/5xx
}

export type JsonRpcRequest = {
	jsonrpc: string;
	method: string;
	params: any[];
	id: number;
	headers?: Record<string, string>;
};

export class RpcCalls {
	private _hadToStringify = false;
	// Persistent cooldown tracking across consensus calls
	private _cooldowns: Record<string, { until: number; strikes: number } > = {};
	constructor(private handler: RPCHandler) {}

	/**
	 * Basic consensus: require a quorum of identical responses across providers.
	 */
	async consensus<T = unknown>(
		req: JsonRpcRequest,
		quorumThreshold: `0.${number}`,
		options: ConsensusOptions = {}
	): Promise<T> {
		const attempt = await this._consensusAttempt<T>(req, quorumThreshold, options, { allowEarlyAbort: true });
		if (attempt.success) return attempt.value as T;
		throw new Error(`Could not reach consensus. Most common result: ${attempt.mostCommonKey ?? 'n/a'}`);
	}

	/**
	 * BFT-style consensus: iteratively lowers quorum requirement if initial threshold fails.
	 * Useful for heterogeneous nodes returning occasional mismatched data.
	 */
	async bftConsensus<T = unknown>(
		req: JsonRpcRequest,
		quorumThreshold: `0.${number}`,
		minThreshold: `0.${number}` = '0.33',
		options: ConsensusOptions = {}
	): Promise<T> {
		const start = parseFloat(quorumThreshold);
		const min = parseFloat(minThreshold);
		// Perform a single collection WITHOUT early abort so we can test descending thresholds without re-querying (reduces 429 spam)
		const baseAttempt = await this._consensusAttempt<T>(req, quorumThreshold, options, { allowEarlyAbort: false });
		if (baseAttempt.success) return baseAttempt.value as T;
		if (!baseAttempt.results.length) throw new Error('No successful RPC responses for BFT consensus');
		// Descend thresholds re-evaluating same result set
		let curr = start - 0.05; // we already tried start
		while (curr >= min) {
			const ratio = curr;
			const needed = Math.ceil(baseAttempt.results.length * ratio);
			if (needed === 0) break;
			const mostKey = baseAttempt.mostCommonKey;
			if (mostKey && baseAttempt.counts[mostKey] >= needed) {
				return this._hadToStringify ? JSON.parse(mostKey) : (mostKey as unknown as T);
			}
			curr = parseFloat((curr - 0.05).toFixed(2));
		}
		throw new Error('Could not reach BFT consensus down to minimum threshold');
	}

	/**
	 * Attempt an eth_call using the active provider (with proxy retries).
	 */
	async tryRpcCall(req: JsonRpcRequest): Promise<{ success: true; result: string } | { success: false; error: string }> {
		const provider = this.handler.getProvider();
		try {
			const result = await this._post(provider.connection.url, req);
			return { success: true, result };
		} catch (e) {
			this.handler._logProxy('error', 'eth_call failed after retries', { error: String(e) });
			return { success: false, error: String(e) };
		}
	}

	private _stableString(val: any): string | undefined {
		if (val === undefined || val === null) return;
		if (typeof val === 'string') return val;
		this._hadToStringify = true;
		return JSON.stringify(this._sortObject(val));
	}

	private _sortObject(obj: any): any {
		if (Array.isArray(obj)) return obj.map(i => (i && typeof i === 'object' ? this._sortObject(i) : i));
		if (obj && typeof obj === 'object') {
			return Object.keys(obj).sort().reduce((acc, k) => { acc[k] = this._sortObject(obj[k]); return acc; }, {} as any);
		}
		return obj;
	}

	private async _post(url: string, payload: JsonRpcRequest, timeoutMs = 8000): Promise<any> {
		const controller = new AbortController();
		const t = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const body = JSON.stringify({ jsonrpc: payload.jsonrpc, method: payload.method, params: payload.params, id: payload.id });
			const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(payload.headers || {}) };
			const res = await fetch(url, { method: 'POST', body, headers, signal: controller.signal });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return res.json();
		} finally {
			clearTimeout(t);
		}
	}

	// Internal consensus attempt returning rich metadata for reuse (e.g., BFT descent)
	private async _consensusAttempt<T>(
		req: JsonRpcRequest,
		quorumThreshold: `0.${number}`,
		options: ConsensusOptions,
		flags: { allowEarlyAbort: boolean }
	): Promise<{ success: boolean; value?: T; counts: Record<string, number>; results: any[]; mostCommonKey?: string; } > {
		// Reset stringify tracking for this attempt
		this._hadToStringify = false;
		const { timeoutMs = 8000, concurrency = 4, cooldownMs = 30_000 } = options;
		const targetQuorumRatio = parseFloat(quorumThreshold);
		// Collect candidate URLs (exclude websockets, and those under cooldown)
		const now = Date.now();
		let rpcUrls = this.handler.rpcs
			.map(r => (typeof (r as any) === 'string' ? String(r) : r.url))
			.filter(u => !!u && !u.startsWith('wss://'))
			.filter(u => {
				const cd = this._cooldowns[u];
				return !cd || cd.until <= now;
			});
		if (rpcUrls.length === 0) throw new Error('No RPCs available for consensus');
		if (rpcUrls.length === 1) throw new Error('Only one RPC available, could not reach consensus');
		// Randomize ordering slightly to avoid hammering same provider first
		rpcUrls = [...rpcUrls].sort(() => Math.random() - 0.5);

		const results: any[] = [];
		const counts: Record<string, number> = {};
		const keyToValue: Record<string, any> = {};
		let aborted = false;

		const maybeAbortEarly = (key: string) => {
			if (!flags.allowEarlyAbort) return;
			const processed = results.length;
			const dynamicQuorum = Math.ceil(processed * targetQuorumRatio);
			if (counts[key] >= dynamicQuorum) aborted = true;
		};

		const runRequest = async (url: string) => {
			if (aborted) return;
			try {
				const res = await this._post(url, req, timeoutMs);
				if (res && 'result' in res) {
					results.push(res.result);
					const key = this._stableString(res.result)!;
					counts[key] = (counts[key] || 0) + 1;
					if (!(key in keyToValue)) keyToValue[key] = res.result; // preserve original
					maybeAbortEarly(key);
				}
			} catch (e: any) {
				const msg = String(e);
				if (/HTTP 429/.test(msg) || /HTTP 5\d\d/.test(msg) || /TypeError: fetch failed/.test(msg)) {
					this._applyCooldown(url, cooldownMs, /429/.test(msg));
				}
				this.handler._logProxy('error', 'consensus rpc request failed', { url, method: req.method, error: msg });
			}
		};

		let index = 0;
		const launchNext = async (): Promise<void> => {
			if (aborted) return;
			const url = rpcUrls[index++];
			if (!url) return;
			await runRequest(url);
			return launchNext();
		};
		await Promise.all(Array.from({ length: Math.min(concurrency, rpcUrls.length) }, () => launchNext()));

		if (!results.length) return { success: false, counts, results };
		const processed = results.length;
		const finalQuorum = Math.ceil(processed * targetQuorumRatio);
		const keys = Object.keys(counts);
		const most = keys.reduce((a, b) => counts[a] > counts[b] ? a : b, keys[0]);
		if (most && counts[most] >= finalQuorum) {
			const value = keyToValue[most] as T;
			return { success: true, value, counts, results, mostCommonKey: most };
		}
		return { success: false, counts, results, mostCommonKey: most };
	}

	private _applyCooldown(url: string, baseMs: number, isRateLimit: boolean) {
		const existing = this._cooldowns[url];
		const strikes = (existing?.strikes || 0) + 1;
		// Exponential backoff with cap (rate limits grow faster)
		const factor = isRateLimit ? 2 : 1.5;
		const delay = Math.min(baseMs * Math.pow(factor, strikes - 1), 5 * 60_000); // cap 5 min
		this._cooldowns[url] = { strikes, until: Date.now() + delay };
		this.handler._logProxy('warn', 'cooling down provider', { url, strikes, delayMs: delay });
	}
}

export type RpcCallsModule = RpcCalls;
