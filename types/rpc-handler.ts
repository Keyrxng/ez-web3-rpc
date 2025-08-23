import { JsonRpcProvider } from "@ethersproject/providers";
import { LOCAL_HOST, networkRpcs, networkIds, LOCAL_HOST_2 } from "./constants";
import { HandlerConstructorConfig, NetworkId, NetworkName, Rpc, Tracking } from "./handler";
import { Metadata, PrettyLogs, PrettyLogsWithOk } from "./logs";
import { RPCService } from "./rpc-service";
import { StorageService } from "./storage-service";
import { Security } from "./security";

const NO_RPCS_AVAILABLE = "No RPCs available";

function shuffleArray(array: object[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

export function getRpcUrls(rpcs: Rpc[]) {
  const urls: string[] = [];
  rpcs.forEach((rpc) => {
    if (typeof rpc == "string") {
      urls.push(rpc);
    } else {
      urls.push(rpc.url);
    }
  });
  return urls;
}

export class RPCHandler {
  private static _instance: RPCHandler | null = null;
  public rpcService: RPCService;
  public provider: JsonRpcProvider | null = null;
  public networkId: NetworkId;
  public networkName: NetworkName;
  public runtimeEnv: string = "node";
  public settings = {
    tracking: "none",
    rpcTimeout: 3000,
    cacheRefreshCycles: 10,
    autoStorage: false,
    logTier: "info"
  };
  public refreshLatencies: number = 0;
  public runtimeRpcs: string[] = [];
  public latencies: Record<string, number> = {};
  public networkRpcs: Rpc[];

  private _proxySettings: HandlerConstructorConfig["proxySettings"] = {
    retryCount: 3,
    retryDelay: 100,
  };

  public security: Security;

  private _logger: PrettyLogs = new PrettyLogs();

  constructor(config: HandlerConstructorConfig) {
    this.networkId = config.networkId;
    this.networkRpcs = this._filterRpcs(networkRpcs[this.networkId].rpcs, config.settings?.tracking || "none");
    this.networkName = networkIds[this.networkId];

    this._initialize(config);
    this.rpcService = new RPCService(this);
    this.security = new Security(this, this.rpcService);
  }

  /**
   * Loops through all RPCs for a given network id and returns a provider with the first successful network.
   */
  public async getFirstAvailableRpcProvider() {
    const rpcList = [...networkRpcs[this.networkId].rpcs].filter((rpc) => rpc.url.includes("https"));
    shuffleArray(rpcList);
    const rpcPromises = this.rpcService.createBlockRequestAndByteCodeRacePromises(rpcList.map((rpc) => rpc.url));
    for (const rpc of rpcList) {
      const results = await Promise.allSettled(rpcPromises[rpc.url] ?? []);
      const hasPassedAllChecks = results.every((res) => res && res.status === "fulfilled" && res.value.success);
      if (hasPassedAllChecks) {
        return new JsonRpcProvider({ url: rpc.url, skipFetchSetup: true }, Number(this.networkId));
      }
    }

    this.log("fatal", `Failed to find a working RPC`, { rpcList });
    return null;
  }

  public async getFastestRpcProvider(): Promise<JsonRpcProvider> {
    let fastest = await this.testRpcPerformance();

    if (fastest && fastest?.connection.url.includes("localhost") && !(this.networkId === "31337" || this.networkId === "1337")) {
      fastest = await this.testRpcPerformance();
    }

    this.provider = this.createProviderProxy(fastest, this);
    this.log("ok", `Provider initialized: `, { provider: this.provider?.connection.url });
    this.log("info", "Initialized RPC data:", { runTimeRpcs: this.runtimeRpcs, latencies: this.latencies });

    return this.provider;
  }

  /**
   * Creates a Proxy around the JsonRpcProvider to handle retries and logging
   *
   * If proxySettings.disabled, it will return the provider as is and
   * any retry or RPC reselection logic will be down to the user to implement
   */
  createProviderProxy(provider: JsonRpcProvider, handler: RPCHandler): JsonRpcProvider {
    return new Proxy(provider, {
      get: function (target: JsonRpcProvider, prop: keyof JsonRpcProvider) {
        // if it's not a function, return the property
        if (typeof target[prop] !== "function") {
          return target[prop];
        }
        if (typeof target[prop] === "function") {
          // eslint-disable-next-line sonarjs/cognitive-complexity -- 16/15 is acceptable
          return async function (...args: unknown[]) {
            try {
              // responses are the value result of the method call if they are successful
              const response = await (target[prop] as (...args: unknown[]) => Promise<unknown>)(...args);

              if (response) {
                handler.log(
                  "verbose",
                  `Successfully called provider method ${prop.toString()}`,
                  {
                    rpc: target.connection.url,
                    method: prop.toString(),
                    args,
                  }
                );
                return response;
              }
            } catch (e) {
              // first attempt with currently connected provider
              handler.log(
                "error",
                `Failed to call provider method ${prop.toString()}, retrying...`,
                {
                  rpc: target.connection.url,
                  method: prop.toString(),
                  args,
                  stack: e instanceof Error ? e.stack : String(e),
                }
              );
            }

            const sortedLatencies = Object.entries(handler.latencies).sort((a, b) => a[1] - b[1]);

            if (!sortedLatencies.length) {
              throw handler.log(
                "fatal",
                `${NO_RPCS_AVAILABLE}`,
                {
                  sortedLatencies,
                  networks: handler.networkRpcs
                }
              );
            }

            handler.log("debug", `Current provider failed, retrying with next fastest provider...`, {
              rpc: target.connection.url,
              method: prop.toString(),
              args,
            });

            // how many times we'll loop the whole list of RPCs
            let loops = handler._proxySettings.retryCount;
            let newProvider: JsonRpcProvider;
            let res: null | unknown = null;

            while (loops > 0) {
              for (const [rpc] of sortedLatencies) {
                handler.log("debug", `Connected to: ${rpc}`);
                try {
                  newProvider = new JsonRpcProvider(
                    {
                      url: rpc.split("__")[1],
                      skipFetchSetup: true,
                    },
                    Number(handler.networkId)
                  );
                  const response = (await (newProvider[prop] as (...args: unknown[]) => Promise<unknown>)(...args)) as { result?: unknown; error?: unknown };

                  if (response) {
                    handler.log(
                      "verbose",
                      `Successfully called provider method ${prop.toString()}`,
                      {
                        rpc: target.connection.url,
                        method: prop.toString(),
                        args,
                      }
                    );
                    res = response;

                    loops = 0;
                  }
                } catch (e) {
                  // last loop throw error
                  if (loops === 1) {
                    handler.log(
                      "fatal",
                      `Failed to call provider method ${prop.toString()} after ${handler._proxySettings.retryCount} attempts`,
                      {
                        rpc: target.connection.url,
                        method: prop.toString(),
                        args,
                      }
                    );
                    throw e;
                  } else {
                    handler.log("debug", `Retrying in ${handler._proxySettings.retryDelay}ms...`);
                    handler.log("debug", `Call number: ${handler._proxySettings.retryCount - loops + 1}`);

                    // delays here should be kept rather small
                    await new Promise((resolve) => setTimeout(resolve, handler._proxySettings.retryDelay));
                  }
                }
              }
              if (res) {
                break;
              }
              loops--;
            }

            return res;
          };
        }

        return target[prop]; // just in case
      },
    });
  }

  /**
   * runtimeRpcs are prefixed with the networkId so
   * they need to be stripped before being used
   */
  populateRuntimeFromNetwork(networkRpcs: string[]) {
    return networkRpcs.map((rpc) => {
      if (rpc.startsWith(`${this.networkId}__`)) {
        return rpc.split("__")[1];
      }

      return rpc;
    });
  }

  public async testRpcPerformance(): Promise<JsonRpcProvider> {
    const shouldRefreshRpcs =
      Object.keys(this.latencies)
        .filter((rpc) => rpc.startsWith(`${this.networkId}__`)).length <= 1
      || this.refreshLatencies >= this.settings.cacheRefreshCycles;

    this.manageRpcRefresh(shouldRefreshRpcs);
    await this._testRpcPerformance();
    const fastestRpcUrl = this._findFastestRpcFromLatencies();

    if (!fastestRpcUrl) {
      throw this.log(
        "fatal",
        `Failed to find fastest RPC`,
        {
          latencies: this.latencies,
          networkId: this.networkId,
        }
      );
    }

    this.provider = this.createProviderProxy(new JsonRpcProvider({ url: fastestRpcUrl, skipFetchSetup: true }, Number(this.networkId)), this);

    if (this.settings.autoStorage) {
      StorageService.setLatencies(this.runtimeEnv, this.latencies);
      StorageService.setRefreshLatencies(this.runtimeEnv, this.refreshLatencies);
    }

    if (!this.provider) {
      throw this.log(
        "fatal",
        `Failed to create provider`,
        {
          latencies: this.latencies,
          fastestRpcUrl: fastestRpcUrl,
        }
      );
    }

    return this.provider;
  }

  private manageRpcRefresh(shouldRefreshRpcs: boolean) {
    if (shouldRefreshRpcs) {
      // either the latencies are empty or we've reached the refresh cycle
      this.runtimeRpcs = getRpcUrls(this.networkRpcs);
      this.refreshLatencies = 0;
    } else if (this.latencies && Object.keys(this.latencies).length > 0) {
      // if we have latencies, we'll use them to populate the runtimeRpcs
      this.runtimeRpcs = this.populateRuntimeFromNetwork(Object.keys(this.latencies));
    } else if (this.runtimeRpcs.length === 0) {
      // if we have no latencies and no runtimeRpcs, we'll populate the runtimeRpcs from the networkRpcs
      this.runtimeRpcs = getRpcUrls(this.networkRpcs);
    }
  }

  public getProvider(): JsonRpcProvider {
    if (!this.provider) {
      throw this.log(
        "fatal",
        `Provider is not initialized`,
        {
          latencies: this.latencies,
          networkId: this.networkId,
          runtimeRpcs: this.runtimeRpcs,
          networkRpcs: this.networkRpcs,
        }
      );
    }
    return this.provider;
  }

  public static getInstance(config: HandlerConstructorConfig): RPCHandler {
    if (!RPCHandler._instance) {
      if (!config) {
        throw new Error("Config is required to initialize RPCHandler");
      }

      RPCHandler._instance = new RPCHandler(config);
    }
    return RPCHandler._instance;
  }

  public clearInstance(): void {
    RPCHandler._instance = null;
  }


  updateRpcProviderLatency(rpcUrl: string, latency: number): void {
    this.latencies[`${this.networkId}__${rpcUrl}`] = latency;
  }

  updateRuntimeRpc(rpcUrl: string, action: "add" | "remove"): void {
    if (action === "add") {
      this.runtimeRpcs.push(rpcUrl);
    } else {
      this.runtimeRpcs = this.runtimeRpcs.filter((rpc) => rpc !== rpcUrl);
    }
  }

  public getRefreshLatencies(): number {
    return this.refreshLatencies;
  }

  public getCacheRefreshCycles(): number {
    return this.settings.cacheRefreshCycles;
  }

  private async _testRpcPerformance(): Promise<void> {
    await this.rpcService.testRpcPerformance();
    this.refreshLatencies++;
    StorageService.setLatencies(this.runtimeEnv, this.latencies);
    StorageService.setRefreshLatencies(this.runtimeEnv, this.refreshLatencies);
  }


  private _findFastestRpcFromLatencies(): string | null {
    try {
      const validLatencies: Record<string, number> = Object.entries(this.latencies)
        .filter(([key]) => key.startsWith(`${this.networkId}__`))
        .reduce(
          (acc, [key, value]) => {
            acc[key] = value;
            return acc;
          },
          {} as Record<string, number>
        );

      return Object.keys(validLatencies)
        .reduce((a, b) => (validLatencies[a] < validLatencies[b] ? a : b))
        .split("__")[1];
    } catch (error) {
      this.log("error", "Failed to find fastest RPC", { er: String(error) });
      return null;
    }
  }

  private _filterRpcs(networks: Rpc[], tracking: Tracking) {
    const predicates: Record<Tracking, (rpc: Rpc) => boolean> = {
      yes: () => true,
      limited: (rpc) =>
        typeof rpc !== "string" && (rpc.tracking === "limited" || rpc.tracking === "none"),
      none: (rpc) => typeof rpc !== "string" && rpc.tracking === "none",
    };

    const pred = predicates[tracking];
    return pred ? networks.filter(pred) : [];
  }

  private _initialize(config: HandlerConstructorConfig): void {
    this.runtimeEnv = typeof window === "undefined" ? "node" : "browser";

    /**
     * Extract user injected custom RPCs (including localhost etc.)
     */
    let networkRpcsFromConfig: Rpc[] = config.settings?.networkRpcs || [];

    if (networkRpcsFromConfig.length > 0) {
      // If the network ID is a local development network, use local RPCs
      if (this.networkId === "31337" || this.networkId === "1337") {
        this.networkRpcs = [{ url: LOCAL_HOST }, { url: LOCAL_HOST_2 }];
      } else if (this.networkRpcs?.length > 0) {
        this.networkRpcs = [...this.networkRpcs, ...networkRpcsFromConfig];
      } else {
        this.networkRpcs = networkRpcsFromConfig;
      }
    }

    this._updateConfig(config);
  }

  private _updateConfig(config: HandlerConstructorConfig): void {
    if (config.proxySettings) {
      this._proxySettings = {
        ...this._proxySettings,
        ...config.proxySettings,
      };
    }

    if (config.settings) {
      this.settings.cacheRefreshCycles =
        config.settings.cacheRefreshCycles ?? this.settings.cacheRefreshCycles;
      this.settings.rpcTimeout =
        config.settings.rpcTimeout ?? this.settings.rpcTimeout;

      if (config.settings.autoStorage) {
        this.settings.autoStorage = true;
        this.latencies = StorageService.getLatencies(this.runtimeEnv, this.networkId);
        this.refreshLatencies = StorageService.getRefreshLatencies(this.runtimeEnv);
      }
    }
  }

  log(tier: PrettyLogsWithOk, message: string, metadata?: Metadata): void {
    let logTier = this.settings.logTier;

    if (logTier === "none") return;
    if (tier === "fatal") throw new Error(message + JSON.stringify(metadata));
    if (logTier === "verbose") this._logger?.log(tier, message, metadata);

    if (logTier === tier && tier !== "none") {
      const fn = tier === "ok" ? "info" : tier;
      this._logger?.[fn](message, metadata);
    }
  }
}
