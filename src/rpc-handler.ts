import { JsonRpcProvider } from '@ethersproject/providers';
import { Rpc, RpcHandlerOptions, Strategy } from '../types/handler';
import { resolveConfig, NormalizedConfig } from './config/resolveConfig';
import { selectBaseRpcSet } from './rpc/selectBaseRpcSet';
import { getFastest } from './strategy/getFastest';
import { getFirstHealthy } from './strategy/getFirstHealthy';
import { createProvider } from './provider/createProvider';
import { wrapWithRetry } from './provider/retryProxy';
import { Logger, NoopLogger, BasicLogger } from './logging/logger';
import { RpcCalls } from './calls';
import { pruneDynamicData } from './utils';

/**
 * RPC Handler class for managing JSON-RPC providers.
 */
export class RPCHandler {
    private config: NormalizedConfig;
    public rpcs: Rpc[] = [];
    private provider: JsonRpcProvider | null = null;
    private latencies: Record<string, number> = {};
    private strategy: Strategy;
    private logger: Logger;
    public calls: RpcCalls;

    constructor(opts: RpcHandlerOptions) {
        this.config = resolveConfig(opts);
        this.strategy = opts.strategy || 'fastest';
    // Note: selection of base RPCs happens after optional pruning in init.
    this.rpcs = selectBaseRpcSet(this.config.networkId, this.config.tracking, this.config.injectedRpcs);
        this.logger = this.config.settings.logLevel === 'none' ? new NoopLogger() : new BasicLogger(this.config.settings.logLevel as any);
        if (this.config.settings.browserLocalStorage && typeof localStorage !== 'undefined') {
            try {
                const raw = localStorage.getItem(`rpcLatencies-${this.config.networkId}`);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.latencies) this.latencies = { ...parsed.latencies };
                }
            } catch {/* ignore */ }
        }
    this.calls = new RpcCalls(this);
    }

    async init(): Promise<void> {
        // If configured to prune dynamic data, do that immediately so all
        // downstream code (selectBaseRpcSet, type helpers) only see the
        // data for the configured network.
        if (this.config.settings.pruneUnusedData) {
            try {
                pruneDynamicData(this.config.networkId);
                this._log('info', 'Pruned dynamic network data to configured networkId', { networkId: this.config.networkId });
            } catch (e) {
                this._log('warn', 'Failed to prune dynamic data', { err: e });
            }
        }
        if (this.strategy === 'fastest') {
            const { fastest, latencies } = await getFastest(this.rpcs, { timeout: this.config.settings.rpcTimeout });
            if (!fastest) throw new Error('No RPC available');
            this.latencies = { ...latencies };
            this.provider = this._buildProvider(fastest);
            this._persist();
            this._log('ok', 'Initialized fastest provider', { url: fastest });
        } else {
            const firstHealthy = await getFirstHealthy(this.rpcs, { timeout: this.config.settings.rpcTimeout });
            if (!firstHealthy) throw new Error('No RPC available');
            this.provider = this._buildProvider(firstHealthy);
            this._persist();
            this._log('ok', 'Initialized first healthy provider', { url: firstHealthy });
        }
    }

    getProvider(): JsonRpcProvider {
        if (!this.provider) throw new Error('Provider not initialized');
        return this.provider;
    }

    /**
     * Helpful for consumers using an alternative Web3 lib
     * such as Viem, etc.
     */
    getProviderUrl(): string {
        if (!this.provider) throw new Error('Provider not initialized');
        return this.provider.connection.url;
    }

    getLatencies() { return { ...this.latencies }; }

    public _logProxy(level: string, message: string, metadata?: any) { this._log(level, message, metadata); }

    async refresh(): Promise<void> {
        if (this.strategy === 'fastest') {
            const { fastest, latencies } = await getFastest(this.rpcs, { timeout: this.config.settings.rpcTimeout });
            if (fastest) {
                this.latencies = { ...latencies };
                this.provider = this._buildProvider(fastest);
                this._persist();
                this._log('info', 'Refreshed fastest provider', { url: fastest });
            } else {
                this._log('warn', 'No fastest provider found');
            }
        } else {
            const firstHealthy = await getFirstHealthy(this.rpcs, { timeout: this.config.settings.rpcTimeout });
            if (firstHealthy) {
                this.provider = this._buildProvider(firstHealthy);
                this._persist();
                this._log('info', 'Refreshed first healthy provider', { url: firstHealthy });
            } else {
                this._log('warn', 'No healthy provider found');
            }
        }
    }

    private _buildProvider(url: string): JsonRpcProvider {
        const base = createProvider(url, Number(this.config.networkId));
        const ordered = Object.entries(this.latencies).sort((a, b) => a[1] - b[1]).map(([u]) => u);
        const wrapped = wrapWithRetry(base, {
            retryCount: this.config.retry.retryCount,
            retryDelay: this.config.retry.retryDelay,
            getOrderedUrls: () => ordered,
            chainId: Number(this.config.networkId),
            rpcCallTimeout: this.config.settings.rpcCallTimeout,
            onLog: (level, msg, meta) => this._log(level as any, msg, meta),
            refresh: async () => this.refresh()
        });
        return wrapped;
    }

    private _persist() {
        if (!this.config.settings.browserLocalStorage) return;
        if (typeof localStorage === 'undefined') return;
        try { localStorage.setItem(`rpcLatencies-${this.config.networkId}`, JSON.stringify({ latencies: this.latencies, refreshCounter: 0 })); } catch {/* ignore */ }
    }

    private _log(level: string, message: string, metadata?: any) {
        const allowed = this.config.settings.logLevel;
        if (allowed === 'none') return;
        if (allowed !== 'verbose' && level === 'verbose') return;
        this.logger.log(level === 'ok' ? 'info' : level as any, message, metadata);
    }
}