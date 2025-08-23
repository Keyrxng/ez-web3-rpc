import { HandlerConstructorConfig, Tracking, Rpc } from '../../types/handler';

export interface NormalizedConfig {
  /** The network ID to use for RPC calls */
  networkId: string;
  /** The level of data you are okay with providers tracking  */
  tracking: Tracking;
  /** List of injected RPCs (localhost, anvil, etc)*/
  injectedRpcs: Rpc[];
  /** Retry settings for failed RPC calls */
  retry: {
    /** Number of retry attempts for failed RPC calls */
    retryCount: number;
    /** Delay between retry attempts (in milliseconds) */
    retryDelay: number;
  };
  settings: {
    /** Timeout for RPC latency testing (in milliseconds)*/
    rpcTimeout: number;
    /** Timeout for individual RPC calls (in milliseconds) */
    rpcCallTimeout: number;
    /** Whether to use browser localStorage for persisting latency cache */
    browserLocalStorage: boolean;
    /** Log level for this package including RPC calls. */
    logLevel: string;
  };
}

export function resolveConfig(config: HandlerConstructorConfig): NormalizedConfig {
  return {
    networkId: config.networkId,
    tracking: config.settings?.tracking || 'none',
    injectedRpcs: config.settings?.networkRpcs || [],
    retry: {
      retryCount: config.proxySettings?.retryCount ?? 3,
      retryDelay: config.proxySettings?.retryDelay ?? 100,
    },
    settings: {
      rpcTimeout: config.settings?.rpcTimeout ?? 3000,
      rpcCallTimeout: config.proxySettings?.rpcCallTimeout ?? 10000,
      browserLocalStorage: config.settings?.browserLocalStorage ?? false,
      logLevel: config.settings?.logLevel || 'info',
    },
  };
}
